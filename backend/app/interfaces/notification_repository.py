"""
Notification repository interface.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Optional
from uuid import UUID

from app.models.notification import Notification, NotificationCreate


class INotificationRepository(ABC):
    """Abstract interface for notification persistence."""

    @abstractmethod
    async def create(self, notification: NotificationCreate) -> Notification:
        """Create a new notification."""
        pass

    @abstractmethod
    async def create_bulk(self, notifications: list[NotificationCreate]) -> list[Notification]:
        """Create multiple notifications at once."""
        pass

    @abstractmethod
    async def get(self, user_id: str, notification_id: UUID) -> Optional[Notification]:
        """Get a notification by ID."""
        pass

    @abstractmethod
    async def list(
        self,
        user_id: str,
        unread_only: bool = False,
        limit: int = 50,
        offset: int = 0,
    ) -> list[Notification]:
        """List notifications for a user."""
        pass

    @abstractmethod
    async def mark_as_read(self, user_id: str, notification_id: UUID) -> Optional[Notification]:
        """Mark a notification as read."""
        pass

    @abstractmethod
    async def mark_all_as_read(self, user_id: str) -> int:
        """Mark all notifications as read. Returns count of updated notifications."""
        pass

    @abstractmethod
    async def get_unread_count(self, user_id: str) -> int:
        """Get count of unread notifications."""
        pass

    @abstractmethod
    async def delete(self, user_id: str, notification_id: UUID) -> bool:
        """Delete a notification."""
        pass
