"""
SQLite implementation of project invitation repository.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional
from uuid import UUID, uuid4

from sqlalchemy import select, and_

from app.core.exceptions import NotFoundError
from app.infrastructure.local.database import ProjectInvitationORM, get_session_factory
from app.interfaces.project_invitation_repository import IProjectInvitationRepository
from app.models.collaboration import (
    ProjectInvitation,
    ProjectInvitationCreate,
    ProjectInvitationUpdate,
)
from app.models.enums import InvitationStatus, ProjectRole


class SqliteProjectInvitationRepository(IProjectInvitationRepository):
    """SQLite implementation of project invitation repository."""

    def __init__(self, session_factory=None):
        self._session_factory = session_factory or get_session_factory()

    def _orm_to_model(self, orm: ProjectInvitationORM) -> ProjectInvitation:
        return ProjectInvitation(
            id=UUID(orm.id),
            user_id=orm.user_id,
            project_id=UUID(orm.project_id),
            email=orm.email,
            role=ProjectRole(orm.role),
            status=InvitationStatus(orm.status),
            token=orm.token,
            invited_by=orm.invited_by,
            accepted_by=orm.accepted_by,
            created_at=orm.created_at,
            updated_at=orm.updated_at,
            expires_at=orm.expires_at,
            accepted_at=orm.accepted_at,
        )

    async def create(
        self, user_id: str, project_id: UUID, invited_by: str, data: ProjectInvitationCreate
    ) -> ProjectInvitation:
        async with self._session_factory() as session:
            orm = ProjectInvitationORM(
                id=str(uuid4()),
                user_id=user_id,
                project_id=str(project_id),
                email=data.email,
                role=data.role.value,
                status=InvitationStatus.PENDING.value,
                token=str(uuid4()),
                invited_by=invited_by,
                accepted_by=None,
                expires_at=datetime.utcnow() + timedelta(days=14),
            )
            session.add(orm)
            await session.commit()
            await session.refresh(orm)
            return self._orm_to_model(orm)

    async def get(self, user_id: str, invitation_id: UUID) -> Optional[ProjectInvitation]:
        async with self._session_factory() as session:
            result = await session.execute(
                select(ProjectInvitationORM).where(
                    and_(
                        ProjectInvitationORM.id == str(invitation_id),
                        ProjectInvitationORM.user_id == user_id,
                    )
                )
            )
            orm = result.scalar_one_or_none()
            return self._orm_to_model(orm) if orm else None

    async def get_by_token(self, token: str) -> Optional[ProjectInvitation]:
        async with self._session_factory() as session:
            result = await session.execute(
                select(ProjectInvitationORM).where(ProjectInvitationORM.token == token)
            )
            orm = result.scalar_one_or_none()
            return self._orm_to_model(orm) if orm else None

    async def list_by_project(self, user_id: str, project_id: UUID) -> list[ProjectInvitation]:
        """List invitations for a project (project-based access)."""
        async with self._session_factory() as session:
            result = await session.execute(
                select(ProjectInvitationORM).where(
                    ProjectInvitationORM.project_id == str(project_id)
                ).order_by(ProjectInvitationORM.created_at.desc())
            )
            return [self._orm_to_model(orm) for orm in result.scalars().all()]

    async def get_pending_by_email(
        self, user_id: str, project_id: UUID, email: str
    ) -> Optional[ProjectInvitation]:
        async with self._session_factory() as session:
            result = await session.execute(
                select(ProjectInvitationORM).where(
                    and_(
                        ProjectInvitationORM.user_id == user_id,
                        ProjectInvitationORM.project_id == str(project_id),
                        ProjectInvitationORM.email == email,
                        ProjectInvitationORM.status == InvitationStatus.PENDING.value,
                    )
                )
            )
            orm = result.scalar_one_or_none()
            return self._orm_to_model(orm) if orm else None

    async def update(
        self, user_id: str, invitation_id: UUID, update: ProjectInvitationUpdate
    ) -> ProjectInvitation:
        async with self._session_factory() as session:
            result = await session.execute(
                select(ProjectInvitationORM).where(
                    and_(
                        ProjectInvitationORM.id == str(invitation_id),
                        ProjectInvitationORM.user_id == user_id,
                    )
                )
            )
            orm = result.scalar_one_or_none()
            if not orm:
                raise NotFoundError(f"Invitation {invitation_id} not found")

            orm.status = update.status.value
            if update.status == InvitationStatus.ACCEPTED:
                orm.accepted_at = datetime.utcnow()
            orm.updated_at = datetime.utcnow()
            await session.commit()
            await session.refresh(orm)
            return self._orm_to_model(orm)

    async def mark_accepted(
        self, invitation_id: UUID, accepted_by: str
    ) -> ProjectInvitation:
        async with self._session_factory() as session:
            result = await session.execute(
                select(ProjectInvitationORM).where(ProjectInvitationORM.id == str(invitation_id))
            )
            orm = result.scalar_one_or_none()
            if not orm:
                raise NotFoundError(f"Invitation {invitation_id} not found")

            orm.status = InvitationStatus.ACCEPTED.value
            orm.accepted_by = accepted_by
            orm.accepted_at = datetime.utcnow()
            orm.updated_at = datetime.utcnow()
            await session.commit()
            await session.refresh(orm)
            return self._orm_to_model(orm)
