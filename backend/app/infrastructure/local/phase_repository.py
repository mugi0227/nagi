"""
SQLite implementation of Phase repository.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4

from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.interfaces.phase_repository import IPhaseRepository
from app.models.phase import Phase, PhaseCreate, PhaseUpdate, PhaseWithTaskCount
from app.models.enums import PhaseStatus, TaskStatus
from app.infrastructure.local.database import PhaseORM, TaskORM, get_session_factory


class SqlitePhaseRepository(IPhaseRepository):
    """SQLite implementation of phase repository."""

    def __init__(self, session_factory=None):
        """
        Initialize repository.

        Args:
            session_factory: Optional session factory (for testing)
        """
        self._session_factory = session_factory or get_session_factory()

    def _orm_to_model(self, orm: PhaseORM) -> Phase:
        """Convert ORM object to Pydantic model."""
        return Phase(
            id=UUID(orm.id),
            user_id=orm.user_id,
            project_id=UUID(orm.project_id),
            name=orm.name,
            description=orm.description,
            status=PhaseStatus(orm.status),
            order_in_project=orm.order_in_project,
            start_date=orm.start_date,
            end_date=orm.end_date,
            created_at=orm.created_at,
            updated_at=orm.updated_at,
        )

    async def create(self, user_id: str, phase: PhaseCreate) -> Phase:
        """Create a new phase."""
        async with self._session_factory() as session:
            orm = PhaseORM(
                id=str(uuid4()),
                user_id=user_id,
                project_id=str(phase.project_id),
                name=phase.name,
                description=phase.description,
                order_in_project=phase.order_in_project,
                start_date=phase.start_date,
                end_date=phase.end_date,
            )
            session.add(orm)
            await session.commit()
            await session.refresh(orm)
            return self._orm_to_model(orm)

    async def get_by_id(self, user_id: str, phase_id: UUID) -> Phase | None:
        """Get a phase by ID."""
        async with self._session_factory() as session:
            result = await session.execute(
                select(PhaseORM).where(
                    and_(PhaseORM.id == str(phase_id), PhaseORM.user_id == user_id)
                )
            )
            orm = result.scalar_one_or_none()
            return self._orm_to_model(orm) if orm else None

    async def list_by_project(
        self, user_id: str, project_id: UUID
    ) -> list[PhaseWithTaskCount]:
        """List all phases for a project with task counts."""
        async with self._session_factory() as session:
            # Get phases
            phase_result = await session.execute(
                select(PhaseORM)
                .where(
                    and_(
                        PhaseORM.project_id == str(project_id),
                        PhaseORM.user_id == user_id,
                    )
                )
                .order_by(PhaseORM.order_in_project)
            )
            phases = phase_result.scalars().all()

            # Get task counts for each phase
            result_with_counts = []
            for phase_orm in phases:
                # Count total tasks
                total_result = await session.execute(
                    select(func.count(TaskORM.id)).where(
                        and_(
                            TaskORM.phase_id == phase_orm.id,
                            TaskORM.user_id == user_id,
                        )
                    )
                )
                total_tasks = total_result.scalar() or 0

                # Count completed tasks
                completed_result = await session.execute(
                    select(func.count(TaskORM.id)).where(
                        and_(
                            TaskORM.phase_id == phase_orm.id,
                            TaskORM.user_id == user_id,
                            TaskORM.status == TaskStatus.DONE.value,
                        )
                    )
                )
                completed_tasks = completed_result.scalar() or 0

                # Count in-progress tasks
                in_progress_result = await session.execute(
                    select(func.count(TaskORM.id)).where(
                        and_(
                            TaskORM.phase_id == phase_orm.id,
                            TaskORM.user_id == user_id,
                            TaskORM.status == TaskStatus.IN_PROGRESS.value,
                        )
                    )
                )
                in_progress_tasks = in_progress_result.scalar() or 0

                phase_model = self._orm_to_model(phase_orm)
                result_with_counts.append(
                    PhaseWithTaskCount(
                        **phase_model.model_dump(),
                        total_tasks=total_tasks,
                        completed_tasks=completed_tasks,
                        in_progress_tasks=in_progress_tasks,
                    )
                )

            return result_with_counts

    async def update(self, user_id: str, phase_id: UUID, update: PhaseUpdate) -> Phase:
        """Update a phase."""
        async with self._session_factory() as session:
            result = await session.execute(
                select(PhaseORM).where(
                    and_(PhaseORM.id == str(phase_id), PhaseORM.user_id == user_id)
                )
            )
            orm = result.scalar_one_or_none()

            if not orm:
                raise NotFoundError(f"Phase {phase_id} not found")

            update_data = update.model_dump(exclude_unset=True)
            for field, value in update_data.items():
                if value is not None:
                    if hasattr(value, "value"):  # Enum
                        value = value.value
                    setattr(orm, field, value)

            orm.updated_at = datetime.utcnow()

            await session.commit()
            await session.refresh(orm)
            return self._orm_to_model(orm)

    async def delete(self, user_id: str, phase_id: UUID) -> bool:
        """Delete a phase. Returns True if deleted, False if not found."""
        async with self._session_factory() as session:
            result = await session.execute(
                select(PhaseORM).where(
                    and_(PhaseORM.id == str(phase_id), PhaseORM.user_id == user_id)
                )
            )
            orm = result.scalar_one_or_none()

            if not orm:
                return False

            await session.delete(orm)
            await session.commit()
            return True
