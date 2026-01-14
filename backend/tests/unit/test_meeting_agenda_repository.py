"""
Unit tests for meeting agenda repository.
"""

import pytest
from uuid import uuid4

from app.infrastructure.local.meeting_agenda_repository import SqliteMeetingAgendaRepository
from app.models.meeting_agenda import MeetingAgendaItemCreate, MeetingAgendaItemUpdate


@pytest.mark.asyncio
async def test_create_agenda_item(session_factory, test_user_id):
    """Test creating an agenda item."""
    agenda_repo = SqliteMeetingAgendaRepository(session_factory=session_factory)
    meeting_id = uuid4()

    data = MeetingAgendaItemCreate(
        title="議題1: プロジェクト進捗報告",
        description="各チームの進捗を共有",
        duration_minutes=15,
        order_index=0,
    )

    item = await agenda_repo.create(test_user_id, meeting_id, data)

    assert item.title == "議題1: プロジェクト進捗報告"
    assert item.description == "各チームの進捗を共有"
    assert item.duration_minutes == 15
    assert item.order_index == 0
    assert item.meeting_id == meeting_id
    assert item.user_id == test_user_id
    assert item.is_completed is False


@pytest.mark.asyncio
async def test_list_agenda_items_ordered(session_factory, test_user_id):
    """Test listing agenda items in order."""
    agenda_repo = SqliteMeetingAgendaRepository(session_factory=session_factory)
    meeting_id = uuid4()

    # Create multiple items
    items_data = [
        MeetingAgendaItemCreate(title="議題3", order_index=2),
        MeetingAgendaItemCreate(title="議題1", order_index=0),
        MeetingAgendaItemCreate(title="議題2", order_index=1),
    ]

    for data in items_data:
        await agenda_repo.create(test_user_id, meeting_id, data)

    # List items
    items = await agenda_repo.list_by_meeting(test_user_id, meeting_id)

    assert len(items) == 3
    assert items[0].title == "議題1"
    assert items[1].title == "議題2"
    assert items[2].title == "議題3"


@pytest.mark.asyncio
async def test_update_agenda_item(session_factory, test_user_id):
    """Test updating an agenda item."""
    agenda_repo = SqliteMeetingAgendaRepository(session_factory=session_factory)
    meeting_id = uuid4()

    # Create item
    data = MeetingAgendaItemCreate(
        title="Original Title",
        duration_minutes=10,
    )
    item = await agenda_repo.create(test_user_id, meeting_id, data)

    # Update item
    update_data = MeetingAgendaItemUpdate(
        title="Updated Title",
        duration_minutes=20,
        is_completed=True,
    )
    updated = await agenda_repo.update(test_user_id, item.id, update_data)

    assert updated.title == "Updated Title"
    assert updated.duration_minutes == 20
    assert updated.is_completed is True


@pytest.mark.asyncio
async def test_delete_agenda_item(session_factory, test_user_id):
    """Test deleting an agenda item."""
    agenda_repo = SqliteMeetingAgendaRepository(session_factory=session_factory)
    meeting_id = uuid4()

    # Create item
    data = MeetingAgendaItemCreate(title="To Delete")
    item = await agenda_repo.create(test_user_id, meeting_id, data)

    # Delete item
    success = await agenda_repo.delete(test_user_id, item.id)
    assert success is True

    # Verify deletion
    deleted_item = await agenda_repo.get(test_user_id, item.id)
    assert deleted_item is None


@pytest.mark.asyncio
async def test_reorder_agenda_items(session_factory, test_user_id):
    """Test reordering agenda items."""
    agenda_repo = SqliteMeetingAgendaRepository(session_factory=session_factory)
    meeting_id = uuid4()

    # Create items
    item1 = await agenda_repo.create(
        test_user_id, meeting_id, MeetingAgendaItemCreate(title="Item 1", order_index=0)
    )
    item2 = await agenda_repo.create(
        test_user_id, meeting_id, MeetingAgendaItemCreate(title="Item 2", order_index=1)
    )
    item3 = await agenda_repo.create(
        test_user_id, meeting_id, MeetingAgendaItemCreate(title="Item 3", order_index=2)
    )

    # Reorder: 3, 1, 2
    new_order = [item3.id, item1.id, item2.id]
    items = await agenda_repo.reorder(test_user_id, meeting_id, new_order)

    assert len(items) == 3
    assert items[0].title == "Item 3"
    assert items[0].order_index == 0
    assert items[1].title == "Item 1"
    assert items[1].order_index == 1
    assert items[2].title == "Item 2"
    assert items[2].order_index == 2
