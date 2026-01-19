"""
Unit tests for Check-in V2 repository.

Tests CRUD operations for structured check-ins.
"""

from datetime import date
from uuid import uuid4

import pytest

from app.infrastructure.local.checkin_repository import SqliteCheckinRepository
from app.models.collaboration import (
    CheckinCreateV2,
    CheckinItem,
)
from app.models.enums import (
    CheckinItemCategory,
    CheckinItemUrgency,
    CheckinMood,
    CheckinType,
)


@pytest.fixture
def repository(db_session):
    """Create repository with test session."""
    def factory():
        # Return async context manager that yields the session
        class SessionCtx:
            async def __aenter__(self):
                return db_session

            async def __aexit__(self, exc_type, exc_val, exc_tb):
                pass

        return SessionCtx()

    return SqliteCheckinRepository(session_factory=factory)


@pytest.fixture
def user_id():
    return "test_user_123"


@pytest.fixture
def project_id():
    return uuid4()


class TestCheckinV2Create:
    """Tests for create_v2 method."""

    @pytest.mark.asyncio
    async def test_create_minimal(self, repository, user_id, project_id):
        """Test creating a minimal V2 check-in."""
        checkin_data = CheckinCreateV2(
            member_user_id="member1",
            checkin_date=date(2025, 1, 20),
        )

        result = await repository.create_v2(user_id, project_id, checkin_data)

        assert result.id is not None
        assert result.user_id == user_id
        assert result.project_id == project_id
        assert result.member_user_id == "member1"
        assert result.checkin_date == date(2025, 1, 20)
        assert result.items == []
        assert result.mood is None
        assert result.created_at is not None

    @pytest.mark.asyncio
    async def test_create_with_items(self, repository, user_id, project_id):
        """Test creating a check-in with structured items."""
        checkin_data = CheckinCreateV2(
            member_user_id="member1",
            checkin_date=date(2025, 1, 20),
            items=[
                CheckinItem(
                    category=CheckinItemCategory.BLOCKER,
                    content="API connection issue",
                    urgency=CheckinItemUrgency.HIGH,
                ),
                CheckinItem(
                    category=CheckinItemCategory.DISCUSSION,
                    content="Need to discuss architecture",
                ),
            ],
        )

        result = await repository.create_v2(user_id, project_id, checkin_data)

        assert len(result.items) == 2
        assert result.items[0].category == CheckinItemCategory.BLOCKER
        assert result.items[0].content == "API connection issue"
        assert result.items[0].urgency == CheckinItemUrgency.HIGH
        assert result.items[1].category == CheckinItemCategory.DISCUSSION

    @pytest.mark.asyncio
    async def test_create_with_mood(self, repository, user_id, project_id):
        """Test creating a check-in with mood."""
        checkin_data = CheckinCreateV2(
            member_user_id="member1",
            checkin_date=date(2025, 1, 20),
            mood=CheckinMood.STRUGGLING,
        )

        result = await repository.create_v2(user_id, project_id, checkin_data)

        assert result.mood == CheckinMood.STRUGGLING

    @pytest.mark.asyncio
    async def test_create_full(self, repository, user_id, project_id):
        """Test creating a fully populated check-in."""
        task_id = str(uuid4())
        checkin_data = CheckinCreateV2(
            member_user_id="member1",
            checkin_date=date(2025, 1, 20),
            items=[
                CheckinItem(
                    category=CheckinItemCategory.BLOCKER,
                    content="Blocked on API",
                    related_task_id=task_id,
                    urgency=CheckinItemUrgency.HIGH,
                ),
                CheckinItem(
                    category=CheckinItemCategory.REQUEST,
                    content="Need code review",
                    urgency=CheckinItemUrgency.MEDIUM,
                ),
            ],
            mood=CheckinMood.OKAY,
            must_discuss_in_next_meeting="Performance optimization",
            free_comment="Generally going well",
            checkin_type=CheckinType.WEEKLY,
        )

        result = await repository.create_v2(user_id, project_id, checkin_data)

        assert len(result.items) == 2
        assert result.mood == CheckinMood.OKAY
        assert result.must_discuss_in_next_meeting == "Performance optimization"
        assert result.free_comment == "Generally going well"
        assert result.items[0].related_task_id == task_id
        # raw_text should be auto-generated for backward compatibility
        assert result.raw_text is not None
        assert "ブロッカー" in result.raw_text

    @pytest.mark.asyncio
    async def test_create_generates_raw_text(self, repository, user_id, project_id):
        """Test that raw_text is auto-generated from structured data."""
        checkin_data = CheckinCreateV2(
            member_user_id="member1",
            checkin_date=date(2025, 1, 20),
            items=[
                CheckinItem(
                    category=CheckinItemCategory.BLOCKER,
                    content="API blocked",
                ),
                CheckinItem(
                    category=CheckinItemCategory.DISCUSSION,
                    content="Architecture review",
                ),
            ],
            mood=CheckinMood.GOOD,
            free_comment="Additional notes",
        )

        result = await repository.create_v2(user_id, project_id, checkin_data)

        assert "ブロッカー" in result.raw_text
        assert "API blocked" in result.raw_text
        assert "相談" in result.raw_text
        assert "Architecture review" in result.raw_text
        assert "順調" in result.raw_text
        assert "Additional notes" in result.raw_text


