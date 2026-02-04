"""
SQLite implementation of meeting session repository.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4

from sqlalchemy import and_, desc, select

from app.infrastructure.local.database import MeetingSessionORM, get_session_factory
from app.interfaces.meeting_session_repository import IMeetingSessionRepository
from app.models.enums import MeetingSessionStatus
from app.models.meeting_session import (
    MeetingSession,
    MeetingSessionCreate,
    MeetingSessionUpdate,
)


class SqliteMeetingSessionRepository(IMeetingSessionRepository):
    """SQLite implementation of meeting session repository."""

    def __init__(self, session_factory=None):
        self._session_factory = session_factory or get_session_factory()

    def _orm_to_model(self, orm: MeetingSessionORM) -> MeetingSession:
        """Convert ORM object to Pydantic model."""
        return MeetingSession(
            id=UUID(orm.id),
            user_id=orm.user_id,
            task_id=UUID(orm.task_id),
            status=MeetingSessionStatus(orm.status),
            current_agenda_index=orm.current_agenda_index,
            transcript=orm.transcript,
            summary=orm.summary,
            started_at=orm.started_at,
            ended_at=orm.ended_at,
            created_at=orm.created_at,
            updated_at=orm.updated_at,
        )

    async def create(
        self,
        user_id: str,
        data: MeetingSessionCreate,
    ) -> MeetingSession:
        """Create a new meeting session."""
        async with self._session_factory() as session:
            orm = MeetingSessionORM(
                id=str(uuid4()),
                user_id=user_id,
                task_id=str(data.task_id),
                status=MeetingSessionStatus.PREPARATION.value,
                current_agenda_index=None,
                transcript=None,
                summary=None,
                started_at=None,
                ended_at=None,
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow(),
            )
            session.add(orm)
            await session.commit()
            await session.refresh(orm)
            return self._orm_to_model(orm)

    async def get(
        self,
        user_id: str,
        session_id: UUID,
    ) -> Optional[MeetingSession]:
        """Get a session by ID."""
        async with self._session_factory() as session:
            result = await session.execute(
                select(MeetingSessionORM).where(
                    and_(
                        MeetingSessionORM.id == str(session_id),
                        MeetingSessionORM.user_id == user_id,
                    )
                )
            )
            orm = result.scalar_one_or_none()
            return self._orm_to_model(orm) if orm else None

    async def get_by_task(
        self,
        user_id: str,
        task_id: UUID,
    ) -> Optional[MeetingSession]:
        """Get the active session for a task (not COMPLETED)."""
        async with self._session_factory() as session:
            result = await session.execute(
                select(MeetingSessionORM)
                .where(
                    and_(
                        MeetingSessionORM.task_id == str(task_id),
                        MeetingSessionORM.user_id == user_id,
                        MeetingSessionORM.status != MeetingSessionStatus.COMPLETED.value,
                    )
                )
                .order_by(desc(MeetingSessionORM.created_at))
                .limit(1)
            )
            orm = result.scalar_one_or_none()
            return self._orm_to_model(orm) if orm else None

    async def get_latest_by_task(
        self,
        user_id: str,
        task_id: UUID,
    ) -> Optional[MeetingSession]:
        """Get the most recent session for a task (any status)."""
        async with self._session_factory() as session:
            result = await session.execute(
                select(MeetingSessionORM)
                .where(
                    and_(
                        MeetingSessionORM.task_id == str(task_id),
                        MeetingSessionORM.user_id == user_id,
                    )
                )
                .order_by(desc(MeetingSessionORM.created_at))
                .limit(1)
            )
            orm = result.scalar_one_or_none()
            return self._orm_to_model(orm) if orm else None

    async def update(
        self,
        user_id: str,
        session_id: UUID,
        data: MeetingSessionUpdate,
    ) -> Optional[MeetingSession]:
        """Update a session."""
        async with self._session_factory() as session:
            result = await session.execute(
                select(MeetingSessionORM).where(
                    and_(
                        MeetingSessionORM.id == str(session_id),
                        MeetingSessionORM.user_id == user_id,
                    )
                )
            )
            orm = result.scalar_one_or_none()
            if not orm:
                return None

            update_fields = data.model_dump(exclude_unset=True)
            for field, value in update_fields.items():
                if field == "status" and value is not None:
                    setattr(orm, field, value.value)
                elif value is not None:
                    setattr(orm, field, value)

            orm.updated_at = datetime.utcnow()
            await session.commit()
            await session.refresh(orm)
            return self._orm_to_model(orm)

    async def delete(
        self,
        user_id: str,
        session_id: UUID,
    ) -> bool:
        """Delete a session."""
        async with self._session_factory() as session:
            result = await session.execute(
                select(MeetingSessionORM).where(
                    and_(
                        MeetingSessionORM.id == str(session_id),
                        MeetingSessionORM.user_id == user_id,
                    )
                )
            )
            orm = result.scalar_one_or_none()
            if not orm:
                return False
            await session.delete(orm)
            await session.commit()
            return True

    async def list_by_user(
        self,
        user_id: str,
        limit: int = 50,
        offset: int = 0,
    ) -> list[MeetingSession]:
        """List sessions for a user, ordered by created_at desc."""
        async with self._session_factory() as session:
            result = await session.execute(
                select(MeetingSessionORM)
                .where(MeetingSessionORM.user_id == user_id)
                .order_by(desc(MeetingSessionORM.created_at))
                .limit(limit)
                .offset(offset)
            )
            return [self._orm_to_model(orm) for orm in result.scalars().all()]
