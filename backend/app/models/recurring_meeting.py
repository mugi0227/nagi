"""
Recurring meeting models.

Defines the recurring meeting series used to auto-generate meeting tasks.
"""

from __future__ import annotations

from datetime import date, datetime, time
from enum import Enum
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field, model_validator


class RecurrenceFrequency(str, Enum):
    """Supported recurrence frequencies."""

    WEEKLY = "weekly"
    BIWEEKLY = "biweekly"


class RecurringMeetingBase(BaseModel):
    """Base fields for recurring meetings."""

    title: str = Field(..., min_length=1, max_length=500)
    project_id: Optional[UUID] = None
    frequency: RecurrenceFrequency = RecurrenceFrequency.WEEKLY
    weekday: int = Field(..., ge=0, le=6, description="0=Monday ... 6=Sunday")
    start_time: time
    duration_minutes: int = Field(..., ge=15, le=480)
    location: Optional[str] = Field(None, max_length=500)
    attendees: list[str] = Field(default_factory=list)
    agenda_window_days: int = Field(7, ge=1, le=30)
    is_active: bool = Field(True)


class RecurringMeetingCreate(RecurringMeetingBase):
    """Create a new recurring meeting series."""

    anchor_date: Optional[date] = None


class RecurringMeetingUpdate(BaseModel):
    """Update recurring meeting fields."""

    title: Optional[str] = Field(None, min_length=1, max_length=500)
    project_id: Optional[UUID] = None
    frequency: Optional[RecurrenceFrequency] = None
    weekday: Optional[int] = Field(None, ge=0, le=6)
    start_time: Optional[time] = None
    duration_minutes: Optional[int] = Field(None, ge=15, le=480)
    location: Optional[str] = Field(None, max_length=500)
    attendees: Optional[list[str]] = None
    agenda_window_days: Optional[int] = Field(None, ge=1, le=30)
    is_active: Optional[bool] = None
    anchor_date: Optional[date] = None
    last_occurrence: Optional[datetime] = None


class RecurringMeeting(RecurringMeetingBase):
    """Recurring meeting series with metadata."""

    id: UUID
    user_id: str
    anchor_date: date
    last_occurrence: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    @model_validator(mode="after")
    def validate_anchor_date(self):
        if self.anchor_date.weekday() != self.weekday:
            raise ValueError("anchor_date weekday must match weekday")
        return self

    class Config:
        from_attributes = True