class TestCheckinV2List:
    """Tests for list_v2 method."""

    @pytest.mark.asyncio
    async def test_list_empty(self, repository, user_id, project_id):
        """Test listing when no check-ins exist."""
        result = await repository.list_v2(user_id, project_id)
        assert result == []

    @pytest.mark.asyncio
    async def test_list_multiple(self, repository, user_id, project_id):
        """Test listing multiple check-ins."""
        # Create multiple check-ins
        for i in range(3):
            await repository.create_v2(
                user_id,
                project_id,
                CheckinCreateV2(
                    member_user_id=f"member{i}",
                    checkin_date=date(2025, 1, 18 + i),
                    mood=CheckinMood.GOOD,
                ),
            )

        result = await repository.list_v2(user_id, project_id)

        assert len(result) == 3
        # Should be ordered by date desc
        assert result[0].checkin_date == date(2025, 1, 20)
        assert result[2].checkin_date == date(2025, 1, 18)

    @pytest.mark.asyncio
    async def test_list_filter_by_member(self, repository, user_id, project_id):
        """Test filtering by member_user_id."""
        # Create check-ins for different members
        await repository.create_v2(
            user_id,
            project_id,
            CheckinCreateV2(
                member_user_id="member1",
                checkin_date=date(2025, 1, 20),
            ),
        )
        await repository.create_v2(
            user_id,
            project_id,
            CheckinCreateV2(
                member_user_id="member2",
                checkin_date=date(2025, 1, 20),
            ),
        )

        result = await repository.list_v2(user_id, project_id, member_user_id="member1")

        assert len(result) == 1
        assert result[0].member_user_id == "member1"

    @pytest.mark.asyncio
    async def test_list_filter_by_date_range(self, repository, user_id, project_id):
        """Test filtering by date range."""
        # Create check-ins across dates
        for day in [15, 18, 20, 25]:
            await repository.create_v2(
                user_id,
                project_id,
                CheckinCreateV2(
                    member_user_id="member1",
                    checkin_date=date(2025, 1, day),
                ),
            )

        result = await repository.list_v2(
            user_id,
            project_id,
            start_date=date(2025, 1, 17),
            end_date=date(2025, 1, 22),
        )

        assert len(result) == 2
        dates = [r.checkin_date for r in result]
        assert date(2025, 1, 18) in dates
        assert date(2025, 1, 20) in dates

    @pytest.mark.asyncio
    async def test_list_includes_items(self, repository, user_id, project_id):
        """Test that list includes items."""
        await repository.create_v2(
            user_id,
            project_id,
            CheckinCreateV2(
                member_user_id="member1",
                checkin_date=date(2025, 1, 20),
                items=[
                    CheckinItem(
                        category=CheckinItemCategory.BLOCKER,
                        content="Blocker content",
                    ),
                    CheckinItem(
                        category=CheckinItemCategory.DISCUSSION,
                        content="Discussion content",
                    ),
                ],
            ),
        )

        result = await repository.list_v2(user_id, project_id)

        assert len(result) == 1
        assert len(result[0].items) == 2


