"""
SQLite implementation of schedule settings repository.
"""

from __future__ import annotations

from typing import Optional

from sqlalchemy import select

from app.infrastructure.local.database import ScheduleSettingsORM, get_session_factory
from app.interfaces.schedule_settings_repository import IScheduleSettingsRepository
from app.models.schedule_plan import (
    ScheduleSettings,
    ScheduleSettingsUpdate,
    WorkdayHours,
    default_weekly_work_hours,
)
from app.utils.datetime_utils import now_utc


class SqliteScheduleSettingsRepository(IScheduleSettingsRepository):
    def _orm_to_model(self, orm: ScheduleSettingsORM) -> ScheduleSettings:
        weekly = [WorkdayHours(**entry) for entry in (orm.weekly_work_hours_json or [])]
        return ScheduleSettings(
            user_id=orm.user_id,
            weekly_work_hours=weekly,
            buffer_hours=orm.buffer_hours,
            break_after_task_minutes=orm.break_after_task_minutes,
            created_at=orm.created_at,
            updated_at=orm.updated_at,
        )

    async def get(self, user_id: str) -> Optional[ScheduleSettings]:
        session_factory = get_session_factory()
        async with session_factory() as session:
            result = await session.execute(
                select(ScheduleSettingsORM).where(ScheduleSettingsORM.user_id == user_id)
            )
            orm = result.scalar_one_or_none()
            return self._orm_to_model(orm) if orm else None

    async def upsert(self, user_id: str, update: ScheduleSettingsUpdate) -> ScheduleSettings:
        session_factory = get_session_factory()
        async with session_factory() as session:
            result = await session.execute(
                select(ScheduleSettingsORM).where(ScheduleSettingsORM.user_id == user_id)
            )
            orm = result.scalar_one_or_none()
            now = now_utc()
            if orm:
                if update.weekly_work_hours is not None:
                    orm.weekly_work_hours_json = [
                        entry.model_dump(mode="json") for entry in update.weekly_work_hours
                    ]
                if update.buffer_hours is not None:
                    orm.buffer_hours = update.buffer_hours
                if update.break_after_task_minutes is not None:
                    orm.break_after_task_minutes = update.break_after_task_minutes
                orm.updated_at = now
            else:
                weekly = update.weekly_work_hours or default_weekly_work_hours()
                orm = ScheduleSettingsORM(
                    user_id=user_id,
                    weekly_work_hours_json=[entry.model_dump(mode="json") for entry in weekly],
                    buffer_hours=update.buffer_hours if update.buffer_hours is not None else 1.0,
                    break_after_task_minutes=(
                        update.break_after_task_minutes if update.break_after_task_minutes is not None else 5
                    ),
                    created_at=now,
                    updated_at=now,
                )
                session.add(orm)
            await session.commit()
            await session.refresh(orm)
            return self._orm_to_model(orm)
