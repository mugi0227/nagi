"""
SQLite implementation of meeting agenda repository.
"""

from __future__ import annotations

from datetime import datetime, date
from typing import Optional
from uuid import UUID, uuid4

from sqlalchemy import select, and_, update

from app.core.exceptions import NotFoundError
from app.infrastructure.local.database import MeetingAgendaItemORM, get_session_factory
from app.interfaces.meeting_agenda_repository import IMeetingAgendaRepository
from app.models.meeting_agenda import (
    MeetingAgendaItem,
    MeetingAgendaItemCreate,
    MeetingAgendaItemUpdate,
)


class SqliteMeetingAgendaRepository(IMeetingAgendaRepository):
    """SQLite implementation of meeting agenda repository."""

    def __init__(self, session_factory=None):
        self._session_factory = session_factory or get_session_factory()

    def _orm_to_model(self, orm: MeetingAgendaItemORM) -> MeetingAgendaItem:
        """Convert ORM object to Pydantic model."""
        return MeetingAgendaItem.model_validate(orm, from_attributes=True)

    async def create(
        self,
        user_id: str,
        meeting_id: Optional[UUID],
        data: MeetingAgendaItemCreate,
    ) -> MeetingAgendaItem:
        """Create agenda item. Either meeting_id or data.task_id must be provided."""
        if not meeting_id and not data.task_id:
            raise ValueError("Either meeting_id or task_id must be provided")

        async with self._session_factory() as session:
            orm = MeetingAgendaItemORM(
                id=str(uuid4()),
                meeting_id=str(meeting_id) if meeting_id else None,
                task_id=str(data.task_id) if data.task_id else None,
                user_id=user_id,
                title=data.title,
                description=data.description,
                duration_minutes=data.duration_minutes,
                order_index=data.order_index,
                is_completed=False,
                event_date=data.event_date,
            )
            session.add(orm)
            await session.commit()
            await session.refresh(orm)
            return self._orm_to_model(orm)

    async def get(
        self,
        user_id: str,
        agenda_item_id: UUID,
    ) -> Optional[MeetingAgendaItem]:
        async with self._session_factory() as session:
            result = await session.execute(
                select(MeetingAgendaItemORM).where(
                    and_(
                        MeetingAgendaItemORM.id == str(agenda_item_id),
                        MeetingAgendaItemORM.user_id == user_id,
                    )
                )
            )
            orm = result.scalar_one_or_none()
            return self._orm_to_model(orm) if orm else None

    async def get_by_id(self, agenda_item_id: UUID) -> Optional[MeetingAgendaItem]:
        async with self._session_factory() as session:
            result = await session.execute(
                select(MeetingAgendaItemORM).where(MeetingAgendaItemORM.id == str(agenda_item_id))
            )
            orm = result.scalar_one_or_none()
            return self._orm_to_model(orm) if orm else None

    async def list_by_meeting(
        self,
        user_id: str,
        meeting_id: UUID,
        event_date: Optional[date] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[MeetingAgendaItem]:
        async with self._session_factory() as session:
            conditions = [
                MeetingAgendaItemORM.meeting_id == str(meeting_id),
                MeetingAgendaItemORM.user_id == user_id,
            ]
            if event_date:
                conditions.append(MeetingAgendaItemORM.event_date == event_date)
            
            query = (
                select(MeetingAgendaItemORM)
                .where(and_(*conditions))
                .order_by(MeetingAgendaItemORM.event_date.asc(), MeetingAgendaItemORM.order_index.asc())
                .limit(limit)
                .offset(offset)
            )
            result = await session.execute(query)
            return [self._orm_to_model(orm) for orm in result.scalars().all()]

    async def list_by_task(
        self,
        user_id: str,
        task_id: UUID,
        limit: int = 100,
        offset: int = 0,
    ) -> list[MeetingAgendaItem]:
        """List all agenda items for a standalone meeting task."""
        async with self._session_factory() as session:
            query = (
                select(MeetingAgendaItemORM)
                .where(
                    and_(
                        MeetingAgendaItemORM.task_id == str(task_id),
                        MeetingAgendaItemORM.user_id == user_id,
                    )
                )
                .order_by(MeetingAgendaItemORM.order_index.asc())
                .limit(limit)
                .offset(offset)
            )
            result = await session.execute(query)
            return [self._orm_to_model(orm) for orm in result.scalars().all()]

    async def update(
        self,
        user_id: str,
        agenda_item_id: UUID,
        update_data: MeetingAgendaItemUpdate,
    ) -> MeetingAgendaItem:
        async with self._session_factory() as session:
            result = await session.execute(
                select(MeetingAgendaItemORM).where(
                    and_(
                        MeetingAgendaItemORM.id == str(agenda_item_id),
                        MeetingAgendaItemORM.user_id == user_id,
                    )
                )
            )
            orm = result.scalar_one_or_none()
            if not orm:
                raise NotFoundError(f"MeetingAgendaItem {agenda_item_id} not found")

            update_fields = update_data.model_dump(exclude_unset=True)
            for field, value in update_fields.items():
                if value is not None:
                    setattr(orm, field, value)

            orm.updated_at = datetime.utcnow()
            await session.commit()
            await session.refresh(orm)
            return self._orm_to_model(orm)

    async def delete(
        self,
        user_id: str,
        agenda_item_id: UUID,
    ) -> bool:
        async with self._session_factory() as session:
            result = await session.execute(
                select(MeetingAgendaItemORM).where(
                    and_(
                        MeetingAgendaItemORM.id == str(agenda_item_id),
                        MeetingAgendaItemORM.user_id == user_id,
                    )
                )
            )
            orm = result.scalar_one_or_none()
            if not orm:
                return False
            await session.delete(orm)
            await session.commit()
            return True

    async def reorder(
        self,
        user_id: str,
        ordered_ids: list[UUID],
        meeting_id: Optional[UUID] = None,
        task_id: Optional[UUID] = None,
    ) -> list[MeetingAgendaItem]:
        if not meeting_id and not task_id:
            raise ValueError("Either meeting_id or task_id must be provided")

        async with self._session_factory() as session:
            for index, item_id in enumerate(ordered_ids):
                conditions = [
                    MeetingAgendaItemORM.id == str(item_id),
                    MeetingAgendaItemORM.user_id == user_id,
                ]
                if meeting_id:
                    conditions.append(MeetingAgendaItemORM.meeting_id == str(meeting_id))
                if task_id:
                    conditions.append(MeetingAgendaItemORM.task_id == str(task_id))

                await session.execute(
                    update(MeetingAgendaItemORM)
                    .where(and_(*conditions))
                    .values(order_index=index, updated_at=datetime.utcnow())
                )
            await session.commit()

            if meeting_id:
                return await self.list_by_meeting(user_id, meeting_id)
            return await self.list_by_task(user_id, task_id)
