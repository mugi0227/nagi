"""
Issue comment repository interface.

Defines the contract for issue comment persistence.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from uuid import UUID

from app.models.issue_comment import IssueComment, IssueCommentCreate


class IIssueCommentRepository(ABC):
    """Abstract interface for issue comment persistence."""

    @abstractmethod
    async def create(
        self, issue_id: UUID, user_id: str, comment: IssueCommentCreate
    ) -> IssueComment:
        """Create a new comment on an issue."""
        pass

    @abstractmethod
    async def list_by_issue(
        self, issue_id: UUID, limit: int = 50, offset: int = 0
    ) -> tuple[list[IssueComment], int]:
        """List comments for an issue, ordered by created_at ASC."""
        pass

    @abstractmethod
    async def delete(self, comment_id: UUID, user_id: str) -> bool:
        """Delete a comment (author only)."""
        pass

    @abstractmethod
    async def delete_by_issue(self, issue_id: UUID) -> int:
        """Delete all comments for an issue. Returns count deleted."""
        pass
