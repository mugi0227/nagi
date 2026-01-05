"""
User repository interface.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Optional
from uuid import UUID

from app.models.user import UserAccount, UserCreate


class IUserRepository(ABC):
    """Abstract interface for user persistence."""

    @abstractmethod
    async def get(self, user_id: UUID) -> Optional[UserAccount]:
        """Get a user by ID."""
        pass

    @abstractmethod
    async def get_by_provider(self, issuer: str, sub: str) -> Optional[UserAccount]:
        """Get a user by OIDC issuer + subject."""
        pass

    @abstractmethod
    async def get_by_email(self, email: str) -> Optional[UserAccount]:
        """Get a user by email."""
        pass

    @abstractmethod
    async def create(self, data: UserCreate) -> UserAccount:
        """Create a new user."""
        pass

    @abstractmethod
    async def update_provider(self, user_id: UUID, issuer: str, sub: str) -> UserAccount:
        """Update provider mapping for a user."""
        pass
