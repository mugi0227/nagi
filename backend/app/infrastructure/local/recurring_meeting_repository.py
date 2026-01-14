"""
SQLite implementation of recurring meeting repository.
"""

from __future__ import annotations

from datetime import datetime, time
from typing import Optional
from uuid import UUID, uuid4

from sqlalchemy import select, and_

from app.core.exceptions import NotFoundError
from app.infrastructure.local.database import RecurringMeetingORM, get_session_factory
from app.interfaces.recurring_meeting_repository import IRecurringMeetingRepository
from app.models.recurring_meeting import (
    RecurringMeeting,
    RecurringMeetingCreate,
    RecurringMeetingUpdate,
)


class SqliteRecurringMeetingRepository(IRecurringMeetingRepository):
    """SQLite implementation of recurring meeting repository."""

    def __init__(self, session_factory=None):
        self._session_factory = session_factory or get_session_factory()

    def _parse_time(self, value: str) -> time:
        return datetime.strptime(value, "%H:%M").time()

    def _format_time(self, value: time) -> str:
        return value.strftime("%H:%M")

    def _orm_to_model(self, orm: RecurringMeetingORM) -> RecurringMeeting:
        """Convert ORM object to Pydantic model."""
        return RecurringMeeting.model_validate(orm, from_attributes=True)

    async def create(self, user_id: str, data: RecurringMeetingCreate) -> RecurringMeeting:
        """Create a new recurring meeting."""
        async with self._session_factory() as session:
            orm = RecurringMeetingORM(
                id=str(uuid4()),
                user_id=user_id,
                project_id=str(data.project_id) if data.project_id else None,
                title=data.title,
                frequency=data.frequency.value,
                weekday=data.weekday,
                start_time=self._format_time(data.start_time),
                duration_minutes=data.duration_minutes,
                location=data.location,
                attendees=data.attendees,
                agenda_window_days=data.agenda_window_days,
                anchor_date=data.anchor_date,
                last_occurrence=None,
                is_active=data.is_active,
            )
            session.add(orm)
            await session.commit()
            await session.refresh(orm)
            return self._orm_to_model(orm)

    async def get(self, user_id: str, meeting_id: UUID, project_id: UUID | None = None) -> Optional[RecurringMeeting]:
        """Get a recurring meeting by ID. If project_id is given, uses project-based access."""
        async with self._session_factory() as session:
            if project_id:
                result = await session.execute(
                    select(RecurringMeetingORM).where(
                        and_(RecurringMeetingORM.id == str(meeting_id), RecurringMeetingORM.project_id == str(project_id))
                    )
                )
            else:
                result = await session.execute(
                    select(RecurringMeetingORM).where(
                        and_(RecurringMeetingORM.id == str(meeting_id), RecurringMeetingORM.user_id == user_id)
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
    ) -> list[RecurringMeeting]:
        async with self._session_factory() as session:
            conditions = [RecurringMeetingORM.user_id == user_id]
            if project_id is not None:
                conditions.append(RecurringMeetingORM.project_id == str(project_id))
            if not include_inactive:
                conditions.append(RecurringMeetingORM.is_active == 1)

            query = select(RecurringMeetingORM).where(and_(*conditions))
            query = query.order_by(RecurringMeetingORM.created_at.desc()).limit(limit).offset(offset)
            result = await session.execute(query)
            return [self._orm_to_model(orm) for orm in result.scalars().all()]

    async def update(
        self,
        user_id: str,
        meeting_id: UUID,
        update: RecurringMeetingUpdate,
        project_id: UUID | None = None,
    ) -> RecurringMeeting:
        """Update a recurring meeting. If project_id is given, uses project-based access."""
        async with self._session_factory() as session:
            if project_id:
                result = await session.execute(
                    select(RecurringMeetingORM).where(
                        and_(RecurringMeetingORM.id == str(meeting_id), RecurringMeetingORM.project_id == str(project_id))
                    )
                )
            else:
                result = await session.execute(
                    select(RecurringMeetingORM).where(
                        and_(RecurringMeetingORM.id == str(meeting_id), RecurringMeetingORM.user_id == user_id)
                    )
                )
            orm = result.scalar_one_or_none()
            if not orm:
                raise NotFoundError(f"RecurringMeeting {meeting_id} not found")

            update_data = update.model_dump(exclude_unset=True)
            for field, value in update_data.items():
                if value is None:
                    continue
                if field == "project_id":
                    value = str(value) if value else None
                elif field == "frequency":
                    value = value.value
                elif field == "start_time":
                    value = self._format_time(value)
                setattr(orm, field, value)

            orm.updated_at = datetime.utcnow()
            await session.commit()
            await session.refresh(orm)
            return self._orm_to_model(orm)

    async def delete(self, user_id: str, meeting_id: UUID, project_id: UUID | None = None) -> bool:
        """Delete a recurring meeting. If project_id is given, uses project-based access."""
        async with self._session_factory() as session:
            if project_id:
                result = await session.execute(
                    select(RecurringMeetingORM).where(
                        and_(RecurringMeetingORM.id == str(meeting_id), RecurringMeetingORM.project_id == str(project_id))
                    )
                )
            else:
                result = await session.execute(
                    select(RecurringMeetingORM).where(
                        and_(RecurringMeetingORM.id == str(meeting_id), RecurringMeetingORM.user_id == user_id)
                    )
                )
            orm = result.scalar_one_or_none()
            if not orm:
                return False

            await session.delete(orm)
            await session.commit()
            return True