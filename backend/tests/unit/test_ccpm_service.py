"""
Unit tests for CCPM service.
"""

from datetime import datetime
from typing import Optional
from uuid import uuid4

from app.models.task import Task
from app.services.ccpm_service import CCPMService


def make_task(
    title: str = "Test Task",
    estimated_minutes: Optional[int] = 60,
    status: str = "TODO",
    phase_id: str = None,
    dependency_ids: list = None,
    parent_id: str = None,
) -> Task:
    """Create a test task."""
    now = datetime.utcnow()
    return Task(
        id=uuid4(),
        user_id="test-user",
        title=title,
        estimated_minutes=estimated_minutes,
        status=status,
        phase_id=uuid4() if phase_id is None else phase_id,
        dependency_ids=dependency_ids or [],
        parent_id=parent_id,
        urgency="MEDIUM",
        importance="MEDIUM",
        created_at=now,
        updated_at=now,
    )


class TestCCPMService:
    """Tests for CCPMService."""

    def test_filter_for_ccpm_excludes_done_tasks(self):
        """Completed tasks should be excluded from CCPM calculations."""
        service = CCPMService()
        tasks = [
            make_task(title="Task 1", status="TODO"),
            make_task(title="Task 2", status="DONE"),
            make_task(title="Task 3", status="IN_PROGRESS"),
        ]

        estimated, unestimated = service.filter_for_ccpm(tasks)

        assert len(estimated) == 2
        assert all(t.status != "DONE" for t in estimated)

    def test_filter_for_ccpm_excludes_subtasks(self):
        """Subtasks (with parent_id) should be excluded."""
        service = CCPMService()
        parent_id = uuid4()
        tasks = [
            make_task(title="Parent", parent_id=None),
            make_task(title="Subtask", parent_id=str(parent_id)),
        ]

        estimated, unestimated = service.filter_for_ccpm(tasks)

        assert len(estimated) == 1
        assert estimated[0].title == "Parent"

    def test_filter_for_ccpm_separates_by_estimate(self):
        """Tasks without estimates go to unestimated list."""
        service = CCPMService()
        tasks = [
            make_task(title="Estimated", estimated_minutes=60),
            make_task(title="Unestimated", estimated_minutes=None),
        ]

        estimated, unestimated = service.filter_for_ccpm(tasks)

        assert len(estimated) == 1
        assert len(unestimated) == 1

    def test_calculate_phase_buffers_empty_phase(self):
        """Phase with no tasks should have zero buffer."""
        service = CCPMService()
        phases = [{"id": uuid4(), "name": "Empty Phase"}]
        tasks = []

        buffers = service.calculate_phase_buffers(tasks, phases)

        assert len(buffers) == 1
        assert buffers[0].total_buffer_minutes == 0
        assert buffers[0].status == "healthy"

    def test_calculate_phase_buffers_with_tasks(self):
        """Phase with tasks should calculate buffer based on critical chain."""
        service = CCPMService(default_buffer_ratio=0.5)
        phase_id = uuid4()
        phases = [{"id": phase_id, "name": "Phase 1"}]
        tasks = [
            make_task(title="Task 1", estimated_minutes=120, phase_id=str(phase_id)),
            make_task(title="Task 2", estimated_minutes=60, phase_id=str(phase_id)),
        ]

        buffers = service.calculate_phase_buffers(tasks, phases)

        assert len(buffers) == 1
        # Critical chain length should be at least 120 minutes (longest single task)
        assert buffers[0].critical_chain_length_minutes >= 120
        assert buffers[0].total_buffer_minutes > 0
        assert buffers[0].status == "healthy"

    def test_get_buffer_status_healthy(self):
        """Status should be healthy when consumption < 33%."""
        service = CCPMService()

        status = service.get_buffer_status(total_buffer=100, consumed_buffer=30)

        assert status == "healthy"

    def test_get_buffer_status_warning(self):
        """Status should be warning when consumption is 33-66%."""
        service = CCPMService()

        status = service.get_buffer_status(total_buffer=100, consumed_buffer=50)

        assert status == "warning"

    def test_get_buffer_status_critical(self):
        """Status should be critical when consumption >= 67%."""
        service = CCPMService()

        status = service.get_buffer_status(total_buffer=100, consumed_buffer=70)

        assert status == "critical"
