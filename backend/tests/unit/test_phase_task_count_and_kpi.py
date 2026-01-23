"""
Unit tests for Phase task count and KPI completion rate calculations.

These tests verify:
1. Phase task counts only count parent tasks (not subtasks)
2. KPI completion rate counts leaf tasks only (excludes parents with children)
3. Behavior after task deletion (physical deletion)
"""

import pytest
from datetime import datetime, timedelta
from uuid import uuid4, UUID

from app.infrastructure.local.task_repository import SqliteTaskRepository
from app.infrastructure.local.phase_repository import SqlitePhaseRepository
from app.infrastructure.local.project_repository import SqliteProjectRepository
from app.models.task import TaskCreate, TaskUpdate, Task
from app.models.phase import PhaseCreate
from app.models.project import ProjectCreate
from app.models.enums import Priority, EnergyLevel, CreatedBy, TaskStatus
from app.services.kpi_calculator import _compute_task_kpis


@pytest.mark.asyncio
async def test_phase_task_count_basic(session_factory, test_user_id):
    """Test basic phase task counting."""
    project_repo = SqliteProjectRepository(session_factory=session_factory)
    phase_repo = SqlitePhaseRepository(session_factory=session_factory)
    task_repo = SqliteTaskRepository(session_factory=session_factory)

    # Create project
    project = await project_repo.create(
        test_user_id,
        ProjectCreate(name="Test Project"),
    )

    # Create phase
    phase = await phase_repo.create(
        test_user_id,
        PhaseCreate(project_id=project.id, name="Phase 1", order_in_project=1),
    )

    # Create 3 tasks in phase
    for i in range(3):
        await task_repo.create(
            test_user_id,
            TaskCreate(
                title=f"Task {i}",
                phase_id=phase.id,
                project_id=project.id,
                created_by=CreatedBy.USER,
            ),
        )

    # Get phase with task counts
    phases = await phase_repo.list_by_project(test_user_id, project.id)
    assert len(phases) == 1
    assert phases[0].total_tasks == 3
    assert phases[0].completed_tasks == 0
    assert phases[0].in_progress_tasks == 0


@pytest.mark.asyncio
async def test_phase_task_count_excludes_subtasks(session_factory, test_user_id):
    """Test that phase task counts only count parent tasks, NOT subtasks."""
    project_repo = SqliteProjectRepository(session_factory=session_factory)
    phase_repo = SqlitePhaseRepository(session_factory=session_factory)
    task_repo = SqliteTaskRepository(session_factory=session_factory)

    # Create project and phase
    project = await project_repo.create(
        test_user_id,
        ProjectCreate(name="Test Project"),
    )
    phase = await phase_repo.create(
        test_user_id,
        PhaseCreate(project_id=project.id, name="Phase 1", order_in_project=1),
    )

    # Create parent task
    parent = await task_repo.create(
        test_user_id,
        TaskCreate(
            title="Parent Task",
            phase_id=phase.id,
            project_id=project.id,
            created_by=CreatedBy.USER,
        ),
    )

    # Create 2 subtasks
    for i in range(2):
        await task_repo.create(
            test_user_id,
            TaskCreate(
                title=f"Subtask {i}",
                parent_id=parent.id,
                phase_id=phase.id,
                project_id=project.id,
                created_by=CreatedBy.USER,
            ),
        )

    # Phase should count only 1 task (parent only, subtasks excluded)
    phases = await phase_repo.list_by_project(test_user_id, project.id)
    assert phases[0].total_tasks == 1  # Parent only, subtasks not counted


@pytest.mark.asyncio
async def test_phase_task_count_with_completed_tasks(session_factory, test_user_id):
    """Test phase task counts with completed tasks."""
    project_repo = SqliteProjectRepository(session_factory=session_factory)
    phase_repo = SqlitePhaseRepository(session_factory=session_factory)
    task_repo = SqliteTaskRepository(session_factory=session_factory)

    # Create project and phase
    project = await project_repo.create(
        test_user_id,
        ProjectCreate(name="Test Project"),
    )
    phase = await phase_repo.create(
        test_user_id,
        PhaseCreate(project_id=project.id, name="Phase 1", order_in_project=1),
    )

    # Create 3 tasks
    tasks = []
    for i in range(3):
        task = await task_repo.create(
            test_user_id,
            TaskCreate(
                title=f"Task {i}",
                phase_id=phase.id,
                project_id=project.id,
                created_by=CreatedBy.USER,
            ),
        )
        tasks.append(task)

    # Mark 2 tasks as done
    await task_repo.update(
        test_user_id, tasks[0].id, TaskUpdate(status=TaskStatus.DONE)
    )
    await task_repo.update(
        test_user_id, tasks[1].id, TaskUpdate(status=TaskStatus.DONE)
    )

    # Mark 1 task as in progress
    await task_repo.update(
        test_user_id, tasks[2].id, TaskUpdate(status=TaskStatus.IN_PROGRESS)
    )

    # Check counts
    phases = await phase_repo.list_by_project(test_user_id, project.id)
    assert phases[0].total_tasks == 3
    assert phases[0].completed_tasks == 2
    assert phases[0].in_progress_tasks == 1


