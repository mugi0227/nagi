"""
Meeting session repository interface.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Optional
from uuid import UUID

from app.models.meeting_session import (
    MeetingSession,
    MeetingSessionCreate,
    MeetingSessionUpdate,
)


class IMeetingSessionRepository(ABC):
    """Interface for meeting session repository."""

    @abstractmethod
    async def create(
        self,
        user_id: str,
        data: MeetingSessionCreate,
    ) -> MeetingSession:
        """Create a new meeting session."""
        pass

    @abstractmethod
    async def get(
        self,
        user_id: str,
        session_id: UUID,
    ) -> Optional[MeetingSession]:
        """Get a session by ID."""
        pass

    @abstractmethod
    async def get_by_task(
        self,
        user_id: str,
        task_id: UUID,
    ) -> Optional[MeetingSession]:
        """Get the active session for a task (not COMPLETED)."""
        pass

    @abstractmethod
    async def get_latest_by_task(
        self,
        user_id: str,
        task_id: UUID,
    ) -> Optional[MeetingSession]:
        """Get the most recent session for a task (any status)."""
        pass

    @abstractmethod
    async def update(
        self,
        user_id: str,
        session_id: UUID,
        data: MeetingSessionUpdate,
    ) -> Optional[MeetingSession]:
        """Update a session."""
        pass

    @abstractmethod
    async def delete(
        self,
        user_id: str,
        session_id: UUID,
    ) -> bool:
        """Delete a session."""
        pass

    @abstractmethod
    async def list_by_user(
        self,
        user_id: str,
        limit: int = 50,
        offset: int = 0,
    ) -> list[MeetingSession]:
        """List sessions for a user, ordered by created_at desc."""
        pass

    @abstractmethod
    async def list_by_recurring_meeting(
        self,
        user_id: str,
        recurring_meeting_id: UUID,
        limit: int = 50,
    ) -> list[MeetingSession]:
        """List COMPLETED sessions for a recurring meeting, ordered by created_at desc."""
        pass

    # ---- Project-aware methods (no user_id filter) ----

    @abstractmethod
    async def get_by_id(
        self,
        session_id: UUID,
    ) -> Optional[MeetingSession]:
        """Get a session by ID without user_id filter."""
        pass

    @abstractmethod
    async def get_active_by_task_id(
        self,
        task_id: UUID,
    ) -> Optional[MeetingSession]:
        """Get the active session (not COMPLETED) for a task without user_id filter."""
        pass

    @abstractmethod
    async def get_latest_by_task_id(
        self,
        task_id: UUID,
    ) -> Optional[MeetingSession]:
        """Get the most recent session for a task without user_id filter."""
        pass

    @abstractmethod
    async def update_by_id(
        self,
        session_id: UUID,
        data: MeetingSessionUpdate,
    ) -> Optional[MeetingSession]:
        """Update a session without user_id filter."""
        pass

    @abstractmethod
    async def delete_by_id(
        self,
        session_id: UUID,
    ) -> bool:
        """Delete a session without user_id filter."""
        pass

    @abstractmethod
    async def list_completed_by_recurring_meeting_id(
        self,
        recurring_meeting_id: UUID,
        limit: int = 50,
    ) -> list[MeetingSession]:
        """List COMPLETED sessions for a recurring meeting without user_id filter."""
        pass
