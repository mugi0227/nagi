"""
Recurring meeting repository interface.

Defines the contract for recurring meeting persistence operations.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Optional
from uuid import UUID

from app.models.recurring_meeting import RecurringMeeting, RecurringMeetingCreate, RecurringMeetingUpdate


class IRecurringMeetingRepository(ABC):
    """Abstract interface for recurring meeting persistence."""

    @abstractmethod
    async def create(self, user_id: str, data: RecurringMeetingCreate) -> RecurringMeeting:
        """Create a new recurring meeting."""
        pass

    @abstractmethod
    async def get(self, user_id: str, meeting_id: UUID) -> Optional[RecurringMeeting]:
        """Get a recurring meeting by ID."""
        pass

    @abstractmethod
    async def list(
        self,
        user_id: str,
        project_id: Optional[UUID] = None,
        include_inactive: bool = False,
        limit: int = 100,
        offset: int = 0,
    ) -> list[RecurringMeeting]:
        """List recurring meetings."""
        pass

    @abstractmethod
    async def update(
        self,
        user_id: str,
        meeting_id: UUID,
        update: RecurringMeetingUpdate,
    ) -> RecurringMeeting:
        """Update a recurring meeting."""
        pass

    @abstractmethod
    async def delete(self, user_id: str, meeting_id: UUID) -> bool:
        """Delete a recurring meeting."""
        pass
