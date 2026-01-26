"""
SQLite implementation of project member repository.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.infrastructure.local.database import ProjectMemberORM, get_session_factory
from app.models.collaboration import ProjectMember, ProjectMemberCreate, ProjectMemberUpdate
from app.models.enums import ProjectRole
from app.interfaces.project_member_repository import IProjectMemberRepository


class SqliteProjectMemberRepository(IProjectMemberRepository):
    """SQLite implementation of project member repository."""

    def __init__(self, session_factory=None):
        self._session_factory = session_factory or get_session_factory()

    def _orm_to_model(self, orm: ProjectMemberORM) -> ProjectMember:
        return ProjectMember(
            id=UUID(orm.id),
            user_id=orm.user_id,
            project_id=UUID(orm.project_id),
            member_user_id=orm.member_user_id,
            role=ProjectRole(orm.role),
            capacity_hours=orm.capacity_hours,
            timezone=orm.timezone,
            created_at=orm.created_at,
            updated_at=orm.updated_at,
        )

    async def create(
        self, user_id: str, project_id: UUID, member: ProjectMemberCreate
    ) -> ProjectMember:
        async with self._session_factory() as session:
            orm = ProjectMemberORM(
                id=str(uuid4()),
                user_id=user_id,
                project_id=str(project_id),
                member_user_id=member.member_user_id,
                role=member.role.value,
                capacity_hours=member.capacity_hours,
                timezone=member.timezone,
            )
            session.add(orm)
            await session.commit()
            await session.refresh(orm)
            return self._orm_to_model(orm)

    async def get(self, user_id: str, member_id: UUID) -> Optional[ProjectMember]:
        async with self._session_factory() as session:
            result = await session.execute(
                select(ProjectMemberORM).where(
                    and_(ProjectMemberORM.id == str(member_id), ProjectMemberORM.user_id == user_id)
                )
            )
            orm = result.scalar_one_or_none()
            return self._orm_to_model(orm) if orm else None

    async def list(self, user_id: str, project_id: UUID) -> list[ProjectMember]:
        """List members for a project (project-based access)."""
        async with self._session_factory() as session:
            # Project-based access: filter by project_id only
            result = await session.execute(
                select(ProjectMemberORM).where(
                    ProjectMemberORM.project_id == str(project_id)
                )
            )
            return [self._orm_to_model(orm) for orm in result.scalars().all()]

    async def list_by_project(self, project_id: UUID) -> list[ProjectMember]:
        """List members for a project without user check (for system/background processes)."""
        async with self._session_factory() as session:
            result = await session.execute(
                select(ProjectMemberORM).where(
                    ProjectMemberORM.project_id == str(project_id)
                )
            )
            return [self._orm_to_model(orm) for orm in result.scalars().all()]

    async def update(
        self, user_id: str, member_id: UUID, update: ProjectMemberUpdate
    ) -> ProjectMember:
        async with self._session_factory() as session:
            result = await session.execute(
                select(ProjectMemberORM).where(
                    and_(ProjectMemberORM.id == str(member_id), ProjectMemberORM.user_id == user_id)
                )
            )
            orm = result.scalar_one_or_none()
            if not orm:
                raise NotFoundError(f"Project member {member_id} not found")

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

    async def delete(self, user_id: str, member_id: UUID) -> bool:
        async with self._session_factory() as session:
            result = await session.execute(
                select(ProjectMemberORM).where(
                    and_(ProjectMemberORM.id == str(member_id), ProjectMemberORM.user_id == user_id)
                )
            )
            orm = result.scalar_one_or_none()
            if not orm:
                return False
            await session.delete(orm)
            await session.commit()
            return True
