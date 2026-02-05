"""
SQLite implementation of recurring task repository.
"""

from __future__ import annotations

from datetime import datetime, time
from typing import Optional
from uuid import UUID, uuid4

from sqlalchemy import and_, select

from app.core.exceptions import NotFoundError
from app.infrastructure.local.database import RecurringTaskORM, get_session_factory
from app.interfaces.recurring_task_repository import IRecurringTaskRepository
from app.models.recurring_task import (
    RecurringTask,
    RecurringTaskCreate,
    RecurringTaskUpdate,
)


class SqliteRecurringTaskRepository(IRecurringTaskRepository):
    """SQLite implementation of recurring task repository."""

    def __init__(self, session_factory=None):
        self._session_factory = session_factory or get_session_factory()

    def _parse_time(self, value: str | None) -> time | None:
        if not value:
            return None
        return datetime.strptime(value, "%H:%M").time()

    def _format_time(self, value: time | None) -> str | None:
        if not value:
            return None
        return value.strftime("%H:%M")

    def _orm_to_model(self, orm: RecurringTaskORM) -> RecurringTask:
        """Convert ORM object to Pydantic model."""
        return RecurringTask.model_validate(orm, from_attributes=True)

    async def create(self, user_id: str, data: RecurringTaskCreate) -> RecurringTask:
        """Create a new recurring task definition."""
        async with self._session_factory() as session:
            orm = RecurringTaskORM(
                id=str(uuid4()),
                user_id=user_id,
                project_id=str(data.project_id) if data.project_id else None,
                phase_id=str(data.phase_id) if data.phase_id else None,
                title=data.title,
                description=data.description,
                purpose=data.purpose,
                frequency=data.frequency.value,
                weekday=data.weekday,
                weekdays=data.weekdays,
                day_of_month=data.day_of_month,
                custom_interval_days=data.custom_interval_days,
                start_time=self._format_time(data.start_time),
                estimated_minutes=data.estimated_minutes,
                importance=data.importance.value,
                urgency=data.urgency.value,
                energy_level=data.energy_level.value,
                anchor_date=data.anchor_date,
                last_generated_date=None,
                is_active=data.is_active,
            )
            session.add(orm)
            await session.commit()
            await session.refresh(orm)
            return self._orm_to_model(orm)

    async def get(
        self, user_id: str, recurring_task_id: UUID, project_id: UUID | None = None
    ) -> Optional[RecurringTask]:
        """Get a recurring task by ID."""
        async with self._session_factory() as session:
            if project_id:
                result = await session.execute(
                    select(RecurringTaskORM).where(
                        and_(
                            RecurringTaskORM.id == str(recurring_task_id),
                            RecurringTaskORM.project_id == str(project_id),
                        )
                    )
                )
            else:
                result = await session.execute(
                    select(RecurringTaskORM).where(
                        and_(
                            RecurringTaskORM.id == str(recurring_task_id),
                            RecurringTaskORM.user_id == user_id,
                        )
                    )
                )
            orm = result.scalar_one_or_none()
            return self._orm_to_model(orm) if orm else None

    async def list(
        self,
        user_id: str,
        project_id: Optional[UUID] = None,
        include_inactive: bool = False,
        limit: int = 100,
        offset: int = 0,
    ) -> list[RecurringTask]:
        """List recurring task definitions."""
        async with self._session_factory() as session:
            conditions = [RecurringTaskORM.user_id == user_id]
            if project_id is not None:
                conditions.append(RecurringTaskORM.project_id == str(project_id))
            if not include_inactive:
                conditions.append(RecurringTaskORM.is_active == 1)

            query = select(RecurringTaskORM).where(and_(*conditions))
            query = query.order_by(RecurringTaskORM.created_at.desc()).limit(limit).offset(offset)
            result = await session.execute(query)
            return [self._orm_to_model(orm) for orm in result.scalars().all()]

    async def update(
        self,
        user_id: str,
        recurring_task_id: UUID,
        update: RecurringTaskUpdate,
        project_id: UUID | None = None,
    ) -> RecurringTask:
        """Update a recurring task definition."""
        async with self._session_factory() as session:
            if project_id:
                result = await session.execute(
                    select(RecurringTaskORM).where(
                        and_(
                            RecurringTaskORM.id == str(recurring_task_id),
                            RecurringTaskORM.project_id == str(project_id),
                        )
                    )
                )
            else:
                result = await session.execute(
                    select(RecurringTaskORM).where(
                        and_(
                            RecurringTaskORM.id == str(recurring_task_id),
                            RecurringTaskORM.user_id == user_id,
                        )
                    )
                )
            orm = result.scalar_one_or_none()
            if not orm:
                raise NotFoundError(f"RecurringTask {recurring_task_id} not found")

            update_data = update.model_dump(exclude_unset=True)
            for field, value in update_data.items():
                if value is None:
                    continue
                if field in ("project_id", "phase_id"):
                    value = str(value) if value else None
                elif field == "frequency":
                    value = value.value
                elif field == "start_time" and isinstance(value, time):
                    value = self._format_time(value)
                elif field in ("importance", "urgency", "energy_level"):
                    value = value.value if hasattr(value, "value") else value
                setattr(orm, field, value)

            orm.updated_at = datetime.utcnow()
            await session.commit()
            await session.refresh(orm)
            return self._orm_to_model(orm)

    async def delete(
        self, user_id: str, recurring_task_id: UUID, project_id: UUID | None = None
    ) -> bool:
        """Delete a recurring task definition."""
        async with self._session_factory() as session:
            if project_id:
                result = await session.execute(
                    select(RecurringTaskORM).where(
                        and_(
                            RecurringTaskORM.id == str(recurring_task_id),
                            RecurringTaskORM.project_id == str(project_id),
                        )
                    )
                )
            else:
                result = await session.execute(
                    select(RecurringTaskORM).where(
                        and_(
                            RecurringTaskORM.id == str(recurring_task_id),
                            RecurringTaskORM.user_id == user_id,
                        )
                    )
                )
            orm = result.scalar_one_or_none()
            if not orm:
                return False

            await session.delete(orm)
            await session.commit()
            return True
