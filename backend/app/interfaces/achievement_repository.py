"""
Achievement repository interface.

Defines the contract for achievement storage operations.
"""

from abc import ABC, abstractmethod
from datetime import datetime
from typing import List, Optional
from uuid import UUID

from app.models.achievement import Achievement, AchievementCreate


class IAchievementRepository(ABC):
    """Abstract interface for achievement repository."""

    @abstractmethod
    async def create(self, user_id: str, achievement: Achievement) -> Achievement:
        """
        Create a new achievement.

        Args:
            user_id: User ID
            achievement: Achievement data

        Returns:
            Created achievement with ID
        """
        pass

    @abstractmethod
    async def get(self, user_id: str, achievement_id: UUID) -> Optional[Achievement]:
        """
        Get an achievement by ID.

        Args:
            user_id: User ID
            achievement_id: Achievement ID

        Returns:
            Achievement if found, None otherwise
        """
        pass

    @abstractmethod
    async def list(
        self,
        user_id: str,
        period_start: Optional[datetime] = None,
        period_end: Optional[datetime] = None,
        limit: int = 20,
        offset: int = 0,
    ) -> List[Achievement]:
        """
        List achievements for a user.

        Args:
            user_id: User ID
            period_start: Optional filter by period start
            period_end: Optional filter by period end
            limit: Maximum number of results
            offset: Offset for pagination

        Returns:
            List of achievements
        """
        pass

    @abstractmethod
    async def get_latest(self, user_id: str) -> Optional[Achievement]:
        """
        Get the most recently created achievement for a user.

        Args:
            user_id: User ID

        Returns:
            Latest achievement if exists, None otherwise
        """
        pass

    @abstractmethod
    async def delete(self, user_id: str, achievement_id: UUID) -> bool:
        """
        Delete an achievement.

        Args:
            user_id: User ID
            achievement_id: Achievement ID

        Returns:
            True if deleted, False if not found
        """
        pass

    @abstractmethod
    async def update(
        self,
        user_id: str,
        achievement_id: UUID,
        summary: Optional[str] = None,
        growth_points: Optional[List[str]] = None,
        next_suggestions: Optional[List[str]] = None,
    ) -> Achievement:
        """
        Update an achievement (partial update).

        Args:
            user_id: User ID
            achievement_id: Achievement ID
            summary: Optional new summary
            growth_points: Optional new growth points
            next_suggestions: Optional new suggestions

        Returns:
            Updated achievement
        """
        pass
