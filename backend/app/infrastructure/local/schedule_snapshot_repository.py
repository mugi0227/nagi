"""
SQLite implementation of schedule snapshot repository.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4

from sqlalchemy import select, update

from app.infrastructure.local.database import ScheduleSnapshotORM, get_session_factory
from app.interfaces.schedule_snapshot_repository import IScheduleSnapshotRepository
from app.models.schedule_snapshot import (
    PhaseBufferInfo,
    ScheduleSnapshot,
    ScheduleSnapshotCreate,
    ScheduleSnapshotSummary,
    SnapshotDayAllocation,
    SnapshotTaskScheduleInfo,
)


class SqliteScheduleSnapshotRepository(IScheduleSnapshotRepository):
    """SQLite implementation of schedule snapshot repository."""

    def _orm_to_model(self, orm: ScheduleSnapshotORM) -> ScheduleSnapshot:
        """Convert ORM model to Pydantic model."""
        tasks = [
            SnapshotTaskScheduleInfo(**t) for t in (orm.tasks_json or [])
        ]
        days = [
            SnapshotDayAllocation(**d) for d in (orm.days_json or [])
        ]
        phase_buffers = [
            PhaseBufferInfo(**p) for p in (orm.phase_buffers_json or [])
        ]

        return ScheduleSnapshot(
            id=UUID(orm.id),
            user_id=orm.user_id,
            project_id=UUID(orm.project_id),
            name=orm.name,
            is_active=orm.is_active,
            start_date=orm.start_date,
            tasks=tasks,
            days=days,
            phase_buffers=phase_buffers,
            total_buffer_minutes=orm.total_buffer_minutes or 0,
            consumed_buffer_minutes=orm.consumed_buffer_minutes or 0,
            capacity_hours=orm.capacity_hours or 8.0,
            capacity_by_weekday=orm.capacity_by_weekday,
            max_days=orm.max_days or 60,
            plan_utilization_ratio=orm.plan_utilization_ratio or 1.0,
            created_at=orm.created_at,
            updated_at=orm.updated_at,
        )

    def _orm_to_summary(self, orm: ScheduleSnapshotORM) -> ScheduleSnapshotSummary:
        """Convert ORM model to summary model."""
        total_buffer = orm.total_buffer_minutes or 0
        consumed_buffer = orm.consumed_buffer_minutes or 0
        buffer_pct = (
            ((total_buffer - consumed_buffer) / total_buffer * 100)
            if total_buffer > 0
            else 100.0
        )

        return ScheduleSnapshotSummary(
            id=UUID(orm.id),
            project_id=UUID(orm.project_id),
            name=orm.name,
            is_active=orm.is_active,
            start_date=orm.start_date,
            task_count=len(orm.tasks_json or []),
            total_buffer_minutes=total_buffer,
            consumed_buffer_minutes=consumed_buffer,
            buffer_percentage=buffer_pct,
            created_at=orm.created_at,
        )

    async def create(
        self,
        user_id: str,
        project_id: UUID,
        snapshot: ScheduleSnapshotCreate,
        schedule_data: dict,
    ) -> ScheduleSnapshot:
        """Create a new schedule snapshot."""
        session_factory = get_session_factory()
        async with session_factory() as session:
            # Generate name if not provided
            name = snapshot.name or f"Baseline {datetime.utcnow().strftime('%Y/%m/%d %H:%M')}"

            # Prepare JSON data
            tasks_json = [t.model_dump(mode="json") for t in schedule_data.get("tasks", [])]
            days_json = [d.model_dump(mode="json") for d in schedule_data.get("days", [])]
            phase_buffers_json = [p.model_dump(mode="json") for p in schedule_data.get("phase_buffers", [])]

            orm = ScheduleSnapshotORM(
                id=str(uuid4()),
                user_id=user_id,
                project_id=str(project_id),
                name=name,
                is_active=True,  # Auto-activate on creation
                start_date=schedule_data.get("start_date"),
                tasks_json=tasks_json,
                days_json=days_json,
                phase_buffers_json=phase_buffers_json,
                total_buffer_minutes=schedule_data.get("total_buffer_minutes", 0),
                consumed_buffer_minutes=0,
                capacity_hours=snapshot.capacity_hours,
                capacity_by_weekday=snapshot.capacity_by_weekday,
                max_days=snapshot.max_days,
                plan_utilization_ratio=snapshot.plan_utilization_ratio,
            )

            # Deactivate any existing active snapshot
            await session.execute(
                update(ScheduleSnapshotORM)
                .where(
                    ScheduleSnapshotORM.user_id == user_id,
                    ScheduleSnapshotORM.project_id == str(project_id),
                    ScheduleSnapshotORM.is_active.is_(True),
                )
                .values(is_active=False, updated_at=datetime.utcnow())
            )

            session.add(orm)
            await session.commit()
            await session.refresh(orm)

            return self._orm_to_model(orm)

    async def get(self, user_id: str, snapshot_id: UUID) -> Optional[ScheduleSnapshot]:
        """Get a snapshot by ID."""
        session_factory = get_session_factory()
        async with session_factory() as session:
            result = await session.execute(
                select(ScheduleSnapshotORM).where(
                    ScheduleSnapshotORM.id == str(snapshot_id),
                    ScheduleSnapshotORM.user_id == user_id,
                )
            )
            orm = result.scalar_one_or_none()
            return self._orm_to_model(orm) if orm else None

    async def list_by_project(
        self,
        user_id: str,
        project_id: UUID,
        limit: int = 20,
        offset: int = 0,
    ) -> list[ScheduleSnapshotSummary]:
        """List snapshots for a project."""
        session_factory = get_session_factory()
        async with session_factory() as session:
            result = await session.execute(
                select(ScheduleSnapshotORM)
                .where(
                    ScheduleSnapshotORM.user_id == user_id,
                    ScheduleSnapshotORM.project_id == str(project_id),
                )
                .order_by(ScheduleSnapshotORM.created_at.desc())
                .limit(limit)
                .offset(offset)
            )
            orms = result.scalars().all()
            return [self._orm_to_summary(orm) for orm in orms]

    async def get_active(self, user_id: str, project_id: UUID) -> Optional[ScheduleSnapshot]:
        """Get the currently active snapshot for a project."""
        session_factory = get_session_factory()
        async with session_factory() as session:
            result = await session.execute(
                select(ScheduleSnapshotORM).where(
                    ScheduleSnapshotORM.user_id == user_id,
                    ScheduleSnapshotORM.project_id == str(project_id),
                    ScheduleSnapshotORM.is_active.is_(True),
                )
            )
            orm = result.scalar_one_or_none()
            return self._orm_to_model(orm) if orm else None

    async def activate(self, user_id: str, snapshot_id: UUID) -> ScheduleSnapshot:
        """Activate a snapshot (deactivates any previously active one)."""
        session_factory = get_session_factory()
        async with session_factory() as session:
            # Get the snapshot to activate
            result = await session.execute(
                select(ScheduleSnapshotORM).where(
                    ScheduleSnapshotORM.id == str(snapshot_id),
                    ScheduleSnapshotORM.user_id == user_id,
                )
            )
            orm = result.scalar_one_or_none()
            if not orm:
                raise ValueError(f"Snapshot {snapshot_id} not found")

            # Deactivate all snapshots for this project
            await session.execute(
                update(ScheduleSnapshotORM)
                .where(
                    ScheduleSnapshotORM.user_id == user_id,
                    ScheduleSnapshotORM.project_id == orm.project_id,
                    ScheduleSnapshotORM.is_active.is_(True),
                )
                .values(is_active=False, updated_at=datetime.utcnow())
            )

            # Activate the target snapshot
            orm.is_active = True
            orm.updated_at = datetime.utcnow()
            await session.commit()
            await session.refresh(orm)

            return self._orm_to_model(orm)

    async def delete(self, user_id: str, snapshot_id: UUID) -> bool:
        """Delete a snapshot."""
        session_factory = get_session_factory()
        async with session_factory() as session:
            result = await session.execute(
                select(ScheduleSnapshotORM).where(
                    ScheduleSnapshotORM.id == str(snapshot_id),
                    ScheduleSnapshotORM.user_id == user_id,
                )
            )
            orm = result.scalar_one_or_none()
            if not orm:
                return False

            await session.delete(orm)
            await session.commit()
            return True

    async def update_consumed_buffer(
        self,
        user_id: str,
        snapshot_id: UUID,
        consumed_buffer_minutes: int,
    ) -> ScheduleSnapshot:
        """Update the consumed buffer for a snapshot."""
        session_factory = get_session_factory()
        async with session_factory() as session:
            result = await session.execute(
                select(ScheduleSnapshotORM).where(
                    ScheduleSnapshotORM.id == str(snapshot_id),
                    ScheduleSnapshotORM.user_id == user_id,
                )
            )
            orm = result.scalar_one_or_none()
            if not orm:
                raise ValueError(f"Snapshot {snapshot_id} not found")

            orm.consumed_buffer_minutes = consumed_buffer_minutes
            orm.updated_at = datetime.utcnow()
            await session.commit()
            await session.refresh(orm)

            return self._orm_to_model(orm)
