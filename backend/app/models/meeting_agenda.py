"""
Meeting agenda models.

Agenda items for recurring meetings.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class MeetingAgendaItemBase(BaseModel):
    """Base fields for agenda items."""

    title: str = Field(..., min_length=1, max_length=500, description="議題タイトル")
    description: Optional[str] = Field(None, max_length=2000, description="議題の詳細説明")
    duration_minutes: Optional[int] = Field(None, ge=1, le=480, description="割り当て時間（分）")
    order_index: int = Field(0, ge=0, description="表示順序")
    event_date: Optional[date] = Field(None, description="開催日 (YYYY-MM-DD)")
    task_id: Optional[UUID] = Field(None, description="単発会議タスクID（RecurringMeetingを持たない会議用）")


class MeetingAgendaItemCreate(MeetingAgendaItemBase):
    """Create a new agenda item."""

    pass


class MeetingAgendaItemUpdate(BaseModel):
    """Update agenda item fields."""

    title: Optional[str] = Field(None, min_length=1, max_length=500)
    description: Optional[str] = Field(None, max_length=2000)
    duration_minutes: Optional[int] = Field(None, ge=1, le=480)
    order_index: Optional[int] = Field(None, ge=0)
    is_completed: Optional[bool] = None
    event_date: Optional[date] = None
    task_id: Optional[UUID] = None


class MeetingAgendaItem(MeetingAgendaItemBase):
    """Meeting agenda item with metadata."""

    id: UUID
    meeting_id: Optional[UUID] = None  # For RecurringMeeting (optional since task_id can be used instead)
    user_id: str
    is_completed: bool = False
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
