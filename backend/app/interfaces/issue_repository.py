"""
Issue repository interface.

Defines the contract for issue (feature requests/bug reports) persistence.
Issues are shared across all users as a public feedback board.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Optional
from uuid import UUID

from app.models.issue import Issue, IssueCreate, IssueUpdate, IssueStatusUpdate
from app.models.enums import IssueCategory, IssueStatus


class IIssueRepository(ABC):
    """Abstract interface for issue persistence."""

    @abstractmethod
    async def create(self, user_id: str, issue: IssueCreate) -> Issue:
        """
        Create a new issue.

        Args:
            user_id: Creator user ID
            issue: Issue creation data

        Returns:
            Created issue
        """
        pass

    @abstractmethod
    async def get(self, issue_id: UUID, current_user_id: Optional[str] = None) -> Optional[Issue]:
        """
        Get an issue by ID.

        Args:
            issue_id: Issue ID
            current_user_id: Current user ID (to check liked_by_me)

        Returns:
            Issue if found, None otherwise
        """
        pass

    @abstractmethod
    async def list_all(
        self,
        current_user_id: Optional[str] = None,
        category: Optional[IssueCategory] = None,
        status: Optional[IssueStatus] = None,
        sort_by: str = "created_at",
        sort_order: str = "desc",
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[Issue], int]:
        """
        List all issues (shared across all users).

        Args:
            current_user_id: Current user ID (to check liked_by_me)
            category: Filter by category
            status: Filter by status
            sort_by: Sort field (created_at, like_count)
            sort_order: Sort order (asc, desc)
            limit: Maximum number of results
            offset: Pagination offset

        Returns:
            Tuple of (list of issues, total count)
        """
        pass

    @abstractmethod
    async def update(self, issue_id: UUID, user_id: str, update: IssueUpdate) -> Issue:
        """
        Update an existing issue (by author only).

        Args:
            issue_id: Issue ID
            user_id: Current user ID (must be author)
            update: Fields to update

        Returns:
            Updated issue
        """
        pass

    @abstractmethod
    async def update_status(self, issue_id: UUID, update: IssueStatusUpdate) -> Issue:
        """
        Update issue status (admin only).

        Args:
            issue_id: Issue ID
            update: Status update data

        Returns:
            Updated issue
        """
        pass

    @abstractmethod
    async def delete(self, issue_id: UUID, user_id: str) -> bool:
        """
        Delete an issue (by author only).

        Args:
            issue_id: Issue ID
            user_id: Current user ID (must be author)

        Returns:
            True if deleted, False if not found or not authorized
        """
        pass

    @abstractmethod
    async def like(self, issue_id: UUID, user_id: str) -> Issue:
        """
        Add a like to an issue.

        Args:
            issue_id: Issue ID
            user_id: User ID

        Returns:
            Updated issue
        """
        pass

    @abstractmethod
    async def unlike(self, issue_id: UUID, user_id: str) -> Issue:
        """
        Remove a like from an issue.

        Args:
            issue_id: Issue ID
            user_id: User ID

        Returns:
            Updated issue
        """
        pass

    @abstractmethod
    async def search(
        self,
        query: str,
        current_user_id: Optional[str] = None,
        limit: int = 10,
    ) -> list[Issue]:
        """
        Search issues by title and content.

        Args:
            query: Search query
            current_user_id: Current user ID (to check liked_by_me)
            limit: Maximum number of results

        Returns:
            List of matching issues
        """
        pass