@pytest.mark.asyncio
async def test_phase_task_count_after_deletion(session_factory, test_user_id):
    """Test that deleted tasks are NOT counted in phase (physical deletion)."""
    project_repo = SqliteProjectRepository(session_factory=session_factory)
    phase_repo = SqlitePhaseRepository(session_factory=session_factory)
    task_repo = SqliteTaskRepository(session_factory=session_factory)

    # Create project and phase
    project = await project_repo.create(
        test_user_id,
        ProjectCreate(name="Test Project"),
    )
    phase = await phase_repo.create(
        test_user_id,
        PhaseCreate(project_id=project.id, name="Phase 1", order_in_project=1),
    )

    # Create 3 tasks
    tasks = []
    for i in range(3):
        task = await task_repo.create(
            test_user_id,
            TaskCreate(
                title=f"Task {i}",
                phase_id=phase.id,
                project_id=project.id,
                created_by=CreatedBy.USER,
            ),
        )
        tasks.append(task)

    # Delete 1 task
    await task_repo.delete(test_user_id, tasks[0].id)

    # Should count 2 tasks (physical deletion)
    phases = await phase_repo.list_by_project(test_user_id, project.id)
    assert phases[0].total_tasks == 2


@pytest.mark.asyncio
async def test_kpi_completion_rate_basic():
    """Test basic KPI completion rate calculation."""
    # Create mock tasks
    tasks = [
        _create_mock_task(status=TaskStatus.DONE),
        _create_mock_task(status=TaskStatus.DONE),
        _create_mock_task(status=TaskStatus.TODO),
        _create_mock_task(status=TaskStatus.IN_PROGRESS),
    ]

    kpis = _compute_task_kpis(tasks)

    # 2 done out of 4 = 50%
    assert kpis["completion_rate"] == 50.0


@pytest.mark.asyncio
async def test_kpi_completion_rate_excludes_parent_with_children():
    """Test that KPI completion rate excludes parent tasks that have subtasks."""
    parent_id = uuid4()

    # Create parent task (TODO) with 2 subtasks (both DONE)
    # Parent is excluded because it has children
    # Only leaf tasks (subtasks) are counted
    tasks = [
        _create_mock_task(id=parent_id, status=TaskStatus.TODO),
        _create_mock_task(parent_id=parent_id, status=TaskStatus.DONE),
        _create_mock_task(parent_id=parent_id, status=TaskStatus.DONE),
    ]

    kpis = _compute_task_kpis(tasks)

    # Parent excluded, 2 subtasks both DONE → 2/2 = 100%
    assert kpis["completion_rate"] == 100.0


@pytest.mark.asyncio
async def test_kpi_completion_rate_mixed_subtasks():
    """Test KPI completion rate with parent and mixed subtask statuses."""
    parent_id = uuid4()

    # Parent (TODO) with 3 subtasks: 2 DONE, 1 TODO
    # Parent is excluded, only 3 subtasks counted
    tasks = [
        _create_mock_task(id=parent_id, status=TaskStatus.TODO),
        _create_mock_task(parent_id=parent_id, status=TaskStatus.DONE),
        _create_mock_task(parent_id=parent_id, status=TaskStatus.DONE),
        _create_mock_task(parent_id=parent_id, status=TaskStatus.TODO),
    ]

    kpis = _compute_task_kpis(tasks)

    # Parent excluded, 2/3 subtasks done → 66.67%
    assert kpis["completion_rate"] == pytest.approx(66.67, rel=0.01)


@pytest.mark.asyncio
async def test_kpi_completion_rate_all_done():
    """Test KPI completion rate when all tasks are done."""
    tasks = [
        _create_mock_task(status=TaskStatus.DONE),
        _create_mock_task(status=TaskStatus.DONE),
        _create_mock_task(status=TaskStatus.DONE),
    ]

    kpis = _compute_task_kpis(tasks)

    assert kpis["completion_rate"] == 100.0


@pytest.mark.asyncio
async def test_kpi_completion_rate_none_done():
    """Test KPI completion rate when no tasks are done."""
    tasks = [
        _create_mock_task(status=TaskStatus.TODO),
        _create_mock_task(status=TaskStatus.IN_PROGRESS),
        _create_mock_task(status=TaskStatus.WAITING),
    ]

    kpis = _compute_task_kpis(tasks)

    assert kpis["completion_rate"] == 0.0


@pytest.mark.asyncio
async def test_kpi_completion_rate_empty_list():
    """Test KPI completion rate with empty task list."""
    kpis = _compute_task_kpis([])

    assert kpis["completion_rate"] == 0.0


