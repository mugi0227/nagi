"""
Blocker repository interface.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Optional
from uuid import UUID

from app.models.collaboration import Blocker, BlockerCreate, BlockerUpdate


class IBlockerRepository(ABC):
    """Abstract interface for blocker persistence."""

    @abstractmethod
    async def create(self, user_id: str, task_id: UUID, blocker: BlockerCreate) -> Blocker:
        """Create a blocker for a task."""
        pass

    @abstractmethod
    async def get(self, user_id: str, blocker_id: UUID) -> Optional[Blocker]:
        """Get blocker by ID."""
        pass

    @abstractmethod
    async def list_by_task(self, user_id: str, task_id: UUID) -> list[Blocker]:
        """List blockers for a task."""
        pass

    @abstractmethod
    async def list_by_project(self, user_id: str, project_id: UUID) -> list[Blocker]:
        """List blockers for a project."""
        pass

    @abstractmethod
    async def update(
        self, user_id: str, blocker_id: UUID, update: BlockerUpdate
    ) -> Blocker:
        """Update blocker status."""
        pass
