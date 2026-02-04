"""
Recurring task models.

Defines the recurring task definitions used to auto-generate task instances.
"""

from __future__ import annotations

from datetime import date, datetime, time
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.enums import EnergyLevel, Priority, RecurringTaskFrequency


class RecurringTaskBase(BaseModel):
    """Base fields for recurring tasks."""

    title: str = Field(..., min_length=1, max_length=500)
    description: Optional[str] = Field(None, max_length=2000)
    purpose: Optional[str] = Field(None, max_length=1000)
    project_id: Optional[UUID] = None
    phase_id: Optional[UUID] = None
    frequency: RecurringTaskFrequency = RecurringTaskFrequency.WEEKLY
    weekday: Optional[int] = Field(
        None, ge=0, le=6, description="0=Monday ... 6=Sunday, for WEEKLY/BIWEEKLY"
    )
    day_of_month: Optional[int] = Field(
        None, ge=1, le=31, description="Day of month, for MONTHLY/BIMONTHLY"
    )
    custom_interval_days: Optional[int] = Field(
        None, ge=1, le=365, description="Interval in days, for CUSTOM frequency"
    )
    start_time: Optional[time] = Field(
        None, description="Optional time-of-day for generated tasks"
    )
    estimated_minutes: Optional[int] = Field(None, ge=1)
    importance: Priority = Priority.MEDIUM
    urgency: Priority = Priority.MEDIUM
    energy_level: EnergyLevel = EnergyLevel.LOW
    is_active: bool = True


class RecurringTaskCreate(RecurringTaskBase):
    """Create a new recurring task definition."""

    anchor_date: Optional[date] = None


class RecurringTaskUpdate(BaseModel):
    """Update recurring task fields."""

    title: Optional[str] = Field(None, min_length=1, max_length=500)
    description: Optional[str] = Field(None, max_length=2000)
    purpose: Optional[str] = Field(None, max_length=1000)
    project_id: Optional[UUID] = None
    phase_id: Optional[UUID] = None
    frequency: Optional[RecurringTaskFrequency] = None
    weekday: Optional[int] = Field(None, ge=0, le=6)
    day_of_month: Optional[int] = Field(None, ge=1, le=31)
    custom_interval_days: Optional[int] = Field(None, ge=1, le=365)
    start_time: Optional[time] = None
    estimated_minutes: Optional[int] = Field(None, ge=1)
    importance: Optional[Priority] = None
    urgency: Optional[Priority] = None
    energy_level: Optional[EnergyLevel] = None
    is_active: Optional[bool] = None
    anchor_date: Optional[date] = None
    last_generated_date: Optional[date] = None


class RecurringTask(RecurringTaskBase):
    """Recurring task definition with metadata."""

    id: UUID
    user_id: str
    anchor_date: date
    last_generated_date: Optional[date] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
