"""
SQLite implementation of task assignment repository.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4

from sqlalchemy import and_, select

from app.core.exceptions import NotFoundError
from app.infrastructure.local.database import TaskAssignmentORM, TaskORM, get_session_factory
from app.interfaces.task_assignment_repository import ITaskAssignmentRepository
from app.models.collaboration import (
    TaskAssignment,
    TaskAssignmentCreate,
    TaskAssignmentsCreate,
    TaskAssignmentUpdate,
)
from app.models.enums import TaskStatus


class SqliteTaskAssignmentRepository(ITaskAssignmentRepository):
    """SQLite implementation of task assignment repository."""

    def __init__(self, session_factory=None):
        self._session_factory = session_factory or get_session_factory()

    def _orm_to_model(self, orm: TaskAssignmentORM) -> TaskAssignment:
        status = TaskStatus(orm.status) if orm.status else None
        return TaskAssignment(
            id=UUID(orm.id),
            user_id=orm.user_id,
            task_id=UUID(orm.task_id),
            assignee_id=orm.assignee_id,
            status=status,
            progress=orm.progress,
            created_at=orm.created_at,
            updated_at=orm.updated_at,
        )

    async def assign(
        self, user_id: str, task_id: UUID, assignment: TaskAssignmentCreate
    ) -> TaskAssignment:
        async with self._session_factory() as session:
            result = await session.execute(
                select(TaskAssignmentORM).where(
                    and_(
                        TaskAssignmentORM.task_id == str(task_id),
                        TaskAssignmentORM.user_id == user_id,
                    )
                )
            )
            orm = result.scalar_one_or_none()
            if orm:
                orm.assignee_id = assignment.assignee_id
                orm.status = assignment.status.value if assignment.status else None
                orm.progress = assignment.progress
                orm.updated_at = datetime.utcnow()
            else:
                orm = TaskAssignmentORM(
                    id=str(uuid4()),
                    user_id=user_id,
                    task_id=str(task_id),
                    assignee_id=assignment.assignee_id,
                    status=assignment.status.value if assignment.status else None,
                    progress=assignment.progress,
                )
                session.add(orm)
            await session.commit()
            await session.refresh(orm)
            return self._orm_to_model(orm)

    async def get_by_task(self, user_id: str, task_id: UUID) -> Optional[TaskAssignment]:
        async with self._session_factory() as session:
            result = await session.execute(
                select(TaskAssignmentORM).where(
                    and_(
                        TaskAssignmentORM.task_id == str(task_id),
                        TaskAssignmentORM.user_id == user_id,
                    )
                )
            )
            orm = result.scalar_one_or_none()
            return self._orm_to_model(orm) if orm else None

    async def get_by_id(self, assignment_id: UUID) -> Optional[TaskAssignment]:
        """Get assignment by ID (for access verification)."""
        async with self._session_factory() as session:
            result = await session.execute(
                select(TaskAssignmentORM).where(
                    TaskAssignmentORM.id == str(assignment_id)
                )
            )
            orm = result.scalar_one_or_none()
            return self._orm_to_model(orm) if orm else None

    async def list_by_project(self, user_id: str, project_id: UUID) -> list[TaskAssignment]:
        """List assignments for a project (project-based access)."""
        async with self._session_factory() as session:
            # Project-based: find tasks by project_id only
            task_ids_result = await session.execute(
                select(TaskORM.id).where(TaskORM.project_id == str(project_id))
            )
            task_ids = [row[0] for row in task_ids_result.fetchall()]
            if not task_ids:
                return []
            result = await session.execute(
                select(TaskAssignmentORM).where(
                    TaskAssignmentORM.task_id.in_(task_ids)
                )
            )
            return [self._orm_to_model(orm) for orm in result.scalars().all()]

    async def update(
        self, user_id: str, assignment_id: UUID, update: TaskAssignmentUpdate
    ) -> TaskAssignment:
        async with self._session_factory() as session:
            result = await session.execute(
                select(TaskAssignmentORM).where(
                    and_(
                        TaskAssignmentORM.id == str(assignment_id),
                        TaskAssignmentORM.user_id == user_id,
                    )
                )
            )
            orm = result.scalar_one_or_none()
            if not orm:
                raise NotFoundError(f"Assignment {assignment_id} not found")

            update_data = update.model_dump(exclude_unset=True)
            for field, value in update_data.items():
                if value is None:
                    continue
                if hasattr(value, "value"):
                    value = value.value
                setattr(orm, field, value)
            orm.updated_at = datetime.utcnow()
            await session.commit()
            await session.refresh(orm)
            return self._orm_to_model(orm)

    async def delete_by_task(self, user_id: str, task_id: UUID) -> bool:
        async with self._session_factory() as session:
            result = await session.execute(
                select(TaskAssignmentORM).where(
                    and_(
                        TaskAssignmentORM.task_id == str(task_id),
                        TaskAssignmentORM.user_id == user_id,
                    )
                )
            )
            orm = result.scalar_one_or_none()
            if not orm:
                return False
            await session.delete(orm)
            await session.commit()
            return True

    async def list_by_task(self, user_id: str, task_id: UUID) -> list[TaskAssignment]:
        """List all assignments for a task (supports multiple assignees)."""
        async with self._session_factory() as session:
            result = await session.execute(
                select(TaskAssignmentORM).where(
                    and_(
                        TaskAssignmentORM.task_id == str(task_id),
                        TaskAssignmentORM.user_id == user_id,
                    )
                )
            )
            return [self._orm_to_model(orm) for orm in result.scalars().all()]

    async def assign_multiple(
        self, user_id: str, task_id: UUID, assignments: TaskAssignmentsCreate
    ) -> list[TaskAssignment]:
        """Assign a task to multiple members. Replaces existing assignments."""
        # Deduplicate assignee IDs while preserving order to avoid unique constraint errors.
        unique_assignee_ids = list(dict.fromkeys(assignments.assignee_ids))
        async with self._session_factory() as session:
            # Delete existing assignments for this task
            result = await session.execute(
                select(TaskAssignmentORM).where(
                    and_(
                        TaskAssignmentORM.task_id == str(task_id),
                        TaskAssignmentORM.user_id == user_id,
                    )
                )
            )
            for orm in result.scalars().all():
                await session.delete(orm)
            await session.flush()

            # Create new assignments for each assignee
            created_orms = []
            for assignee_id in unique_assignee_ids:
                orm = TaskAssignmentORM(
                    id=str(uuid4()),
                    user_id=user_id,
                    task_id=str(task_id),
                    assignee_id=assignee_id,
                    status=None,
                    progress=None,
                )
                session.add(orm)
                created_orms.append(orm)

            await session.commit()
            for orm in created_orms:
                await session.refresh(orm)
            return [self._orm_to_model(orm) for orm in created_orms]

    async def list_all_for_user(self, user_id: str) -> list[TaskAssignment]:
        """List all assignments where user is the project owner."""
        async with self._session_factory() as session:
            result = await session.execute(
                select(TaskAssignmentORM).where(
                    TaskAssignmentORM.user_id == user_id
                )
            )
            return [self._orm_to_model(orm) for orm in result.scalars().all()]

    async def list_for_assignee(self, user_id: str) -> list[TaskAssignment]:
        """List assignments where the user is the assignee."""
        async with self._session_factory() as session:
            result = await session.execute(
                select(TaskAssignmentORM).where(
                    TaskAssignmentORM.assignee_id == user_id
                )
            )
            return [self._orm_to_model(orm) for orm in result.scalars().all()]

    async def convert_invitation_to_user(
        self, user_id: str, invitation_assignee_id: str, new_user_id: str
    ) -> int:
        """Convert all invitation-based assignments to user-based."""
        async with self._session_factory() as session:
            result = await session.execute(
                select(TaskAssignmentORM).where(
                    and_(
                        TaskAssignmentORM.user_id == user_id,
                        TaskAssignmentORM.assignee_id == invitation_assignee_id,
                    )
                )
            )
            assignments = result.scalars().all()
            for orm in assignments:
                orm.assignee_id = new_user_id
                orm.updated_at = datetime.utcnow()
            await session.commit()
            return len(assignments)
