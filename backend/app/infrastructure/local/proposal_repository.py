"""In-memory proposal repository implementation."""

from datetime import datetime
from typing import Optional
from uuid import UUID

from app.interfaces.proposal_repository import IProposalRepository
from app.models.proposal import Proposal, ProposalStatus


class InMemoryProposalRepository(IProposalRepository):
    """In-memory implementation of proposal repository.

    Stores proposals in a dictionary. Suitable for development and testing.
    In production with multiple instances, consider using Redis or database.
    """

    def __init__(self):
        self._proposals: dict[UUID, Proposal] = {}

    async def create(self, proposal: Proposal) -> Proposal:
        """Create a new proposal."""
        self._proposals[proposal.id] = proposal
        return proposal

    async def get(self, proposal_id: UUID) -> Optional[Proposal]:
        """Get a proposal by ID."""
        return self._proposals.get(proposal_id)

    async def list_pending(self, user_id: UUID, session_id: Optional[str] = None) -> list[Proposal]:
        """List pending proposals for a user.

        Automatically marks expired proposals as EXPIRED before returning.
        """
        # First, mark expired proposals
        await self._mark_expired(user_id)

        # Then filter pending proposals
        proposals = [
            p for p in self._proposals.values()
            if p.user_id == user_id and p.status == ProposalStatus.PENDING
        ]

        # Optionally filter by session_id
        if session_id:
            proposals = [p for p in proposals if p.session_id == session_id]

        # Sort by created_at (newest first)
        proposals.sort(key=lambda p: p.created_at, reverse=True)

        return proposals

    async def update_status(self, proposal_id: UUID, status: ProposalStatus) -> Optional[Proposal]:
        """Update the status of a proposal."""
        proposal = self._proposals.get(proposal_id)
        if proposal:
            proposal.status = status
            self._proposals[proposal_id] = proposal
        return proposal

    async def delete_expired(self, user_id: UUID) -> int:
        """Delete expired proposals for a user."""
        now = datetime.now()
        to_delete = [
            p.id for p in self._proposals.values()
            if p.user_id == user_id and p.expires_at < now
        ]

        for proposal_id in to_delete:
            del self._proposals[proposal_id]

        return len(to_delete)

    async def delete(self, proposal_id: UUID) -> bool:
        """Delete a proposal."""
        if proposal_id in self._proposals:
            del self._proposals[proposal_id]
            return True
        return False

    async def _mark_expired(self, user_id: UUID) -> None:
        """Mark expired proposals as EXPIRED status."""
        now = datetime.now()
        for proposal in self._proposals.values():
            if (
                proposal.user_id == user_id
                and proposal.status == ProposalStatus.PENDING
                and proposal.expires_at < now
            ):
                proposal.status = ProposalStatus.EXPIRED
