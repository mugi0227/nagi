from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class HeartbeatIntensity(str, Enum):
    GENTLE = "gentle"
    STANDARD = "standard"
    FIRM = "firm"


class HeartbeatSeverity(str, Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class HeartbeatSettings(BaseModel):
    user_id: str
    enabled: bool = True
    notification_limit_per_day: int = Field(2, ge=1, le=3)
    notification_window_start: str = Field("09:00", min_length=5, max_length=5)
    notification_window_end: str = Field("21:00", min_length=5, max_length=5)
    heartbeat_intensity: HeartbeatIntensity = HeartbeatIntensity.STANDARD
    daily_capacity_per_task_minutes: int = Field(60, ge=15, le=480)
    cooldown_hours_per_task: int = Field(24, ge=1, le=168)
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class HeartbeatSettingsUpdate(BaseModel):
    enabled: Optional[bool] = None
    notification_limit_per_day: Optional[int] = Field(None, ge=1, le=3)
    notification_window_start: Optional[str] = Field(None, min_length=5, max_length=5)
    notification_window_end: Optional[str] = Field(None, min_length=5, max_length=5)
    heartbeat_intensity: Optional[HeartbeatIntensity] = None
    daily_capacity_per_task_minutes: Optional[int] = Field(None, ge=15, le=480)
    cooldown_hours_per_task: Optional[int] = Field(None, ge=1, le=168)


class HeartbeatEvent(BaseModel):
    id: UUID
    user_id: str
    task_id: Optional[UUID] = None
    severity: HeartbeatSeverity
    risk_score: float = Field(..., ge=0)
    notification_id: Optional[UUID] = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    is_read: bool = False
    read_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


class HeartbeatEventCreate(BaseModel):
    user_id: str
    task_id: Optional[UUID] = None
    severity: HeartbeatSeverity
    risk_score: float = Field(..., ge=0)
    notification_id: Optional[UUID] = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    is_read: bool = False
    read_at: Optional[datetime] = None
