"""
SQLite implementation of daily schedule plan repository.
"""

from __future__ import annotations

from datetime import date
from typing import Optional
from uuid import UUID, uuid4

from sqlalchemy import and_, select

from app.infrastructure.local.database import DailySchedulePlanORM, get_session_factory
from app.interfaces.schedule_plan_repository import IDailySchedulePlanRepository
from app.models.schedule import ExcludedTask, ScheduleDay, TaskScheduleInfo, UnscheduledTask
from app.models.schedule_plan import (
    DailySchedulePlan,
    DailySchedulePlanCreate,
    ScheduleTimeBlock,
    TaskPlanSnapshot,
)
from app.utils.datetime_utils import now_utc


class SqliteDailySchedulePlanRepository(IDailySchedulePlanRepository):
    def _orm_to_model(self, orm: DailySchedulePlanORM) -> DailySchedulePlan:
        schedule_day = ScheduleDay(**orm.schedule_day_json)
        tasks = [TaskScheduleInfo(**entry) for entry in (orm.tasks_json or [])]
        unscheduled = [UnscheduledTask(**entry) for entry in (orm.unscheduled_json or [])]
        excluded = [ExcludedTask(**entry) for entry in (orm.excluded_json or [])]
        time_blocks = [ScheduleTimeBlock(**entry) for entry in (orm.time_blocks_json or [])]
        snapshots = [TaskPlanSnapshot(**entry) for entry in (orm.task_snapshots_json or [])]
        return DailySchedulePlan(
            id=UUID(orm.id),
            user_id=orm.user_id,
            plan_date=orm.plan_date,
            timezone=orm.timezone,
            plan_group_id=UUID(orm.plan_group_id),
            schedule_day=schedule_day,
            tasks=tasks,
            unscheduled_task_ids=unscheduled,
            excluded_tasks=excluded,
            time_blocks=time_blocks,
            task_snapshots=snapshots,
            pinned_overflow_task_ids=[UUID(entry) for entry in (orm.pinned_overflow_json or [])],
            plan_params=orm.plan_params_json or {},
            generated_at=orm.generated_at,
            updated_at=orm.updated_at,
        )

    async def upsert_many(
        self,
        user_id: str,
        plans: list[DailySchedulePlanCreate],
    ) -> list[DailySchedulePlan]:
        session_factory = get_session_factory()
        async with session_factory() as session:
            created: list[DailySchedulePlan] = []
            for plan in plans:
                orm = DailySchedulePlanORM(
                    id=str(uuid4()),
                    user_id=user_id,
                    plan_date=plan.plan_date,
                    timezone=plan.timezone,
                    plan_group_id=str(plan.plan_group_id),
                    schedule_day_json=plan.schedule_day.model_dump(mode="json"),
                    tasks_json=[entry.model_dump(mode="json") for entry in plan.tasks],
                    unscheduled_json=[entry.model_dump(mode="json") for entry in plan.unscheduled_task_ids],
                    excluded_json=[entry.model_dump(mode="json") for entry in plan.excluded_tasks],
                    time_blocks_json=[entry.model_dump(mode="json") for entry in plan.time_blocks],
                    task_snapshots_json=[entry.model_dump(mode="json") for entry in plan.task_snapshots],
                    pinned_overflow_json=[str(task_id) for task_id in plan.pinned_overflow_task_ids],
                    plan_params_json=plan.plan_params,
                    generated_at=plan.generated_at,
                    updated_at=now_utc(),
                )
                session.add(orm)
                await session.flush()
                await session.refresh(orm)
                created.append(self._orm_to_model(orm))
            await session.commit()
            return created

    async def get_by_date(
        self,
        user_id: str,
        plan_date: date,
    ) -> Optional[DailySchedulePlan]:
        session_factory = get_session_factory()
        async with session_factory() as session:
            result = await session.execute(
                select(DailySchedulePlanORM)
                .where(
                    DailySchedulePlanORM.user_id == user_id,
                    DailySchedulePlanORM.plan_date == plan_date,
                )
                .order_by(DailySchedulePlanORM.generated_at.desc())
            )
            orm = result.scalars().first()
            return self._orm_to_model(orm) if orm else None

    async def list_by_range(
        self,
        user_id: str,
        start_date: date,
        end_date: date,
    ) -> list[DailySchedulePlan]:
        session_factory = get_session_factory()
        async with session_factory() as session:
            result = await session.execute(
                select(DailySchedulePlanORM)
                .where(
                    and_(
                        DailySchedulePlanORM.user_id == user_id,
                        DailySchedulePlanORM.plan_date >= start_date,
                        DailySchedulePlanORM.plan_date <= end_date,
                    )
                )
                .order_by(
                    DailySchedulePlanORM.plan_date.asc(),
                    DailySchedulePlanORM.generated_at.desc(),
                )
            )
            orms = result.scalars().all()
            latest_by_date: dict[date, DailySchedulePlanORM] = {}
            for orm in orms:
                if orm.plan_date not in latest_by_date:
                    latest_by_date[orm.plan_date] = orm
            return [self._orm_to_model(orm) for orm in latest_by_date.values()]
