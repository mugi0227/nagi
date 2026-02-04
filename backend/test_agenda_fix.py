"""Test script to verify add_agenda_item works with task_id only."""
import asyncio
from datetime import date
from uuid import uuid4

from app.infrastructure.local.database import get_session_factory
from app.infrastructure.local.meeting_agenda_repository import SqliteMeetingAgendaRepository
from app.tools.meeting_agenda_tools import AddAgendaItemInput, add_agenda_item


async def test_add_agenda_with_task_id():
    """Test adding agenda item with task_id only (no meeting_id)."""
    print("\n=== Testing add_agenda_item with task_id only ===\n")

    # Setup
    session_factory = get_session_factory()
    repo = SqliteMeetingAgendaRepository(session_factory)
    user_id = "test_user"

    # Create test task_id (this would normally be a real task in the database)
    test_task_id = str(uuid4())
    print(f"Test task_id: {test_task_id}")

    # Test 1: Add agenda item with task_id only
    input_data = AddAgendaItemInput(
        task_id=test_task_id,
        title="Test Agenda Item - Task ID Only",
        description="This tests that we can create agenda items with task_id and no meeting_id",
        duration_minutes=15,
        order_index=0,
        event_date=date.today(),
    )

    try:
        result = await add_agenda_item(user_id, repo, input_data)
        print("\n[SUCCESS] Agenda item created with task_id only")
        print(f"  Created ID: {result['id']}")
        print(f"  Title: {result['title']}")
        print(f"  Task ID: {result['task_id']}")
        print(f"  Meeting ID: {result['meeting_id']}")

        if result['meeting_id'] is None:
            print("\n[VERIFIED] meeting_id is NULL as expected")
        else:
            print("\n[ERROR] meeting_id should be NULL but is not")
            return False

    except Exception as e:
        print(f"\n[FAILED] {e}")
        import traceback
        traceback.print_exc()
        return False

    # Test 2: Verify nullable constraint in database
    print("\n=== Testing database constraint ===\n")
    try:
        # This should work now (previously would fail with NOT NULL constraint)
        input_data2 = AddAgendaItemInput(
            task_id=str(uuid4()),
            title="Second Test Item",
            duration_minutes=10,
        )
        await add_agenda_item(user_id, repo, input_data2)
        print("[SUCCESS] Nullable constraint verified - meeting_id can be NULL")
        return True

    except Exception as e:
        print(f"✗ FAILED: {e}")
        return False


if __name__ == "__main__":
    success = asyncio.run(test_add_agenda_with_task_id())
    exit(0 if success else 1)
