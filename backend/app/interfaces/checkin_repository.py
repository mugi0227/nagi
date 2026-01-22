"""
Check-in repository interface.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import date
from typing import Optional
from uuid import UUID

from app.models.collaboration import (
    Checkin,
    CheckinAgendaItems,
    CheckinCreate,
    CheckinCreateV2,
    CheckinUpdateV2,
    CheckinV2,
)
from app.models.enums import CheckinItemCategory


class ICheckinRepository(ABC):
    """Abstract interface for check-in persistence."""

    # ==========================================================================
    # V1 Methods (Legacy, backward compatibility)
    # ==========================================================================

    @abstractmethod
    async def create(
        self, user_id: str, project_id: UUID, checkin: CheckinCreate
    ) -> Checkin:
        """Create a new check-in (V1 legacy)."""
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
        """List check-ins for a project (V1 legacy)."""
        pass

    # ==========================================================================
    # V2 Methods (Structured check-ins)
    # ==========================================================================

    @abstractmethod
    async def create_v2(
        self, user_id: str, project_id: UUID, checkin: CheckinCreateV2
    ) -> CheckinV2:
        """Create a structured check-in (V2)."""
        pass

    @abstractmethod
    async def list_v2(
        self,
        user_id: str,
        project_id: UUID,
        member_user_id: Optional[str] = None,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        category: Optional[CheckinItemCategory] = None,
    ) -> list[CheckinV2]:
        """List structured check-ins (V2)."""
        pass

    @abstractmethod
    async def get_v2(
        self,
        checkin_id: UUID,
    ) -> Optional[CheckinV2]:
        """Get a single check-in by ID."""
        pass

    @abstractmethod
    async def update_v2(
        self,
        checkin_id: UUID,
        checkin: CheckinUpdateV2,
    ) -> Optional[CheckinV2]:
        """Update a structured check-in (V2)."""
        pass

    @abstractmethod
    async def delete_v2(
        self,
        checkin_id: UUID,
    ) -> bool:
        """Delete a check-in. Returns True if deleted, False if not found."""
        pass

    @abstractmethod
    async def get_agenda_items(
        self,
        user_id: str,
        project_id: UUID,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
    ) -> CheckinAgendaItems:
        """Get check-in items grouped by category for agenda generation."""
        pass
