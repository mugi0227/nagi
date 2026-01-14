"""
Unit tests for schedule diff service.
"""

import pytest
from datetime import date, datetime
from uuid import uuid4

from app.models.schedule import ScheduleResponse, ScheduleDay, TaskScheduleInfo
from app.models.schedule_snapshot import (
    ScheduleSnapshot,
    SnapshotTaskScheduleInfo,
    SnapshotDayAllocation,
)
from app.services.schedule_diff_service import ScheduleDiffService


def make_snapshot_task(
    task_id=None,
    title: str = "Test Task",
    planned_start=None,
    planned_end=None,
) -> SnapshotTaskScheduleInfo:
    """Create a test snapshot task."""
    return SnapshotTaskScheduleInfo(
        task_id=task_id or uuid4(),
        title=title,
        planned_start=planned_start or date.today(),
        planned_end=planned_end or date.today(),
        total_minutes=60,
    )


def make_schedule_task(
    task_id=None,
    title: str = "Test Task",
    planned_start=None,
    planned_end=None,
) -> TaskScheduleInfo:
    """Create a test schedule task."""
    return TaskScheduleInfo(
        task_id=task_id or uuid4(),
        title=title,
        planned_start=planned_start or date.today(),
        planned_end=planned_end or date.today(),
        total_minutes=60,
        priority_score=1.0,
    )


class TestScheduleDiffService:
    """Tests for ScheduleDiffService."""

    def test_on_track_within_threshold(self):
        """Task within ±1 day threshold should be on_track."""
        service = ScheduleDiffService(on_track_threshold_days=1)
        task_id = uuid4()

        baseline_end = date(2024, 1, 10)
        current_end = date(2024, 1, 11)  # 1 day later

        snapshot = ScheduleSnapshot(
            id=uuid4(),
            user_id="test",
            project_id=uuid4(),
            name="Test",
            start_date=date.today(),
            tasks=[make_snapshot_task(task_id=task_id, planned_end=baseline_end)],
            days=[],
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )

        current_schedule = ScheduleResponse(
            start_date=date.today(),
            days=[],
            tasks=[make_schedule_task(task_id=task_id, planned_end=current_end)],
        )

        diff = service.calculate_diff(
            snapshot=snapshot,
            current_schedule=current_schedule,
            completed_task_ids=set(),
            phases=[],
        )

        assert len(diff.task_diffs) == 1
        assert diff.task_diffs[0].status == "on_track"
        assert diff.summary["on_track_count"] == 1

    def test_delayed_task(self):
        """Task more than threshold days late should be delayed."""
        service = ScheduleDiffService(on_track_threshold_days=1)
        task_id = uuid4()

        baseline_end = date(2024, 1, 10)
        current_end = date(2024, 1, 15)  # 5 days later

        snapshot = ScheduleSnapshot(
            id=uuid4(),
            user_id="test",
            project_id=uuid4(),
            name="Test",
            start_date=date.today(),
            tasks=[make_snapshot_task(task_id=task_id, planned_end=baseline_end)],
            days=[],
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )

        current_schedule = ScheduleResponse(
            start_date=date.today(),
            days=[],
            tasks=[make_schedule_task(task_id=task_id, planned_end=current_end)],
        )

        diff = service.calculate_diff(
            snapshot=snapshot,
            current_schedule=current_schedule,
            completed_task_ids=set(),
            phases=[],
        )

        assert diff.task_diffs[0].status == "delayed"
        assert diff.task_diffs[0].delay_days == 5
        assert diff.summary["delayed_count"] == 1

    def test_ahead_task(self):
        """Task ahead of schedule should have ahead status."""
        service = ScheduleDiffService(on_track_threshold_days=1)
        task_id = uuid4()

        baseline_end = date(2024, 1, 15)
        current_end = date(2024, 1, 10)  # 5 days earlier

        snapshot = ScheduleSnapshot(
            id=uuid4(),
            user_id="test",
            project_id=uuid4(),
            name="Test",
            start_date=date.today(),
            tasks=[make_snapshot_task(task_id=task_id, planned_end=baseline_end)],
            days=[],
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )

        current_schedule = ScheduleResponse(
            start_date=date.today(),
            days=[],
            tasks=[make_schedule_task(task_id=task_id, planned_end=current_end)],
        )

        diff = service.calculate_diff(
            snapshot=snapshot,
            current_schedule=current_schedule,
            completed_task_ids=set(),
            phases=[],
        )

        assert diff.task_diffs[0].status == "ahead"
        assert diff.task_diffs[0].delay_days == -5
        assert diff.summary["ahead_count"] == 1

    def test_completed_task(self):
        """Completed task should have completed status."""
        service = ScheduleDiffService()
        task_id = uuid4()

        snapshot = ScheduleSnapshot(
            id=uuid4(),
            user_id="test",
            project_id=uuid4(),
            name="Test",
            start_date=date.today(),
            tasks=[make_snapshot_task(task_id=task_id)],
            days=[],
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )

        current_schedule = ScheduleResponse(
            start_date=date.today(),
            days=[],
            tasks=[],  # Not in current schedule
        )

        diff = service.calculate_diff(
            snapshot=snapshot,
            current_schedule=current_schedule,
            completed_task_ids={task_id},  # Marked as completed
            phases=[],
        )

        assert diff.task_diffs[0].status == "completed"
        assert diff.summary["completed_count"] == 1

    def test_new_task(self):
        """Task not in baseline should have new status."""
        service = ScheduleDiffService()
        task_id = uuid4()

        snapshot = ScheduleSnapshot(
            id=uuid4(),
            user_id="test",
            project_id=uuid4(),
            name="Test",
            start_date=date.today(),
            tasks=[],  # No tasks in baseline
            days=[],
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )

        current_schedule = ScheduleResponse(
            start_date=date.today(),
            days=[],
            tasks=[make_schedule_task(task_id=task_id)],
        )

        diff = service.calculate_diff(
            snapshot=snapshot,
            current_schedule=current_schedule,
            completed_task_ids=set(),
            phases=[],
        )

        assert diff.task_diffs[0].status == "new"
        assert diff.summary["new_count"] == 1
