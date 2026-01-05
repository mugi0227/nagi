"""Interface for proposal repository."""

from abc import ABC, abstractmethod
from typing import Optional
from uuid import UUID

from app.models.proposal import Proposal, ProposalStatus


class IProposalRepository(ABC):
    """Interface for managing proposals awaiting user approval."""

    @abstractmethod
    async def create(self, proposal: Proposal) -> Proposal:
        """Create a new proposal.

        Args:
            proposal: The proposal to create

        Returns:
            The created proposal
        """
        pass

    @abstractmethod
    async def get(self, proposal_id: UUID) -> Optional[Proposal]:
        """Get a proposal by ID.

        Args:
            proposal_id: The proposal ID

        Returns:
            The proposal if found, None otherwise
        """
        pass

    @abstractmethod
    async def list_pending(self, user_id: UUID, session_id: Optional[str] = None) -> list[Proposal]:
        """List pending proposals for a user.

        Args:
            user_id: The user ID
            session_id: Optional session ID to filter by

        Returns:
            List of pending proposals
        """
        pass

    @abstractmethod
    async def update_status(self, proposal_id: UUID, status: ProposalStatus) -> Optional[Proposal]:
        """Update the status of a proposal.

        Args:
            proposal_id: The proposal ID
            status: The new status

        Returns:
            The updated proposal if found, None otherwise
        """
        pass

    @abstractmethod
    async def delete_expired(self, user_id: UUID) -> int:
        """Delete expired proposals for a user.

        Args:
            user_id: The user ID

        Returns:
            Number of proposals deleted
        """
        pass

    @abstractmethod
    async def delete(self, proposal_id: UUID) -> bool:
        """Delete a proposal.

        Args:
            proposal_id: The proposal ID

        Returns:
            True if deleted, False if not found
        """
        pass