@pytest.mark.asyncio
async def test_kpi_wip_and_backlog_count():
    """Test WIP and backlog count in KPI calculation."""
    tasks = [
        _create_mock_task(status=TaskStatus.DONE),
        _create_mock_task(status=TaskStatus.IN_PROGRESS),
        _create_mock_task(status=TaskStatus.IN_PROGRESS),
        _create_mock_task(status=TaskStatus.TODO),
        _create_mock_task(status=TaskStatus.WAITING),
    ]

    kpis = _compute_task_kpis(tasks)

    assert kpis["wip_count"] == 2  # IN_PROGRESS tasks
    assert kpis["backlog_count"] == 4  # All non-DONE tasks


@pytest.mark.asyncio
async def test_kpi_overdue_tasks():
    """Test overdue task counting in KPI calculation."""
    now = datetime.utcnow()
    yesterday = now - timedelta(days=1)
    tomorrow = now + timedelta(days=1)

    tasks = [
        _create_mock_task(status=TaskStatus.TODO, due_date=yesterday),  # Overdue
        _create_mock_task(status=TaskStatus.TODO, due_date=tomorrow),  # Not overdue
        _create_mock_task(status=TaskStatus.DONE, due_date=yesterday),  # Done, not counted
    ]

    kpis = _compute_task_kpis(tasks)

    assert kpis["overdue_tasks"] == 1


@pytest.mark.asyncio
async def test_kpi_blocked_tasks():
    """Test blocked task counting in KPI calculation."""
    dependency_id = uuid4()

    tasks = [
        _create_mock_task(id=dependency_id, status=TaskStatus.TODO),  # Dependency not done
        _create_mock_task(
            status=TaskStatus.TODO, dependency_ids=[dependency_id]
        ),  # Blocked
        _create_mock_task(status=TaskStatus.WAITING),  # Also blocked (WAITING status)
    ]

    kpis = _compute_task_kpis(tasks)

    assert kpis["blocked_tasks"] == 2  # 1 with unfinished dependency + 1 WAITING


@pytest.mark.asyncio
async def test_phase_and_kpi_integration(session_factory, test_user_id):
    """Integration test: Phase task counts and KPI should be consistent."""
    project_repo = SqliteProjectRepository(session_factory=session_factory)
    phase_repo = SqlitePhaseRepository(session_factory=session_factory)
    task_repo = SqliteTaskRepository(session_factory=session_factory)

    # Create project and phase
    project = await project_repo.create(
        test_user_id,
        ProjectCreate(name="Test Project"),
    )
    phase = await phase_repo.create(
        test_user_id,
        PhaseCreate(project_id=project.id, name="Phase 1", order_in_project=1),
    )

    # Create 5 tasks: 2 done, 1 in progress, 2 todo
    tasks = []
    statuses = [
        TaskStatus.DONE,
        TaskStatus.DONE,
        TaskStatus.IN_PROGRESS,
        TaskStatus.TODO,
        TaskStatus.TODO,
    ]
    for i, status in enumerate(statuses):
        task = await task_repo.create(
            test_user_id,
            TaskCreate(
                title=f"Task {i}",
                phase_id=phase.id,
                project_id=project.id,
                created_by=CreatedBy.USER,
            ),
        )
        if status != TaskStatus.TODO:
            await task_repo.update(
                test_user_id, task.id, TaskUpdate(status=status)
            )
        tasks.append(task)

    # Get fresh task list from repository
    all_tasks = await task_repo.list(test_user_id, project_id=project.id, include_done=True)

    # Phase task counts
    phases = await phase_repo.list_by_project(test_user_id, project.id)
    assert phases[0].total_tasks == 5
    assert phases[0].completed_tasks == 2
    assert phases[0].in_progress_tasks == 1

    # KPI calculation
    kpis = _compute_task_kpis(all_tasks)
    assert kpis["completion_rate"] == 40.0  # 2/5 = 40%
    assert kpis["wip_count"] == 1
    assert kpis["backlog_count"] == 3  # TODO + IN_PROGRESS + WAITING (non-DONE)


def _create_mock_task(
    id: UUID | None = None,
    parent_id: UUID | None = None,
    status: TaskStatus = TaskStatus.TODO,
    due_date: datetime | None = None,
    dependency_ids: list[UUID] | None = None,
    estimated_minutes: int | None = None,
    progress: int = 0,
) -> Task:
    """Helper to create a mock Task object for testing."""
    return Task(
        id=id or uuid4(),
        user_id="test_user",
        title="Test Task",
        description=None,
        status=status,
        importance=Priority.MEDIUM,
        urgency=Priority.MEDIUM,
        energy_level=EnergyLevel.MEDIUM,
        created_by=CreatedBy.USER,
        parent_id=parent_id,
        project_id=None,
        phase_id=None,
        milestone_id=None,
        assignee_id=None,
        purpose=None,
        due_date=due_date,
        start_date=None,
        estimated_minutes=estimated_minutes,
        actual_minutes=None,
        progress=progress,
        completed_at=datetime.utcnow() if status == TaskStatus.DONE else None,
        dependency_ids=dependency_ids or [],
        tags=[],
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
