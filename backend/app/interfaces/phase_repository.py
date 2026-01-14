"""
Phase repository interface.

Defines the contract for phase data operations.
"""

from abc import ABC, abstractmethod
from uuid import UUID

from app.models.phase import Phase, PhaseCreate, PhaseUpdate, PhaseWithTaskCount


class IPhaseRepository(ABC):
    """Interface for phase repository operations."""

    @abstractmethod
    async def create(self, user_id: str, phase: PhaseCreate) -> Phase:
        """Create a new phase."""
        pass

    @abstractmethod
    async def get_by_id(self, user_id: str, phase_id: UUID, project_id: UUID | None = None) -> Phase | None:
        """Get a phase by ID. If project_id is given, uses project-based access."""
        pass

    @abstractmethod
    async def list_by_project(
        self, user_id: str, project_id: UUID
    ) -> list[PhaseWithTaskCount]:
        """List all phases for a project with task counts."""
        pass

    @abstractmethod
    async def update(self, user_id: str, phase_id: UUID, phase: PhaseUpdate, project_id: UUID | None = None) -> Phase:
        """Update a phase. If project_id is given, uses project-based access."""
        pass

    @abstractmethod
    async def delete(self, user_id: str, phase_id: UUID, project_id: UUID | None = None) -> bool:
        """Delete a phase. If project_id is given, uses project-based access. Returns True if deleted, False if not found."""
        pass
