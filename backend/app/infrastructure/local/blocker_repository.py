"""
SQLite implementation of blocker repository.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4

from sqlalchemy import select, and_

from app.core.exceptions import NotFoundError
from app.infrastructure.local.database import BlockerORM, TaskORM, get_session_factory
from app.interfaces.blocker_repository import IBlockerRepository
from app.models.collaboration import Blocker, BlockerCreate, BlockerUpdate
from app.models.enums import BlockerStatus
from app.utils.datetime_utils import now_utc


class SqliteBlockerRepository(IBlockerRepository):
    """SQLite implementation of blocker repository."""

    def __init__(self, session_factory=None):
        self._session_factory = session_factory or get_session_factory()

    def _orm_to_model(self, orm: BlockerORM) -> Blocker:
        return Blocker(
            id=UUID(orm.id),
            user_id=orm.user_id,
            task_id=UUID(orm.task_id),
            created_by=orm.created_by,
            status=BlockerStatus(orm.status),
            reason=orm.reason,
            resolved_by=orm.resolved_by,
            created_at=orm.created_at,
            resolved_at=orm.resolved_at,
        )

    async def create(self, user_id: str, task_id: UUID, blocker: BlockerCreate) -> Blocker:
        async with self._session_factory() as session:
            orm = BlockerORM(
                id=str(uuid4()),
                user_id=user_id,
                task_id=str(task_id),
                created_by=blocker.created_by,
                status=BlockerStatus.OPEN.value,
                reason=blocker.reason,
                resolved_by=None,
                created_at=now_utc(),
            )
            session.add(orm)
            await session.commit()
            await session.refresh(orm)
            return self._orm_to_model(orm)

    async def get(self, user_id: str, blocker_id: UUID) -> Optional[Blocker]:
        async with self._session_factory() as session:
            result = await session.execute(
                select(BlockerORM).where(
                    and_(BlockerORM.id == str(blocker_id), BlockerORM.user_id == user_id)
                )
            )
            orm = result.scalar_one_or_none()
            return self._orm_to_model(orm) if orm else None

    async def list_by_task(self, user_id: str, task_id: UUID) -> list[Blocker]:
        async with self._session_factory() as session:
            result = await session.execute(
                select(BlockerORM).where(
                    and_(
                        BlockerORM.user_id == user_id,
                        BlockerORM.task_id == str(task_id),
                    )
                ).order_by(BlockerORM.created_at.desc())
            )
            return [self._orm_to_model(orm) for orm in result.scalars().all()]

    async def list_by_project(self, user_id: str, project_id: UUID) -> list[Blocker]:
        """List blockers for a project (project-based access)."""
        async with self._session_factory() as session:
            # Project-based: find tasks by project_id only
            task_ids_result = await session.execute(
                select(TaskORM.id).where(TaskORM.project_id == str(project_id))
            )
            task_ids = [row[0] for row in task_ids_result.fetchall()]
            if not task_ids:
                return []
            result = await session.execute(
                select(BlockerORM).where(
                    BlockerORM.task_id.in_(task_ids)
                ).order_by(BlockerORM.created_at.desc())
            )
            return [self._orm_to_model(orm) for orm in result.scalars().all()]

    async def update(
        self, user_id: str, blocker_id: UUID, update: BlockerUpdate
    ) -> Blocker:
        async with self._session_factory() as session:
            result = await session.execute(
                select(BlockerORM).where(
                    and_(BlockerORM.id == str(blocker_id), BlockerORM.user_id == user_id)
                )
            )
            orm = result.scalar_one_or_none()
            if not orm:
                raise NotFoundError(f"Blocker {blocker_id} not found")

            update_data = update.model_dump(exclude_unset=True)
            for field, value in update_data.items():
                if value is None:
                    continue
                if hasattr(value, "value"):
                    value = value.value
                setattr(orm, field, value)

            if update.status == BlockerStatus.RESOLVED:
                orm.resolved_at = now_utc()
            await session.commit()
            await session.refresh(orm)
            return self._orm_to_model(orm)
