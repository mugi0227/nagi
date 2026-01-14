"""
Meeting agenda API endpoints.
"""

from datetime import date
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import CurrentUser, MeetingAgendaRepo
from app.models.meeting_agenda import (
    MeetingAgendaItem,
    MeetingAgendaItemCreate,
    MeetingAgendaItemUpdate,
)

router = APIRouter(prefix="/meeting-agendas", tags=["meeting-agendas"])


@router.post("/{meeting_id}/items", response_model=MeetingAgendaItem)
async def create_agenda_item(
    meeting_id: UUID,
    data: MeetingAgendaItemCreate,
    user: CurrentUser,
    repo: MeetingAgendaRepo,
):
    """Create a new agenda item for a meeting."""
    return await repo.create(user.id, meeting_id, data)


@router.get("/{meeting_id}/items", response_model=list[MeetingAgendaItem])
async def list_agenda_items(
    meeting_id: UUID,
    user: CurrentUser,
    repo: MeetingAgendaRepo,
    event_date: Optional[date] = None,
):
    """List all agenda items for a meeting."""
    return await repo.list_by_meeting(user.id, meeting_id, event_date)


@router.get("/items/{agenda_item_id}", response_model=MeetingAgendaItem)
async def get_agenda_item(
    agenda_item_id: UUID,
    user: CurrentUser,
    repo: MeetingAgendaRepo,
):
    """Get a specific agenda item."""
    item = await repo.get(user.id, agenda_item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Agenda item not found")
    return item


@router.patch("/items/{agenda_item_id}", response_model=MeetingAgendaItem)
async def update_agenda_item(
    agenda_item_id: UUID,
    data: MeetingAgendaItemUpdate,
    user: CurrentUser,
    repo: MeetingAgendaRepo,
):
    """Update an agenda item."""
    return await repo.update(user.id, agenda_item_id, data)


@router.delete("/items/{agenda_item_id}")
async def delete_agenda_item(
    agenda_item_id: UUID,
    user: CurrentUser,
    repo: MeetingAgendaRepo,
):
    """Delete an agenda item."""
    success = await repo.delete(user.id, agenda_item_id)
    if not success:
        raise HTTPException(status_code=404, detail="Agenda item not found")
    return {"success": True}


@router.post("/{meeting_id}/items/reorder", response_model=list[MeetingAgendaItem])
async def reorder_agenda_items(
    meeting_id: UUID,
    ordered_ids: list[UUID],
    user: CurrentUser,
    repo: MeetingAgendaRepo,
):
    """Reorder agenda items."""
    return await repo.reorder(user.id, meeting_id, ordered_ids)
