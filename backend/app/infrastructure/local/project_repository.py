"""
SQLite implementation of Project repository.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4

from sqlalchemy import and_, func, or_, select

from app.core.exceptions import NotFoundError
from app.infrastructure.local.database import (
    ProjectMemberORM,
    ProjectORM,
    TaskAssignmentORM,
    TaskORM,
    get_session_factory,
)
from app.interfaces.project_repository import IProjectRepository
from app.models.enums import ProjectStatus, ProjectVisibility, TaskStatus
from app.models.project import Project, ProjectCreate, ProjectUpdate, ProjectWithTaskCount


class SqliteProjectRepository(IProjectRepository):
    """SQLite implementation of project repository."""

    def __init__(self, session_factory=None):
        self._session_factory = session_factory or get_session_factory()

    def _orm_to_model(self, orm: ProjectORM) -> Project:
        """Convert ORM object to Pydantic model."""
        return Project(
            id=UUID(orm.id),
            user_id=orm.user_id,
            name=orm.name,
            description=orm.description,
            status=ProjectStatus(orm.status),
            visibility=ProjectVisibility(orm.visibility) if orm.visibility else ProjectVisibility.PRIVATE,
            context_summary=orm.context_summary,
            context=orm.context,
            priority=orm.priority if orm.priority is not None else 5,
            goals=orm.goals if orm.goals is not None else [],
            key_points=orm.key_points if orm.key_points is not None else [],
            kpi_config=orm.kpi_config,
            created_at=orm.created_at,
            updated_at=orm.updated_at,
        )

    async def create(self, user_id: str, project: ProjectCreate) -> Project:
        """Create a new project."""
        async with self._session_factory() as session:
            kpi_config = project.kpi_config.model_dump() if project.kpi_config else None
            orm = ProjectORM(
                id=str(uuid4()),
                user_id=user_id,
                name=project.name,
                description=project.description,
                visibility=project.visibility.value,
                context_summary=project.context_summary,
                context=project.context,
                priority=project.priority,
                goals=project.goals,
                key_points=project.key_points,
                kpi_config=kpi_config,
            )
            session.add(orm)
            await session.commit()
            await session.refresh(orm)
            return self._orm_to_model(orm)

    async def get(self, user_id: str, project_id: UUID) -> Optional[Project]:
        """Get a project by ID (accessible if user is owner or member)."""
        async with self._session_factory() as session:
            # Check if user is owner or member of this project
            result = await session.execute(
                select(ProjectORM)
                .outerjoin(
                    ProjectMemberORM,
                    ProjectORM.id == ProjectMemberORM.project_id
                )
                .where(
                    and_(
                        ProjectORM.id == str(project_id),
                        or_(
                            ProjectORM.user_id == user_id,
                            ProjectMemberORM.member_user_id == user_id,
                        ),
                    )
                )
                .distinct()
            )
            orm = result.scalars().first()
            return self._orm_to_model(orm) if orm else None

    async def get_by_id(self, project_id: UUID) -> Optional[Project]:
        """Get a project by ID without user check (for system/background processes)."""
        async with self._session_factory() as session:
            result = await session.execute(
                select(ProjectORM).where(ProjectORM.id == str(project_id))
            )
            orm = result.scalars().first()
            return self._orm_to_model(orm) if orm else None

    async def list(
        self,
        user_id: str,
        status: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[Project]:
        """List projects with optional filters (includes projects where user is owner or member)."""
        async with self._session_factory() as session:
            # Select projects where user is owner OR member
            query = (
                select(ProjectORM)
                .outerjoin(
                    ProjectMemberORM,
                    ProjectORM.id == ProjectMemberORM.project_id
                )
                .where(
                    or_(
                        ProjectORM.user_id == user_id,
                        ProjectMemberORM.member_user_id == user_id,
                    )
                )
                .distinct()
            )

            if status:
                query = query.where(ProjectORM.status == status)

            query = query.order_by(ProjectORM.created_at.desc())
            query = query.limit(limit).offset(offset)

            result = await session.execute(query)
            return [self._orm_to_model(orm) for orm in result.scalars().all()]

    async def list_with_task_count(
        self,
        user_id: str,
        status: Optional[str] = None,
    ) -> list[ProjectWithTaskCount]:
        """List projects with task statistics."""
        projects = await self.list(user_id, status)
        result = []

        async with self._session_factory() as session:
            for project in projects:
                # Total tasks
                total = await session.execute(
                    select(func.count(TaskORM.id)).where(
                        TaskORM.project_id == str(project.id)
                    )
                )
                # Completed tasks
                completed = await session.execute(
                    select(func.count(TaskORM.id)).where(
                        and_(
                            TaskORM.project_id == str(project.id),
                            TaskORM.status == TaskStatus.DONE.value,
                        )
                    )
                )
                # In progress tasks
                in_progress = await session.execute(
                    select(func.count(TaskORM.id)).where(
                        and_(
                            TaskORM.project_id == str(project.id),
                            TaskORM.status == TaskStatus.IN_PROGRESS.value,
                        )
                    )
                )

                # Unassigned tasks (non-DONE tasks without any assignment)
                unassigned_subquery = (
                    select(TaskAssignmentORM.task_id)
                    .where(TaskAssignmentORM.task_id == TaskORM.id)
                    .correlate(TaskORM)
                    .exists()
                )
                unassigned = await session.execute(
                    select(func.count(TaskORM.id)).where(
                        and_(
                            TaskORM.project_id == str(project.id),
                            TaskORM.status != TaskStatus.DONE.value,
                            ~unassigned_subquery,
                        )
                    )
                )

                result.append(ProjectWithTaskCount(
                    **project.model_dump(),
                    total_tasks=total.scalar() or 0,
                    completed_tasks=completed.scalar() or 0,
                    in_progress_tasks=in_progress.scalar() or 0,
                    unassigned_tasks=unassigned.scalar() or 0,
                ))

        return result

    async def update(
        self, user_id: str, project_id: UUID, update: ProjectUpdate
    ) -> Project:
        """Update an existing project."""
        async with self._session_factory() as session:
            result = await session.execute(
                select(ProjectORM).where(
                    and_(ProjectORM.id == str(project_id), ProjectORM.user_id == user_id)
                )
            )
            orm = result.scalar_one_or_none()

            if not orm:
                raise NotFoundError(f"Project {project_id} not found")

            update_data = update.model_dump(exclude_unset=True)
            for field, value in update_data.items():
                if value is not None:
                    if field == "kpi_config" and hasattr(value, "model_dump"):
                        value = value.model_dump()
                    if hasattr(value, "value"):  # Enum
                        value = value.value
                    setattr(orm, field, value)

            orm.updated_at = datetime.utcnow()
            await session.commit()
            await session.refresh(orm)
            return self._orm_to_model(orm)

    async def delete(self, user_id: str, project_id: UUID) -> bool:
        """Delete a project."""
        async with self._session_factory() as session:
            result = await session.execute(
                select(ProjectORM).where(
                    and_(ProjectORM.id == str(project_id), ProjectORM.user_id == user_id)
                )
            )
            orm = result.scalar_one_or_none()

            if not orm:
                return False

            await session.delete(orm)
            await session.commit()
            return True
