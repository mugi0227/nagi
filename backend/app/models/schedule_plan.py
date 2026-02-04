"""
Models for daily schedule plans and schedule settings.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.schedule import (
    ExcludedTask,
    ScheduleDay,
    ScheduleResponse,
    TaskScheduleInfo,
    UnscheduledTask,
)


class WorkBreak(BaseModel):
    start: str
    end: str


class WorkdayHours(BaseModel):
    enabled: bool = True
    start: str
    end: str
    breaks: list[WorkBreak] = Field(default_factory=list)


DEFAULT_WORKDAY_START = "09:00"
DEFAULT_WORKDAY_END = "18:00"
DEFAULT_BREAK_START = "12:00"
DEFAULT_BREAK_END = "13:00"


def default_weekly_work_hours() -> list[WorkdayHours]:
    return [
        WorkdayHours(
            enabled=True,
            start=DEFAULT_WORKDAY_START,
            end=DEFAULT_WORKDAY_END,
            breaks=[WorkBreak(start=DEFAULT_BREAK_START, end=DEFAULT_BREAK_END)],
        )
        for _ in range(7)
    ]


class ScheduleSettings(BaseModel):
    user_id: str
    weekly_work_hours: list[WorkdayHours] = Field(default_factory=list)
    buffer_hours: float = 1.0
    break_after_task_minutes: int = 5
    created_at: datetime
    updated_at: datetime


class ScheduleSettingsUpdate(BaseModel):
    weekly_work_hours: Optional[list[WorkdayHours]] = None
    buffer_hours: Optional[float] = None
    break_after_task_minutes: Optional[int] = None


class TaskPlanSnapshot(BaseModel):
    task_id: UUID
    title: str
    fingerprint: str


class PendingChange(BaseModel):
    task_id: UUID
    title: str
    change_type: Literal["new", "updated", "removed"]


class ScheduleTimeBlock(BaseModel):
    task_id: UUID
    start: datetime
    end: datetime
    kind: Literal["meeting", "auto"]
    status: Optional[str] = None
    pinned_date: Optional[date] = None


class DailySchedulePlanCreate(BaseModel):
    user_id: str
    plan_date: date
    timezone: str
    plan_group_id: UUID
    schedule_day: ScheduleDay
    tasks: list[TaskScheduleInfo]
    unscheduled_task_ids: list[UnscheduledTask] = Field(default_factory=list)
    excluded_tasks: list[ExcludedTask] = Field(default_factory=list)
    time_blocks: list[ScheduleTimeBlock] = Field(default_factory=list)
    task_snapshots: list[TaskPlanSnapshot] = Field(default_factory=list)
    pinned_overflow_task_ids: list[UUID] = Field(default_factory=list)
    plan_params: dict = Field(default_factory=dict)
    generated_at: datetime


class DailySchedulePlan(DailySchedulePlanCreate):
    id: UUID
    updated_at: datetime


class SchedulePlanResponse(ScheduleResponse):
    plan_state: Literal["planned", "stale", "forecast"] = "forecast"
    plan_group_id: Optional[UUID] = None
    plan_generated_at: Optional[datetime] = None
    pending_changes: list[PendingChange] = Field(default_factory=list)
    time_blocks: list[ScheduleTimeBlock] = Field(default_factory=list)
    pinned_overflow_task_ids: list[UUID] = Field(default_factory=list)
