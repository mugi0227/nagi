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
        return Phase.model_validate(orm, from_attributes=True)

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
            await session.flush()
            await self._reorder_in_project(
                session,
                user_id=user_id,
                project_id=str(phase.project_id),
                target_id=orm.id,
                target_order=phase.order_in_project,
            )
            await session.commit()
            await session.refresh(orm)
            return self._orm_to_model(orm)

    async def get_by_id(self, user_id: str, phase_id: UUID, project_id: UUID | None = None) -> Phase | None:
        """Get a phase by ID. If project_id is given, uses project-based access."""
        async with self._session_factory() as session:
            if project_id:
                result = await session.execute(
                    select(PhaseORM).where(
                        and_(PhaseORM.id == str(phase_id), PhaseORM.project_id == str(project_id))
                    )
                )
            else:
                result = await session.execute(
                    select(PhaseORM).where(
                        and_(PhaseORM.id == str(phase_id), PhaseORM.user_id == user_id)
                    )
                )
            orm = result.scalar_one_or_none()
            return self._orm_to_model(orm) if orm else None

    async def get_project_id(self, phase_id: UUID) -> UUID | None:
        """Get project ID for a phase."""
        async with self._session_factory() as session:
            result = await session.execute(
                select(PhaseORM.project_id).where(PhaseORM.id == str(phase_id))
            )
            pid = result.scalar_one_or_none()
            return UUID(pid) if pid else None

    async def list_by_project(
        self, user_id: str, project_id: UUID
    ) -> list[PhaseWithTaskCount]:
        """List all phases for a project with task counts (project-based access)."""
        async with self._session_factory() as session:
            # Get phases - project-based access: filter by project_id only
            phase_result = await session.execute(
                select(PhaseORM)
                .where(PhaseORM.project_id == str(project_id))
                .order_by(PhaseORM.order_in_project)
            )
            phases = phase_result.scalars().all()
            if phases:
                expected_orders = list(range(1, len(phases) + 1))
                actual_orders = sorted(phase.order_in_project for phase in phases)
                if actual_orders != expected_orders:
                    await self._reorder_in_project(
                        session,
                        user_id=user_id,
                        project_id=str(project_id),
                        target_id=None,
                        target_order=None,
                        # Pass ignore_user_id=True to allow reordering by members if needed, 
                        # but _reorder_in_project uses user_id. 
                        # For now, let's fix the re-fetch query first.
                    )
                    await session.commit()
                    phase_result = await session.execute(
                        select(PhaseORM)
                        .where(PhaseORM.project_id == str(project_id))
                        .order_by(PhaseORM.order_in_project)
                    )
                    phases = phase_result.scalars().all()

            # Get task counts for each phase (project-based access: no user_id filter)
            result_with_counts = []
            for phase_orm in phases:
                # Count total tasks
                total_result = await session.execute(
                    select(func.count(TaskORM.id)).where(TaskORM.phase_id == phase_orm.id)
                )
                total_tasks = total_result.scalar() or 0
                
                # Count completed tasks
                completed_result = await session.execute(
                    select(func.count(TaskORM.id)).where(
                        and_(
                            TaskORM.phase_id == phase_orm.id,
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

    async def update(self, user_id: str, phase_id: UUID, update: PhaseUpdate, project_id: UUID | None = None) -> Phase:
        """Update a phase. If project_id is given, uses project-based access."""
        async with self._session_factory() as session:
            if project_id:
                result = await session.execute(
                    select(PhaseORM).where(
                        and_(PhaseORM.id == str(phase_id), PhaseORM.project_id == str(project_id))
                    )
                )
            else:
                result = await session.execute(
                    select(PhaseORM).where(
                        and_(PhaseORM.id == str(phase_id), PhaseORM.user_id == user_id)
                    )
                )
            orm = result.scalar_one_or_none()

            if not orm:
                raise NotFoundError(f"Phase {phase_id} not found")

            update_data = update.model_dump(exclude_unset=True)
            target_order = update_data.pop("order_in_project", None)
            for field, value in update_data.items():
                if value is not None:
                    if hasattr(value, "value"):  # Enum
                        value = value.value
                    setattr(orm, field, value)

            orm.updated_at = datetime.utcnow()

            if target_order is not None:
                await self._reorder_in_project(
                    session,
                    user_id=user_id,
                    project_id=orm.project_id,
                    target_id=orm.id,
                    target_order=target_order,
                )

            await session.commit()
            await session.refresh(orm)
            return self._orm_to_model(orm)

    async def delete(self, user_id: str, phase_id: UUID, project_id: UUID | None = None) -> bool:
        """Delete a phase. If project_id is given, uses project-based access. Returns True if deleted, False if not found."""
        async with self._session_factory() as session:
            if project_id:
                result = await session.execute(
                    select(PhaseORM).where(
                        and_(PhaseORM.id == str(phase_id), PhaseORM.project_id == str(project_id))
                    )
                )
            else:
                result = await session.execute(
                    select(PhaseORM).where(
                        and_(PhaseORM.id == str(phase_id), PhaseORM.user_id == user_id)
                    )
                )
            orm = result.scalar_one_or_none()
            
            if not orm:
                return False

            await session.delete(orm)
            await session.flush()
            await self._reorder_in_project(
                session,
                user_id=user_id,
                project_id=orm.project_id,
                target_id=None,
                target_order=None,
            )
            await session.commit()
            return True

    async def _reorder_in_project(
        self,
        session: AsyncSession,
        user_id: str,
        project_id: str,
        target_id: str | None,
        target_order: int | None,
    ) -> None:
        """Normalize order_in_project for all phases in a project."""
        result = await session.execute(
            select(PhaseORM)
            .where(PhaseORM.project_id == project_id)
            .order_by(PhaseORM.order_in_project, PhaseORM.created_at)
        )
        phases = list(result.scalars().all())
        if not phases:
            return

        ids = [phase.id for phase in phases]
        if target_id and target_id in ids:
            ids.remove(target_id)
            insert_index = max(0, min((target_order or 1) - 1, len(ids)))
            ids.insert(insert_index, target_id)

        id_to_phase = {phase.id: phase for phase in phases}
        for index, phase_id in enumerate(ids, start=1):
            phase = id_to_phase[phase_id]
            phase.order_in_project = index
            phase.updated_at = datetime.utcnow()
