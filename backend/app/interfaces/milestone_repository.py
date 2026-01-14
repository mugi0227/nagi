"""
Milestone repository interface.

Defines the contract for milestone data operations.
"""

from abc import ABC, abstractmethod
from uuid import UUID

from app.models.milestone import Milestone, MilestoneCreate, MilestoneUpdate


class IMilestoneRepository(ABC):
    """Interface for milestone repository operations."""

    @abstractmethod
    async def create(self, user_id: str, milestone: MilestoneCreate) -> Milestone:
        """Create a new milestone."""
        pass

    @abstractmethod
    async def get_by_id(self, user_id: str, milestone_id: UUID, project_id: UUID | None = None) -> Milestone | None:
        """Get a milestone by ID. If project_id is given, uses project-based access."""
        pass

    @abstractmethod
    async def list_by_phase(self, user_id: str, phase_id: UUID) -> list[Milestone]:
        """List milestones for a phase."""
        pass

    @abstractmethod
    async def list_by_project(self, user_id: str, project_id: UUID) -> list[Milestone]:
        """List milestones for a project (project-based access)."""
        pass

    @abstractmethod
    async def update(self, user_id: str, milestone_id: UUID, update: MilestoneUpdate, project_id: UUID | None = None) -> Milestone:
        """Update a milestone. If project_id is given, uses project-based access."""
        pass

    @abstractmethod
    async def delete(self, user_id: str, milestone_id: UUID, project_id: UUID | None = None) -> bool:
        """Delete a milestone. If project_id is given, uses project-based access. Returns True if deleted, False if not found."""
        pass
