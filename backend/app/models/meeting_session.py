"""
Meeting session models.

Session data for tracking meeting progress (preparation, in-progress, completed).
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.enums import MeetingSessionStatus


class MeetingSessionBase(BaseModel):
    """Base fields for meeting sessions."""

    status: MeetingSessionStatus = Field(
        MeetingSessionStatus.PREPARATION,
        description="セッションの状態"
    )
    current_agenda_index: Optional[int] = Field(
        None,
        ge=0,
        description="現在進行中のアジェンダインデックス"
    )
    transcript: Optional[str] = Field(
        None,
        max_length=50000,
        description="会議の議事録・メモ"
    )
    summary: Optional[str] = Field(
        None,
        max_length=10000,
        description="会議のサマリー"
    )


class MeetingSessionCreate(BaseModel):
    """Create a new meeting session."""

    task_id: UUID = Field(..., description="会議タスクのID")


class MeetingSessionUpdate(BaseModel):
    """Update meeting session fields."""

    status: Optional[MeetingSessionStatus] = None
    current_agenda_index: Optional[int] = Field(None, ge=0)
    transcript: Optional[str] = Field(None, max_length=50000)
    summary: Optional[str] = Field(None, max_length=10000)
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None


class MeetingSession(MeetingSessionBase):
    """Meeting session with metadata."""

    id: UUID
    user_id: str
    task_id: UUID
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