class TestGetAgendaItems:
    """Tests for get_agenda_items method."""

    @pytest.mark.asyncio
    async def test_get_agenda_items_empty(self, repository, user_id, project_id):
        """Test getting agenda items when no check-ins exist."""
        result = await repository.get_agenda_items(user_id, project_id)

        assert result.project_id == project_id
        assert result.blockers == []
        assert result.discussions == []
        assert result.requests == []
        assert result.updates == []
        assert result.member_moods == {}
        assert result.must_discuss_items == []

    @pytest.mark.asyncio
    async def test_get_agenda_items_grouped(self, repository, user_id, project_id):
        """Test that items are grouped by category."""
        # Create check-in with various items
        await repository.create_v2(
            user_id,
            project_id,
            CheckinCreateV2(
                member_user_id="member1",
                checkin_date=date(2025, 1, 20),
                items=[
                    CheckinItem(
                        category=CheckinItemCategory.BLOCKER,
                        content="Blocked on API",
                        urgency=CheckinItemUrgency.HIGH,
                    ),
                    CheckinItem(
                        category=CheckinItemCategory.DISCUSSION,
                        content="Architecture review",
                    ),
                    CheckinItem(
                        category=CheckinItemCategory.REQUEST,
                        content="Need help with testing",
                    ),
                    CheckinItem(
                        category=CheckinItemCategory.UPDATE,
                        content="Completed feature X",
                    ),
                ],
                mood=CheckinMood.OKAY,
                must_discuss_in_next_meeting="Performance issue",
            ),
        )

        result = await repository.get_agenda_items(user_id, project_id)

        assert len(result.blockers) == 1
        assert result.blockers[0]["content"] == "Blocked on API"
        assert result.blockers[0]["urgency"] == "high"

        assert len(result.discussions) == 1
        assert result.discussions[0]["content"] == "Architecture review"

        assert len(result.requests) == 1
        assert result.requests[0]["content"] == "Need help with testing"

        assert len(result.updates) == 1
        assert result.updates[0]["content"] == "Completed feature X"

        assert result.member_moods["member1"] == CheckinMood.OKAY

        assert len(result.must_discuss_items) == 1
        assert result.must_discuss_items[0]["content"] == "Performance issue"

    @pytest.mark.asyncio
    async def test_get_agenda_items_multiple_members(self, repository, user_id, project_id):
        """Test agenda items from multiple members."""
        # Create check-ins for different members
        await repository.create_v2(
            user_id,
            project_id,
            CheckinCreateV2(
                member_user_id="member1",
                checkin_date=date(2025, 1, 20),
                items=[
                    CheckinItem(
                        category=CheckinItemCategory.BLOCKER,
                        content="Member1 blocker",
                    ),
                ],
                mood=CheckinMood.STRUGGLING,
            ),
        )
        await repository.create_v2(
            user_id,
            project_id,
            CheckinCreateV2(
                member_user_id="member2",
                checkin_date=date(2025, 1, 20),
                items=[
                    CheckinItem(
                        category=CheckinItemCategory.BLOCKER,
                        content="Member2 blocker",
                    ),
                ],
                mood=CheckinMood.GOOD,
            ),
        )

        result = await repository.get_agenda_items(user_id, project_id)

        assert len(result.blockers) == 2
        assert result.member_moods["member1"] == CheckinMood.STRUGGLING
        assert result.member_moods["member2"] == CheckinMood.GOOD

    @pytest.mark.asyncio
    async def test_get_agenda_items_date_filter(self, repository, user_id, project_id):
        """Test agenda items with date filter."""
        # Create check-ins on different dates
        await repository.create_v2(
            user_id,
            project_id,
            CheckinCreateV2(
                member_user_id="member1",
                checkin_date=date(2025, 1, 15),
                items=[
                    CheckinItem(
                        category=CheckinItemCategory.BLOCKER,
                        content="Old blocker",
                    ),
                ],
            ),
        )
        await repository.create_v2(
            user_id,
            project_id,
            CheckinCreateV2(
                member_user_id="member1",
                checkin_date=date(2025, 1, 20),
                items=[
                    CheckinItem(
                        category=CheckinItemCategory.BLOCKER,
                        content="Recent blocker",
                    ),
                ],
            ),
        )

        result = await repository.get_agenda_items(
            user_id,
            project_id,
            start_date=date(2025, 1, 18),
        )

        assert len(result.blockers) == 1
        assert result.blockers[0]["content"] == "Recent blocker"


class TestBuildRawText:
    """Tests for _build_raw_text method."""

    def test_build_raw_text_all_categories(self):
        """Test raw text generation with all categories."""
        repo = SqliteCheckinRepository()
        checkin = CheckinCreateV2(
            member_user_id="member1",
            checkin_date=date(2025, 1, 20),
            items=[
                CheckinItem(category=CheckinItemCategory.BLOCKER, content="Blocker item"),
                CheckinItem(category=CheckinItemCategory.DISCUSSION, content="Discussion item"),
                CheckinItem(category=CheckinItemCategory.UPDATE, content="Update item"),
                CheckinItem(category=CheckinItemCategory.REQUEST, content="Request item"),
            ],
            mood=CheckinMood.GOOD,
            must_discuss_in_next_meeting="Important topic",
            free_comment="Additional notes",
        )

        raw_text = repo._build_raw_text(checkin)

        assert "【調子】😊 順調" in raw_text
        assert "【ブロッカー】Blocker item" in raw_text
        assert "【相談】Discussion item" in raw_text
        assert "【進捗】Update item" in raw_text
        assert "【依頼】Request item" in raw_text
        assert "【次回必須】Important topic" in raw_text
        assert "【その他】Additional notes" in raw_text

    def test_build_raw_text_mood_labels(self):
        """Test all mood labels in raw text."""
        repo = SqliteCheckinRepository()

        for mood, expected_label in [
            (CheckinMood.GOOD, "😊 順調"),
            (CheckinMood.OKAY, "😐 まあまあ"),
            (CheckinMood.STRUGGLING, "😰 厳しい"),
        ]:
            checkin = CheckinCreateV2(
                member_user_id="member1",
                checkin_date=date(2025, 1, 20),
                mood=mood,
            )
            raw_text = repo._build_raw_text(checkin)
            assert expected_label in raw_text
