"""
Unit tests for Check-in V2 models.

Tests model validation for the structured check-in feature.
"""

from datetime import date
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.models.collaboration import (
    CheckinCreateV2,
    CheckinItem,
    CheckinItemResponse,
    CheckinV2,
    CheckinAgendaItems,
)
from app.models.enums import (
    CheckinItemCategory,
    CheckinItemUrgency,
    CheckinMood,
    CheckinType,
)


class TestCheckinItem:
    """Tests for CheckinItem model."""

    def test_valid_item_minimal(self):
        """Test creating item with minimal fields."""
        item = CheckinItem(
            category=CheckinItemCategory.BLOCKER,
            content="API connection issue",
        )
        assert item.category == CheckinItemCategory.BLOCKER
        assert item.content == "API connection issue"
        assert item.urgency == CheckinItemUrgency.MEDIUM  # default
        assert item.related_task_id is None

    def test_valid_item_full(self):
        """Test creating item with all fields."""
        task_id = str(uuid4())
        item = CheckinItem(
            category=CheckinItemCategory.DISCUSSION,
            content="Need to discuss architecture",
            related_task_id=task_id,
            urgency=CheckinItemUrgency.HIGH,
        )
        assert item.category == CheckinItemCategory.DISCUSSION
        assert item.content == "Need to discuss architecture"
        assert item.related_task_id == task_id
        assert item.urgency == CheckinItemUrgency.HIGH

    def test_all_categories(self):
        """Test all category types."""
        categories = [
            CheckinItemCategory.BLOCKER,
            CheckinItemCategory.DISCUSSION,
            CheckinItemCategory.UPDATE,
            CheckinItemCategory.REQUEST,
        ]
        for cat in categories:
            item = CheckinItem(category=cat, content="test content")
            assert item.category == cat

    def test_all_urgency_levels(self):
        """Test all urgency levels."""
        urgencies = [
            CheckinItemUrgency.HIGH,
            CheckinItemUrgency.MEDIUM,
            CheckinItemUrgency.LOW,
        ]
        for urg in urgencies:
            item = CheckinItem(
                category=CheckinItemCategory.BLOCKER,
                content="test",
                urgency=urg,
            )
            assert item.urgency == urg

    def test_empty_content_fails(self):
        """Test that empty content fails validation."""
        with pytest.raises(ValidationError):
            CheckinItem(
                category=CheckinItemCategory.BLOCKER,
                content="",
            )

    def test_content_too_long_fails(self):
        """Test that content over 2000 chars fails."""
        long_content = "x" * 2001
        with pytest.raises(ValidationError):
            CheckinItem(
                category=CheckinItemCategory.BLOCKER,
                content=long_content,
            )

    def test_content_max_length_passes(self):
        """Test that content at 2000 chars passes."""
        max_content = "x" * 2000
        item = CheckinItem(
            category=CheckinItemCategory.BLOCKER,
            content=max_content,
        )
        assert len(item.content) == 2000


