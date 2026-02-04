"""
Unit tests for Task purpose field (new feature).

Tests the following changes:
1. TaskCreate with purpose field
2. TaskUpdate with purpose field
3. Task retrieval includes purpose
"""


import pytest

from app.infrastructure.local.task_repository import SqliteTaskRepository
from app.models.enums import CreatedBy, EnergyLevel, Priority
from app.models.task import TaskCreate, TaskUpdate


@pytest.mark.asyncio
async def test_create_task_with_purpose(session_factory, test_user_id):
    """Test creating a task with purpose field."""
    repo = SqliteTaskRepository(session_factory=session_factory)

    task_data = TaskCreate(
        title="Test Task with Purpose",
        description="Test description",
        purpose="このタスクを完了することで、プロジェクトの進捗が明確になる",
        importance=Priority.HIGH,
        urgency=Priority.MEDIUM,
        energy_level=EnergyLevel.LOW,
        created_by=CreatedBy.USER,
    )

    task = await repo.create(test_user_id, task_data)

    assert task.id is not None
    assert task.title == "Test Task with Purpose"
    assert task.purpose == "このタスクを完了することで、プロジェクトの進捗が明確になる"
    assert task.user_id == test_user_id


@pytest.mark.asyncio
async def test_create_task_without_purpose(session_factory, test_user_id):
    """Test creating a task without purpose field (should be None)."""
    repo = SqliteTaskRepository(session_factory=session_factory)

    task_data = TaskCreate(
        title="Test Task without Purpose",
        created_by=CreatedBy.USER,
    )

    task = await repo.create(test_user_id, task_data)

    assert task.id is not None
    assert task.title == "Test Task without Purpose"
    assert task.purpose is None


@pytest.mark.asyncio
async def test_get_task_with_purpose(session_factory, test_user_id):
    """Test getting a task by ID includes purpose field."""
    repo = SqliteTaskRepository(session_factory=session_factory)

    task_data = TaskCreate(
        title="Test Task",
        purpose="重要な目的",
        created_by=CreatedBy.USER,
    )
    created = await repo.create(test_user_id, task_data)

    retrieved = await repo.get(test_user_id, created.id)

    assert retrieved is not None
    assert retrieved.id == created.id
    assert retrieved.purpose == "重要な目的"


@pytest.mark.asyncio
async def test_update_task_purpose(session_factory, test_user_id):
    """Test updating task purpose field."""
    repo = SqliteTaskRepository(session_factory=session_factory)

    # Create task without purpose
    task_data = TaskCreate(
        title="Original Task",
        created_by=CreatedBy.USER,
    )
    created = await repo.create(test_user_id, task_data)
    assert created.purpose is None

    # Update with purpose
    update = TaskUpdate(purpose="新しい目的を追加")
    updated = await repo.update(test_user_id, created.id, update)

    assert updated.purpose == "新しい目的を追加"


@pytest.mark.asyncio
async def test_update_task_clear_purpose(session_factory, test_user_id):
    """Test clearing task purpose field."""
    repo = SqliteTaskRepository(session_factory=session_factory)

    # Create task with purpose
    task_data = TaskCreate(
        title="Task with Purpose",
        purpose="元の目的",
        created_by=CreatedBy.USER,
    )
    created = await repo.create(test_user_id, task_data)
    assert created.purpose == "元の目的"

    # Update to clear purpose (set to empty string)
    update = TaskUpdate(purpose="")
    updated = await repo.update(test_user_id, created.id, update)

    # Empty string should be stored
    assert updated.purpose == ""


@pytest.mark.asyncio
async def test_list_tasks_includes_purpose(session_factory, test_user_id):
    """Test listing tasks includes purpose field."""
    repo = SqliteTaskRepository(session_factory=session_factory)

    # Create tasks with different purposes
    purposes = ["目的1", "目的2", None]
    for i, purpose in enumerate(purposes):
        task_data = TaskCreate(
            title=f"Task {i}",
            purpose=purpose,
            created_by=CreatedBy.USER,
        )
        await repo.create(test_user_id, task_data)

    tasks = await repo.list(test_user_id)

    assert len(tasks) == 3
    # Check that purposes are correctly stored and retrieved
    task_purposes = {task.title: task.purpose for task in tasks}
    assert task_purposes["Task 0"] == "目的1"
    assert task_purposes["Task 1"] == "目的2"
    assert task_purposes["Task 2"] is None


@pytest.mark.asyncio
async def test_task_purpose_max_length(session_factory, test_user_id):
    """Test task purpose respects max length constraint (1000 chars)."""
    repo = SqliteTaskRepository(session_factory=session_factory)

    # Create a long purpose (within limit)
    long_purpose = "あ" * 500  # 500 characters, within 1000 limit
    task_data = TaskCreate(
        title="Task with Long Purpose",
        purpose=long_purpose,
        created_by=CreatedBy.USER,
    )

    task = await repo.create(test_user_id, task_data)
    assert task.purpose == long_purpose
    assert len(task.purpose) == 500
