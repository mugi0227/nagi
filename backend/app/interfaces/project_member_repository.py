"""
Project member repository interface.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Optional
from uuid import UUID

from app.models.collaboration import ProjectMember, ProjectMemberCreate, ProjectMemberUpdate


class IProjectMemberRepository(ABC):
    """Abstract interface for project member persistence."""

    @abstractmethod
    async def create(
        self, user_id: str, project_id: UUID, member: ProjectMemberCreate
    ) -> ProjectMember:
        """Create a new project member."""
        pass

    @abstractmethod
    async def get(self, user_id: str, member_id: UUID) -> Optional[ProjectMember]:
        """Get a member by ID."""
        pass

    @abstractmethod
    async def list(self, user_id: str, project_id: UUID) -> list[ProjectMember]:
        """List members for a project."""
        pass

    @abstractmethod
    async def list_by_project(self, project_id: UUID) -> list[ProjectMember]:
        """List members for a project without user check (for system/background processes)."""
        pass

    @abstractmethod
    async def update(
        self, user_id: str, member_id: UUID, update: ProjectMemberUpdate
    ) -> ProjectMember:
        """Update a project member."""
        pass

    @abstractmethod
    async def delete(self, user_id: str, member_id: UUID) -> bool:
        """Delete a project member."""
        pass
