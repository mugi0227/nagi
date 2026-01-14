"""
Schedule snapshot models for baseline management and CCPM buffer tracking.

This module defines the Pydantic models for schedule snapshots
that capture planned schedules for comparison with actuals.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field


# ===========================================
# Snapshot Detail Models
# ===========================================


class SnapshotTaskScheduleInfo(BaseModel):
    """Scheduled task information within a snapshot."""

    task_id: UUID
    title: str
    project_id: Optional[UUID] = None
    phase_id: Optional[UUID] = None
    parent_id: Optional[UUID] = None
    planned_start: Optional[date] = None
    planned_end: Optional[date] = None
    total_minutes: int
    dependency_ids: list[UUID] = Field(default_factory=list)


class SnapshotDayAllocation(BaseModel):
    """Daily allocation within a snapshot."""

    date: date
    capacity_minutes: int
    allocated_minutes: int
    task_allocations: list[dict] = Field(default_factory=list)  # [{task_id, minutes}]


class PhaseBufferInfo(BaseModel):
    """Buffer information for a phase (CCPM)."""

    phase_id: UUID
    phase_name: str
    total_buffer_minutes: int = Field(..., description="総バッファ")
    consumed_buffer_minutes: int = Field(0, description="消費済みバッファ")
    buffer_percentage: float = Field(..., ge=0, le=100, description="残りバッファ（%）")
    critical_chain_length_minutes: int = Field(..., description="クリティカルチェーン長")
    status: Literal["healthy", "warning", "critical"] = Field(
        ..., description="healthy: <33%, warning: <67%, critical: >=67%"
    )


# ===========================================
# Snapshot CRUD Models
# ===========================================


class ScheduleSnapshotCreate(BaseModel):
    """Request model for creating a schedule snapshot."""

    name: Optional[str] = Field(None, description="スナップショット名（省略時は自動生成）")
    capacity_hours: float = Field(8.0, description="1日のキャパシティ（時間）")
    capacity_by_weekday: Optional[list[float]] = Field(
        None, description="曜日別キャパシティ [月,火,水,木,金,土,日]"
    )
    max_days: int = Field(60, description="スケジュール対象日数")
    buffer_ratio: float = Field(0.5, ge=0, le=1, description="バッファ比率（デフォルト50%）")


class ScheduleSnapshot(BaseModel):
    """Complete schedule snapshot with all details."""

    id: UUID
    user_id: str
    project_id: UUID
    name: str
    is_active: bool = False
    start_date: date
    tasks: list[SnapshotTaskScheduleInfo]
    days: list[SnapshotDayAllocation]
    phase_buffers: list[PhaseBufferInfo] = Field(default_factory=list)
    total_buffer_minutes: int = 0
    consumed_buffer_minutes: int = 0
    capacity_hours: float = 8.0
    capacity_by_weekday: Optional[list[float]] = None
    max_days: int = 60
    created_at: datetime
    updated_at: datetime


class ScheduleSnapshotSummary(BaseModel):
    """Summary model for listing snapshots."""

    id: UUID
    project_id: UUID
    name: str
    is_active: bool
    start_date: date
    task_count: int
    total_buffer_minutes: int
    consumed_buffer_minutes: int
    buffer_percentage: float = Field(..., description="残りバッファ（%）")
    created_at: datetime


# ===========================================
# Diff Models
# ===========================================


class TaskScheduleDiff(BaseModel):
    """Difference for a single task."""

    task_id: UUID
    title: str
    status: Literal["on_track", "delayed", "ahead", "new", "removed", "completed"]
    baseline_start: Optional[date] = None
    baseline_end: Optional[date] = None
    current_start: Optional[date] = None
    current_end: Optional[date] = None
    delay_days: int = 0  # positive = delayed, negative = ahead


class PhaseScheduleDiff(BaseModel):
    """Difference for a phase."""

    phase_id: UUID
    phase_name: str
    baseline_end: Optional[date] = None
    current_end: Optional[date] = None
    delay_days: int = 0
    buffer_status: Literal["healthy", "warning", "critical"]
    buffer_percentage: float


class ScheduleDiff(BaseModel):
    """Complete schedule difference between baseline and current."""

    snapshot_id: UUID
    snapshot_name: str
    compared_at: datetime
    task_diffs: list[TaskScheduleDiff]
    phase_diffs: list[PhaseScheduleDiff]
    summary: dict = Field(
        default_factory=dict,
        description="Summary stats: on_track_count, delayed_count, ahead_count, etc."
    )