class TestCheckinCreateV2:
    """Tests for CheckinCreateV2 model."""

    def test_valid_minimal(self):
        """Test creating check-in with minimal fields."""
        checkin = CheckinCreateV2(
            member_user_id="user123",
            checkin_date=date(2025, 1, 20),
        )
        assert checkin.member_user_id == "user123"
        assert checkin.checkin_date == date(2025, 1, 20)
        assert checkin.items == []
        assert checkin.mood is None
        assert checkin.free_comment is None

    def test_valid_full(self):
        """Test creating check-in with all fields."""
        checkin = CheckinCreateV2(
            member_user_id="user123",
            checkin_date=date(2025, 1, 20),
            items=[
                CheckinItem(
                    category=CheckinItemCategory.BLOCKER,
                    content="Blocked on API",
                    urgency=CheckinItemUrgency.HIGH,
                ),
                CheckinItem(
                    category=CheckinItemCategory.DISCUSSION,
                    content="Architecture review needed",
                ),
            ],
            mood=CheckinMood.OKAY,
            must_discuss_in_next_meeting="Performance optimization",
            free_comment="Generally progressing well",
            checkin_type=CheckinType.WEEKLY,
            raw_text="Legacy raw text",
        )
        assert len(checkin.items) == 2
        assert checkin.mood == CheckinMood.OKAY
        assert checkin.must_discuss_in_next_meeting == "Performance optimization"
        assert checkin.free_comment == "Generally progressing well"
        assert checkin.checkin_type == CheckinType.WEEKLY
        assert checkin.raw_text == "Legacy raw text"

    def test_all_mood_values(self):
        """Test all mood values."""
        moods = [CheckinMood.GOOD, CheckinMood.OKAY, CheckinMood.STRUGGLING]
        for mood in moods:
            checkin = CheckinCreateV2(
                member_user_id="user123",
                checkin_date=date(2025, 1, 20),
                mood=mood,
            )
            assert checkin.mood == mood

    def test_member_user_id_empty_fails(self):
        """Test that empty member_user_id fails."""
        with pytest.raises(ValidationError):
            CheckinCreateV2(
                member_user_id="",
                checkin_date=date(2025, 1, 20),
            )

    def test_member_user_id_too_long_fails(self):
        """Test that member_user_id over 255 chars fails."""
        with pytest.raises(ValidationError):
            CheckinCreateV2(
                member_user_id="x" * 256,
                checkin_date=date(2025, 1, 20),
            )

    def test_must_discuss_too_long_fails(self):
        """Test that must_discuss over 2000 chars fails."""
        with pytest.raises(ValidationError):
            CheckinCreateV2(
                member_user_id="user123",
                checkin_date=date(2025, 1, 20),
                must_discuss_in_next_meeting="x" * 2001,
            )

    def test_free_comment_too_long_fails(self):
        """Test that free_comment over 4000 chars fails."""
        with pytest.raises(ValidationError):
            CheckinCreateV2(
                member_user_id="user123",
                checkin_date=date(2025, 1, 20),
                free_comment="x" * 4001,
            )

    def test_multiple_items(self):
        """Test with multiple items of different categories."""
        checkin = CheckinCreateV2(
            member_user_id="user123",
            checkin_date=date(2025, 1, 20),
            items=[
                CheckinItem(category=CheckinItemCategory.BLOCKER, content="blocker1"),
                CheckinItem(category=CheckinItemCategory.BLOCKER, content="blocker2"),
                CheckinItem(category=CheckinItemCategory.DISCUSSION, content="discussion1"),
                CheckinItem(category=CheckinItemCategory.REQUEST, content="request1"),
                CheckinItem(category=CheckinItemCategory.UPDATE, content="update1"),
            ],
        )
        assert len(checkin.items) == 5
        assert sum(1 for i in checkin.items if i.category == CheckinItemCategory.BLOCKER) == 2


class TestCheckinV2:
    """Tests for CheckinV2 response model."""

    def test_valid_response(self):
        """Test creating a valid V2 response model."""
        from datetime import datetime

        checkin = CheckinV2(
            id=uuid4(),
            user_id="owner123",
            project_id=uuid4(),
            member_user_id="user123",
            checkin_date=date(2025, 1, 20),
            items=[
                CheckinItemResponse(
                    id=uuid4(),
                    category=CheckinItemCategory.BLOCKER,
                    content="API issue",
                    urgency=CheckinItemUrgency.HIGH,
                    related_task_title="Fix API",
                ),
            ],
            mood=CheckinMood.OKAY,
            must_discuss_in_next_meeting="Performance",
            free_comment="Notes",
            checkin_type=CheckinType.WEEKLY,
            summary_text="Summary",
            raw_text="Raw text",
            created_at=datetime.utcnow(),
        )
        assert len(checkin.items) == 1
        assert checkin.items[0].related_task_title == "Fix API"
        assert checkin.mood == CheckinMood.OKAY


class TestCheckinAgendaItems:
    """Tests for CheckinAgendaItems model."""

    def test_empty_agenda_items(self):
        """Test creating empty agenda items."""
        agenda = CheckinAgendaItems(project_id=uuid4())
        assert agenda.blockers == []
        assert agenda.discussions == []
        assert agenda.requests == []
        assert agenda.updates == []
        assert agenda.member_moods == {}
        assert agenda.must_discuss_items == []

    def test_populated_agenda_items(self):
        """Test creating populated agenda items."""
        project_id = uuid4()
        agenda = CheckinAgendaItems(
            project_id=project_id,
            start_date=date(2025, 1, 13),
            end_date=date(2025, 1, 20),
            blockers=[
                {"member": "user1", "content": "API blocked", "urgency": "high"},
            ],
            discussions=[
                {"member": "user2", "content": "Architecture discussion"},
            ],
            requests=[
                {"member": "user1", "content": "Need code review"},
            ],
            updates=[
                {"member": "user3", "content": "Completed feature X"},
            ],
            member_moods={"user1": CheckinMood.STRUGGLING, "user2": CheckinMood.GOOD},
            must_discuss_items=[
                {"member": "user1", "content": "Urgent decision needed"},
            ],
        )
        assert len(agenda.blockers) == 1
        assert len(agenda.discussions) == 1
        assert len(agenda.requests) == 1
        assert len(agenda.updates) == 1
        assert len(agenda.member_moods) == 2
        assert agenda.member_moods["user1"] == CheckinMood.STRUGGLING
        assert len(agenda.must_discuss_items) == 1
