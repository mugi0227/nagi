"""
Project invitation repository interface.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Optional
from uuid import UUID

from app.models.collaboration import (
    ProjectInvitation,
    ProjectInvitationCreate,
    ProjectInvitationUpdate,
)


class IProjectInvitationRepository(ABC):
    """Abstract interface for project invitation persistence."""

    @abstractmethod
    async def create(
        self, user_id: str, project_id: UUID, invited_by: str, data: ProjectInvitationCreate
    ) -> ProjectInvitation:
        """Create a project invitation."""
        pass

    @abstractmethod
    async def get(self, user_id: str, invitation_id: UUID) -> Optional[ProjectInvitation]:
        """Get invitation by ID."""
        pass

    @abstractmethod
    async def get_by_token(self, token: str) -> Optional[ProjectInvitation]:
        """Get invitation by token."""
        pass

    @abstractmethod
    async def list_by_project(self, user_id: str, project_id: UUID) -> list[ProjectInvitation]:
        """List invitations for a project."""
        pass

    @abstractmethod
    async def get_pending_by_email(
        self, project_id: UUID, email: str
    ) -> Optional[ProjectInvitation]:
        """Get a pending invitation by email for a project."""
        pass

    @abstractmethod
    async def get_by_email(
        self, project_id: UUID, email: str
    ) -> Optional[ProjectInvitation]:
        """Get any invitation by email for a project (regardless of status)."""
        pass

    @abstractmethod
    async def update(
        self, user_id: str, invitation_id: UUID, update: ProjectInvitationUpdate
    ) -> ProjectInvitation:
        """Update an invitation."""
        pass

    @abstractmethod
    async def mark_accepted(
        self, invitation_id: UUID, accepted_by: str
    ) -> ProjectInvitation:
        """Mark invitation as accepted."""
        pass

    @abstractmethod
    async def reinvite(
        self, invitation_id: UUID, invited_by: str
    ) -> ProjectInvitation:
        """Reset an EXPIRED/REVOKED invitation to PENDING status."""
        pass
