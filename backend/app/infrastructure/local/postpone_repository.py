"""
SQLite implementation of postpone repository.
"""

from __future__ import annotations

from datetime import date
from typing import Optional
from uuid import UUID, uuid4

from sqlalchemy import select, and_, func

from app.infrastructure.local.database import PostponeEventORM, get_session_factory
from app.interfaces.postpone_repository import IPostponeRepository
from app.models.postpone import PostponeEvent
from app.utils.datetime_utils import now_utc


class SqlitePostponeRepository(IPostponeRepository):
    """SQLite implementation of postpone repository."""

    def __init__(self, session_factory=None):
        self._session_factory = session_factory or get_session_factory()

    def _orm_to_model(self, orm: PostponeEventORM) -> PostponeEvent:
        return PostponeEvent(
            id=UUID(orm.id),
            user_id=orm.user_id,
            task_id=UUID(orm.task_id),
            from_date=orm.from_date,
            to_date=orm.to_date,
            reason=orm.reason,
            pinned=bool(orm.pinned),
            created_at=orm.created_at,
        )

    async def create(
        self,
        user_id: str,
        task_id: UUID,
        from_date: date,
        to_date: date,
        reason: Optional[str] = None,
        pinned: bool = False,
    ) -> PostponeEvent:
        async with self._session_factory() as session:
            orm = PostponeEventORM(
                id=str(uuid4()),
                user_id=user_id,
                task_id=str(task_id),
                from_date=from_date,
                to_date=to_date,
                reason=reason,
                pinned=pinned,
                created_at=now_utc(),
            )
            session.add(orm)
            await session.commit()
            await session.refresh(orm)
            return self._orm_to_model(orm)

    async def list_by_task(
        self, user_id: str, task_id: UUID, limit: int = 50
    ) -> list[PostponeEvent]:
        async with self._session_factory() as session:
            result = await session.execute(
                select(PostponeEventORM)
                .where(
                    and_(
                        PostponeEventORM.user_id == user_id,
                        PostponeEventORM.task_id == str(task_id),
                    )
                )
                .order_by(PostponeEventORM.created_at.desc())
                .limit(limit)
            )
            return [self._orm_to_model(orm) for orm in result.scalars().all()]

    async def list_by_user(
        self, user_id: str, since: Optional[date] = None, limit: int = 100
    ) -> list[PostponeEvent]:
        async with self._session_factory() as session:
            query = select(PostponeEventORM).where(
                PostponeEventORM.user_id == user_id
            )
            if since:
                query = query.where(PostponeEventORM.from_date >= since)
            result = await session.execute(
                query.order_by(PostponeEventORM.created_at.desc()).limit(limit)
            )
            return [self._orm_to_model(orm) for orm in result.scalars().all()]

    async def count_by_task(self, user_id: str, task_id: UUID) -> int:
        async with self._session_factory() as session:
            result = await session.execute(
                select(func.count())
                .select_from(PostponeEventORM)
                .where(
                    and_(
                        PostponeEventORM.user_id == user_id,
                        PostponeEventORM.task_id == str(task_id),
                    )
                )
            )
            return result.scalar() or 0
