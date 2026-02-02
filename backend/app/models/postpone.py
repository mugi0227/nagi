"""
Postpone event model definitions.

Tracks when tasks are postponed to later dates.
"""

from datetime import date, datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class PostponeEvent(BaseModel):
    """A recorded postponement of a task."""

    id: UUID
    user_id: str
    task_id: UUID
    from_date: date
    to_date: date
    reason: Optional[str] = None
    pinned: bool = False
    created_at: datetime

    class Config:
        from_attributes = True


class PostponeRequest(BaseModel):
    """Request to postpone a task."""

    to_date: date = Field(..., description="移動先の日付")
    pin: bool = Field(False, description="日付にピン留めするか")
    reason: Optional[str] = Field(None, max_length=500, description="延期理由（任意）")


class DoTodayRequest(BaseModel):
    """Request to pull a task into today's schedule."""

    pin: bool = Field(True, description="今日にピン留めするか")


class PostponeTaskSummary(BaseModel):
    """Summary of postponements for a single task."""

    task_id: UUID
    task_title: str
    postpone_count: int


class PostponeStats(BaseModel):
    """Aggregate postponement statistics."""

    total_postpones: int = Field(description="期間内の総延期回数")
    unique_tasks: int = Field(description="延期されたユニークタスク数")
    most_postponed: list[PostponeTaskSummary] = Field(
        default_factory=list, description="延期回数が多いタスク上位"
    )
