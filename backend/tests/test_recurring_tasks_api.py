"""
Integration tests for Recurring Tasks API endpoints.

Tests CRUD operations via the repository layer with an in-memory SQLite database.
"""

import pytest
from uuid import uuid4

from app.models.enums import RecurringTaskFrequency
from app.models.recurring_task import RecurringTaskCreate, RecurringTaskUpdate
from app.infrastructure.local.recurring_task_repository import SqliteRecurringTaskRepository
from datetime import date


@pytest.mark.asyncio
async def test_create_recurring_task(session_factory, test_user_id):
    """Test creating a recurring task definition."""
    repo = SqliteRecurringTaskRepository(session_factory=session_factory)
    data = RecurringTaskCreate(
        title="Weekly Report",
        frequency=RecurringTaskFrequency.WEEKLY,
        weekday=0,
        anchor_date=date(2025, 3, 10),
    )
    created = await repo.create(test_user_id, data)

    assert created.title == "Weekly Report"
    assert created.frequency == RecurringTaskFrequency.WEEKLY
    assert created.weekday == 0
    assert created.is_active is True
    assert created.id is not None


@pytest.mark.asyncio
async def test_list_recurring_tasks(session_factory, test_user_id):
    """Test listing recurring task definitions."""
    repo = SqliteRecurringTaskRepository(session_factory=session_factory)

    # Create two definitions
    await repo.create(
        test_user_id,
        RecurringTaskCreate(
            title="Daily Standup Note",
            frequency=RecurringTaskFrequency.DAILY,
            anchor_date=date(2025, 3, 1),
        ),
    )
    await repo.create(
        test_user_id,
        RecurringTaskCreate(
            title="Monthly Billing",
            frequency=RecurringTaskFrequency.MONTHLY,
            day_of_month=15,
            anchor_date=date(2025, 3, 15),
        ),
    )

    items = await repo.list(test_user_id)
    assert len(items) == 2
    titles = {item.title for item in items}
    assert "Daily Standup Note" in titles
    assert "Monthly Billing" in titles


@pytest.mark.asyncio
async def test_get_recurring_task(session_factory, test_user_id):
    """Test getting a recurring task by ID."""
    repo = SqliteRecurringTaskRepository(session_factory=session_factory)
    created = await repo.create(
        test_user_id,
        RecurringTaskCreate(
            title="Test Get",
            frequency=RecurringTaskFrequency.WEEKLY,
            weekday=2,
            anchor_date=date(2025, 3, 12),
        ),
    )

    fetched = await repo.get(test_user_id, created.id)
    assert fetched is not None
    assert fetched.id == created.id
    assert fetched.title == "Test Get"
    assert fetched.weekday == 2


@pytest.mark.asyncio
async def test_update_recurring_task(session_factory, test_user_id):
    """Test updating a recurring task definition."""
    repo = SqliteRecurringTaskRepository(session_factory=session_factory)
    created = await repo.create(
        test_user_id,
        RecurringTaskCreate(
            title="Original Title",
            frequency=RecurringTaskFrequency.DAILY,
            anchor_date=date(2025, 3, 1),
        ),
    )

    updated = await repo.update(
        test_user_id,
        created.id,
        RecurringTaskUpdate(title="Updated Title", is_active=False),
    )
    assert updated.title == "Updated Title"
    assert updated.is_active is False


@pytest.mark.asyncio
async def test_delete_recurring_task(session_factory, test_user_id):
    """Test deleting a recurring task definition."""
    repo = SqliteRecurringTaskRepository(session_factory=session_factory)
    created = await repo.create(
        test_user_id,
        RecurringTaskCreate(
            title="To Delete",
            frequency=RecurringTaskFrequency.DAILY,
            anchor_date=date(2025, 3, 1),
        ),
    )

    deleted = await repo.delete(test_user_id, created.id)
    assert deleted is True

    fetched = await repo.get(test_user_id, created.id)
    assert fetched is None


@pytest.mark.asyncio
async def test_delete_nonexistent_returns_false(session_factory, test_user_id):
    """Test deleting a nonexistent recurring task returns False."""
    repo = SqliteRecurringTaskRepository(session_factory=session_factory)
    deleted = await repo.delete(test_user_id, uuid4())
    assert deleted is False


@pytest.mark.asyncio
async def test_list_filters_inactive(session_factory, test_user_id):
    """Test that inactive definitions are filtered by default."""
    repo = SqliteRecurringTaskRepository(session_factory=session_factory)
    created = await repo.create(
        test_user_id,
        RecurringTaskCreate(
            title="Active Task",
            frequency=RecurringTaskFrequency.DAILY,
            anchor_date=date(2025, 3, 1),
        ),
    )
    # Deactivate
    await repo.update(test_user_id, created.id, RecurringTaskUpdate(is_active=False))

    # Default: exclude inactive
    items = await repo.list(test_user_id, include_inactive=False)
    assert len(items) == 0

    # Include inactive
    items = await repo.list(test_user_id, include_inactive=True)
    assert len(items) == 1
    assert items[0].is_active is False
