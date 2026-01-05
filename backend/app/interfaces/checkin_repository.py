"""
Check-in repository interface.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import date
from typing import Optional
from uuid import UUID

from app.models.collaboration import Checkin, CheckinCreate


class ICheckinRepository(ABC):
    """Abstract interface for check-in persistence."""

    @abstractmethod
    async def create(
        self, user_id: str, project_id: UUID, checkin: CheckinCreate
    ) -> Checkin:
        """Create a new check-in."""
        pass

    @abstractmethod
    async def list(
        self,
        user_id: str,
        project_id: UUID,
        member_user_id: Optional[str] = None,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
    ) -> list[Checkin]:
        """List check-ins for a project."""
        pass
