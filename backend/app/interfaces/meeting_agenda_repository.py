"""
Meeting agenda repository interface.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Optional
from uuid import UUID

from app.models.meeting_agenda import (
    MeetingAgendaItem,
    MeetingAgendaItemCreate,
    MeetingAgendaItemUpdate,
)


class IMeetingAgendaRepository(ABC):
    """Interface for meeting agenda repository."""

    @abstractmethod
    async def create(
        self,
        user_id: str,
        meeting_id: Optional[UUID],
        data: MeetingAgendaItemCreate,
    ) -> MeetingAgendaItem:
        """Create a new agenda item.

        Either meeting_id or data.task_id must be provided.
        - meeting_id: For recurring meeting agendas
        - data.task_id: For standalone meeting task agendas
        """
        pass

    @abstractmethod
    async def get(
        self,
        user_id: str,
        agenda_item_id: UUID,
    ) -> Optional[MeetingAgendaItem]:
        """Get an agenda item by ID."""
        pass

    @abstractmethod
    async def get_by_id(self, agenda_item_id: UUID) -> Optional[MeetingAgendaItem]:
        """Get an agenda item by ID without user check."""
        pass

    @abstractmethod
    async def list_by_meeting(
        self,
        user_id: str,
        meeting_id: UUID,
        limit: int = 100,
        offset: int = 0,
    ) -> list[MeetingAgendaItem]:
        """List all agenda items for a recurring meeting, ordered by order_index."""
        pass

    @abstractmethod
    async def list_by_task(
        self,
        user_id: str,
        task_id: UUID,
        limit: int = 100,
        offset: int = 0,
    ) -> list[MeetingAgendaItem]:
        """List all agenda items for a standalone meeting task, ordered by order_index."""
        pass

    @abstractmethod
    async def update(
        self,
        user_id: str,
        agenda_item_id: UUID,
        update: MeetingAgendaItemUpdate,
    ) -> MeetingAgendaItem:
        """Update an agenda item."""
        pass

    @abstractmethod
    async def delete(
        self,
        user_id: str,
        agenda_item_id: UUID,
    ) -> bool:
        """Delete an agenda item."""
        pass

    @abstractmethod
    async def reorder(
        self,
        user_id: str,
        ordered_ids: list[UUID],
        meeting_id: Optional[UUID] = None,
        task_id: Optional[UUID] = None,
    ) -> list[MeetingAgendaItem]:
        """Reorder agenda items by providing ordered list of IDs.

        Either meeting_id or task_id must be provided.
        """
        pass
