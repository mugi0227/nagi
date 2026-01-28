"""
SQLite implementation of Milestone repository.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import and_, select, update

from app.core.exceptions import NotFoundError
from app.infrastructure.local.database import MilestoneORM, TaskORM, get_session_factory
from app.interfaces.milestone_repository import IMilestoneRepository
from app.models.enums import MilestoneStatus
from app.models.milestone import Milestone, MilestoneCreate, MilestoneUpdate


class SqliteMilestoneRepository(IMilestoneRepository):
    """SQLite implementation of milestone repository."""

    def __init__(self, session_factory=None):
        """
        Initialize repository.

        Args:
            session_factory: Optional session factory (for testing)
        """
        self._session_factory = session_factory or get_session_factory()

    def _orm_to_model(self, orm: MilestoneORM) -> Milestone:
        """Convert ORM object to Pydantic model."""
        return Milestone.model_validate(orm, from_attributes=True)

    async def create(self, user_id: str, milestone: MilestoneCreate) -> Milestone:
        """Create a new milestone."""
        async with self._session_factory() as session:
            orm = MilestoneORM(
                id=str(uuid4()),
                user_id=user_id,
                project_id=str(milestone.project_id),
                phase_id=str(milestone.phase_id),
                title=milestone.title,
                description=milestone.description,
                order_in_phase=milestone.order_in_phase,
                due_date=milestone.due_date,
            )
            session.add(orm)
            await session.commit()
            await session.refresh(orm)
            return self._orm_to_model(orm)

    async def get_by_id(self, user_id: str, milestone_id: UUID, project_id: UUID | None = None) -> Milestone | None:
        """Get a milestone by ID. If project_id is given, uses project-based access."""
        async with self._session_factory() as session:
            if project_id:
                result = await session.execute(
                    select(MilestoneORM).where(
                        and_(MilestoneORM.id == str(milestone_id), MilestoneORM.project_id == str(project_id))
                    )
                )
            else:
                result = await session.execute(
                    select(MilestoneORM).where(
                        and_(MilestoneORM.id == str(milestone_id), MilestoneORM.user_id == user_id)
                    )
                )
            orm = result.scalar_one_or_none()
            return self._orm_to_model(orm) if orm else None

    async def get_project_id(self, milestone_id: UUID) -> UUID | None:
        """Get project ID for a milestone."""
        async with self._session_factory() as session:
            result = await session.execute(
                select(MilestoneORM.project_id).where(MilestoneORM.id == str(milestone_id))
            )
            pid = result.scalar_one_or_none()
            return UUID(pid) if pid else None

    async def list_by_phase(self, user_id: str, phase_id: UUID) -> list[Milestone]:
        """List milestones for a phase."""
        async with self._session_factory() as session:
            result = await session.execute(
                select(MilestoneORM)
                .where(MilestoneORM.phase_id == str(phase_id))
                .order_by(MilestoneORM.order_in_phase)
            )
            return [self._orm_to_model(orm) for orm in result.scalars().all()]

    async def list_by_project(self, user_id: str, project_id: UUID) -> list[Milestone]:
        """List milestones for a project."""
        async with self._session_factory() as session:
            result = await session.execute(
                select(MilestoneORM)
                .where(MilestoneORM.project_id == str(project_id))
                .order_by(MilestoneORM.phase_id, MilestoneORM.order_in_phase)
            )
            return [self._orm_to_model(orm) for orm in result.scalars().all()]

    async def update(self, user_id: str, milestone_id: UUID, project_id: UUID | None, update: MilestoneUpdate) -> Milestone:
        """Update a milestone. If project_id is given, uses project-based access."""
        async with self._session_factory() as session:
            if project_id:
                result = await session.execute(
                    select(MilestoneORM).where(
                        and_(MilestoneORM.id == str(milestone_id), MilestoneORM.project_id == str(project_id))
                    )
                )
            else:
                result = await session.execute(
                    select(MilestoneORM).where(
                        and_(MilestoneORM.id == str(milestone_id), MilestoneORM.user_id == user_id)
                    )
                )
            orm = result.scalar_one_or_none()
            if not orm:
                raise NotFoundError(f"Milestone {milestone_id} not found")
            
            update_data = update.model_dump(exclude_unset=True)
            for field, value in update_data.items():
                if value is not None:
                    if hasattr(value, "value"):
                        value = value.value
                    setattr(orm, field, value)
            
            orm.updated_at = datetime.utcnow()
            await session.commit()
            await session.refresh(orm)
            return self._orm_to_model(orm)

    async def delete(self, user_id: str, milestone_id: UUID, project_id: UUID | None) -> bool:
        """Delete a milestone. If project_id is given, uses project-based access. Returns True if deleted, False if not found.
        Also nullifies milestone_id on related tasks.
        """
        async with self._session_factory() as session:
            if project_id:
                result = await session.execute(
                    select(MilestoneORM).where(
                        and_(MilestoneORM.id == str(milestone_id), MilestoneORM.project_id == str(project_id))
                    )
                )
            else:
                result = await session.execute(
                    select(MilestoneORM).where(
                        and_(MilestoneORM.id == str(milestone_id), MilestoneORM.user_id == user_id)
                    )
                )
            orm = result.scalar_one_or_none()
            if not orm:
                return False

            # Nullify milestone_id on related tasks before deleting
            await session.execute(
                update(TaskORM)
                .where(TaskORM.milestone_id == str(milestone_id))
                .values(milestone_id=None)
            )

            await session.delete(orm)
            await session.commit()
            return True
