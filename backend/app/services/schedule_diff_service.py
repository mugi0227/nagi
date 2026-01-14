"""
Schedule diff service for comparing baseline with current schedule.

This module provides functionality to calculate differences between
a saved baseline snapshot and the current schedule state.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal, Optional
from uuid import UUID

from app.models.schedule import ScheduleResponse, TaskScheduleInfo
from app.models.schedule_snapshot import (
    PhaseScheduleDiff,
    ScheduleDiff,
    ScheduleSnapshot,
    TaskScheduleDiff,
)


class ScheduleDiffService:
    """Service for calculating schedule differences."""

    def __init__(self, on_track_threshold_days: int = 1):
        """
        Initialize diff service.

        Args:
            on_track_threshold_days: Threshold for considering a task on_track (default ±1 day)
        """
        self.on_track_threshold_days = on_track_threshold_days

    def _get_diff_status(
        self,
        baseline_end: Optional[date],
        current_end: Optional[date],
        is_completed: bool,
    ) -> tuple[Literal["on_track", "delayed", "ahead", "new", "removed", "completed"], int]:
        """
        Determine the status of a task based on dates.

        Returns:
            Tuple of (status, delay_days)
        """
        if is_completed:
            return "completed", 0

        if baseline_end is None:
            return "new", 0

        if current_end is None:
            return "removed", 0

        delay_days = (current_end - baseline_end).days

        if abs(delay_days) <= self.on_track_threshold_days:
            return "on_track", delay_days
        elif delay_days > 0:
            return "delayed", delay_days
        else:
            return "ahead", delay_days

    def calculate_diff(
        self,
        snapshot: ScheduleSnapshot,
        current_schedule: ScheduleResponse,
        completed_task_ids: set[UUID],
        phases: list[dict],  # [{id, name}]
    ) -> ScheduleDiff:
        """
        Calculate the difference between baseline and current schedule.

        Args:
            snapshot: The baseline snapshot
            current_schedule: Current schedule state
            completed_task_ids: Set of completed task IDs
            phases: List of phase info dicts

        Returns:
            ScheduleDiff with all task and phase differences
        """
        # Build lookup maps
        baseline_tasks = {t.task_id: t for t in snapshot.tasks}
        current_tasks = {t.task_id: t for t in current_schedule.tasks}

        all_task_ids = set(baseline_tasks.keys()) | set(current_tasks.keys())

        task_diffs = []
        summary = {
            "on_track_count": 0,
            "delayed_count": 0,
            "ahead_count": 0,
            "new_count": 0,
            "removed_count": 0,
            "completed_count": 0,
        }

        for task_id in all_task_ids:
            baseline = baseline_tasks.get(task_id)
            current = current_tasks.get(task_id)
            is_completed = task_id in completed_task_ids

            # Get title from whichever source has it
            title = ""
            if current:
                title = current.title
            elif baseline:
                title = baseline.title

            baseline_start = baseline.planned_start if baseline else None
            baseline_end = baseline.planned_end if baseline else None
            current_start = current.planned_start if current else None
            current_end = current.planned_end if current else None

            status, delay_days = self._get_diff_status(baseline_end, current_end, is_completed)

            task_diffs.append(TaskScheduleDiff(
                task_id=task_id,
                title=title,
                status=status,
                baseline_start=baseline_start,
                baseline_end=baseline_end,
                current_start=current_start,
                current_end=current_end,
                delay_days=delay_days,
            ))

            summary[f"{status}_count"] += 1

        # Calculate phase diffs
        phase_diffs = self._calculate_phase_diffs(
            snapshot, current_schedule, phases
        )

        return ScheduleDiff(
            snapshot_id=snapshot.id,
            snapshot_name=snapshot.name,
            compared_at=datetime.utcnow(),
            task_diffs=task_diffs,
            phase_diffs=phase_diffs,
            summary=summary,
        )

    def _calculate_phase_diffs(
        self,
        snapshot: ScheduleSnapshot,
        current_schedule: ScheduleResponse,
        phases: list[dict],
    ) -> list[PhaseScheduleDiff]:
        """Calculate differences at the phase level."""
        phase_diffs = []

        # Build phase end date maps from tasks
        baseline_phase_ends: dict[str, Optional[date]] = {}
        current_phase_ends: dict[str, Optional[date]] = {}

        for task in snapshot.tasks:
            if task.phase_id:
                phase_key = str(task.phase_id)
                if task.planned_end:
                    if phase_key not in baseline_phase_ends or (
                        baseline_phase_ends[phase_key] and
                        task.planned_end > baseline_phase_ends[phase_key]
                    ):
                        baseline_phase_ends[phase_key] = task.planned_end

        # Build phase_id lookup from baseline snapshot tasks
        task_phase_map: dict[UUID, str] = {}
        for task in snapshot.tasks:
            if task.phase_id:
                task_phase_map[task.task_id] = str(task.phase_id)

        for task in current_schedule.tasks:
            # Use the phase_id from snapshot's task mapping
            phase_key = task_phase_map.get(task.task_id)
            if phase_key and task.planned_end:
                if phase_key not in current_phase_ends or (
                    current_phase_ends[phase_key] and
                    task.planned_end > current_phase_ends[phase_key]
                ):
                    current_phase_ends[phase_key] = task.planned_end

        # Use snapshot's buffer info and calculate consumed buffer
        buffer_map = {str(b.phase_id): b for b in snapshot.phase_buffers}

        for phase in phases:
            phase_id = str(phase["id"])
            phase_name = phase["name"]

            baseline_end = baseline_phase_ends.get(phase_id)
            current_end = current_phase_ends.get(phase_id)

            delay_days = 0
            if baseline_end and current_end:
                delay_days = (current_end - baseline_end).days

            buffer_info = buffer_map.get(phase_id)
            buffer_status: Literal["healthy", "warning", "critical"] = "healthy"
            buffer_pct = 100.0

            if buffer_info:
                # Calculate consumed buffer from delay
                # Positive delay_days means we're behind schedule
                consumed_minutes = max(0, delay_days * 8 * 60)  # Convert days to minutes (8h/day)
                total_buffer = buffer_info.total_buffer_minutes

                if total_buffer > 0:
                    # Calculate remaining buffer percentage
                    remaining_minutes = max(0, total_buffer - consumed_minutes)
                    buffer_pct = (remaining_minutes / total_buffer) * 100

                    # Determine status based on consumption
                    consumption_pct = (consumed_minutes / total_buffer) * 100
                    if consumption_pct < 33:
                        buffer_status = "healthy"
                    elif consumption_pct < 67:
                        buffer_status = "warning"
                    else:
                        buffer_status = "critical"
                else:
                    buffer_status = buffer_info.status
                    buffer_pct = buffer_info.buffer_percentage

            phase_diffs.append(PhaseScheduleDiff(
                phase_id=UUID(phase_id),
                phase_name=phase_name,
                baseline_end=baseline_end,
                current_end=current_end,
                delay_days=delay_days,
                buffer_status=buffer_status,
                buffer_percentage=buffer_pct,
            ))

        return phase_diffs
