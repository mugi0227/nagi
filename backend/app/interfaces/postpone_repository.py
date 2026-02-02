"""
Postpone repository interface.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import date
from typing import Optional
from uuid import UUID

from app.models.postpone import PostponeEvent


class IPostponeRepository(ABC):
    """Abstract interface for postpone event persistence."""

    @abstractmethod
    async def create(
        self,
        user_id: str,
        task_id: UUID,
        from_date: date,
        to_date: date,
        reason: Optional[str] = None,
        pinned: bool = False,
    ) -> PostponeEvent:
        """Record a postpone event."""
        pass

    @abstractmethod
    async def list_by_task(
        self, user_id: str, task_id: UUID, limit: int = 50
    ) -> list[PostponeEvent]:
        """List postpone events for a task."""
        pass

    @abstractmethod
    async def list_by_user(
        self, user_id: str, since: Optional[date] = None, limit: int = 100
    ) -> list[PostponeEvent]:
        """List postpone events for a user."""
        pass

    @abstractmethod
    async def count_by_task(self, user_id: str, task_id: UUID) -> int:
        """Count how many times a task has been postponed."""
        pass
