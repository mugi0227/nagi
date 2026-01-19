"""
Integration tests for Check-in V2 API.

Tests the full API flow for structured check-ins.
"""

from datetime import date
from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.infrastructure.local.database import Base
from app.infrastructure.local.checkin_repository import SqliteCheckinRepository
from app.infrastructure.local.project_repository import SqliteProjectRepository
from app.models.collaboration import (
    CheckinCreateV2,
    CheckinItem,
)
from app.models.project import ProjectCreate
from app.models.enums import (
    CheckinItemCategory,
    CheckinItemUrgency,
    CheckinMood,
)


@pytest.fixture
async def db_setup():
    """Create in-memory database with all tables."""
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async_session_factory = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    yield async_session_factory

    await engine.dispose()


@pytest.fixture
def session_context_factory(db_setup):
    """Create a factory for async session context managers."""
    def factory():
        class SessionCtx:
            def __init__(self):
                self._session = None

            async def __aenter__(self):
                self._session = db_setup()
                return self._session

            async def __aexit__(self, exc_type, exc_val, exc_tb):
                if self._session:
                    await self._session.close()
        return SessionCtx()
    return factory


@pytest.fixture
def checkin_repo(session_context_factory):
    """Create checkin repository."""
    return SqliteCheckinRepository(session_factory=session_context_factory)


@pytest.fixture
def project_repo(session_context_factory):
    """Create project repository."""
    return SqliteProjectRepository(session_factory=session_context_factory)


@pytest.fixture
def user_id():
    return "test_user_123"


class TestCheckinV2ApiIntegration:
    """Integration tests for V2 check-in API flow."""

    @pytest.mark.asyncio
    async def test_create_and_list_checkin_v2(self, checkin_repo, project_repo, user_id):
        """Test creating and listing V2 check-ins."""
        # Create a project first
        project = await project_repo.create(
            user_id,
            ProjectCreate(
                name="Test Project",
                description="A test project",
            ),
        )

        # Create a check-in
        checkin_data = CheckinCreateV2(
            member_user_id=user_id,
            checkin_date=date(2025, 1, 20),
            items=[
                CheckinItem(
                    category=CheckinItemCategory.BLOCKER,
                    content="API connection failing",
                    urgency=CheckinItemUrgency.HIGH,
                ),
                CheckinItem(
                    category=CheckinItemCategory.DISCUSSION,
                    content="Need architecture review",
                ),
            ],
            mood=CheckinMood.OKAY,
            free_comment="Making progress overall",
        )

        created = await checkin_repo.create_v2(user_id, project.id, checkin_data)

        # Verify created check-in
        assert created.id is not None
        assert created.member_user_id == user_id
        assert len(created.items) == 2
        assert created.mood == CheckinMood.OKAY

        # List check-ins
        checkins = await checkin_repo.list_v2(user_id, project.id)

        assert len(checkins) == 1
        assert checkins[0].id == created.id
        assert len(checkins[0].items) == 2

    @pytest.mark.asyncio
    async def test_filter_checkins_by_date(self, checkin_repo, project_repo, user_id):
        """Test filtering check-ins by date range."""
        project = await project_repo.create(
            user_id,
            ProjectCreate(name="Test Project"),
        )

        # Create check-ins on different dates
        dates = [date(2025, 1, 15), date(2025, 1, 18), date(2025, 1, 20), date(2025, 1, 25)]
        for d in dates:
            await checkin_repo.create_v2(
                user_id,
                project.id,
                CheckinCreateV2(
                    member_user_id=user_id,
                    checkin_date=d,
                ),
            )

        # Filter by date range
        filtered = await checkin_repo.list_v2(
            user_id,
            project.id,
            start_date=date(2025, 1, 17),
            end_date=date(2025, 1, 22),
        )

        assert len(filtered) == 2
        filtered_dates = {c.checkin_date for c in filtered}
        assert date(2025, 1, 18) in filtered_dates
        assert date(2025, 1, 20) in filtered_dates

    @pytest.mark.asyncio
    async def test_filter_checkins_by_member(self, checkin_repo, project_repo, user_id):
        """Test filtering check-ins by member."""
        project = await project_repo.create(
            user_id,
            ProjectCreate(name="Test Project"),
        )

        # Create check-ins for different members
        await checkin_repo.create_v2(
            user_id,
            project.id,
            CheckinCreateV2(
                member_user_id="member1",
                checkin_date=date(2025, 1, 20),
            ),
        )
        await checkin_repo.create_v2(
            user_id,
            project.id,
            CheckinCreateV2(
                member_user_id="member2",
                checkin_date=date(2025, 1, 20),
            ),
        )

        # Filter by member
        member1_checkins = await checkin_repo.list_v2(
            user_id,
            project.id,
            member_user_id="member1",
        )

        assert len(member1_checkins) == 1
        assert member1_checkins[0].member_user_id == "member1"

    @pytest.mark.asyncio
    async def test_get_agenda_items(self, checkin_repo, project_repo, user_id):
        """Test getting agenda items grouped by category."""
        project = await project_repo.create(
            user_id,
            ProjectCreate(name="Test Project"),
        )

        # Create check-ins with various item types
        await checkin_repo.create_v2(
            user_id,
            project.id,
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
                        content="Architecture discussion",
                    ),
                ],
                mood=CheckinMood.STRUGGLING,
                must_discuss_in_next_meeting="Critical decision needed",
            ),
        )
        await checkin_repo.create_v2(
            user_id,
            project.id,
            CheckinCreateV2(
                member_user_id="member2",
                checkin_date=date(2025, 1, 20),
                items=[
                    CheckinItem(
                        category=CheckinItemCategory.REQUEST,
                        content="Need code review",
                    ),
                    CheckinItem(
                        category=CheckinItemCategory.UPDATE,
                        content="Completed feature X",
                    ),
                ],
                mood=CheckinMood.GOOD,
            ),
        )

        # Get agenda items
        agenda = await checkin_repo.get_agenda_items(user_id, project.id)

        assert agenda.project_id == project.id
        assert len(agenda.blockers) == 1
        assert agenda.blockers[0]["content"] == "Blocked on API"
        assert agenda.blockers[0]["urgency"] == "high"

        assert len(agenda.discussions) == 1
        assert len(agenda.requests) == 1
        assert len(agenda.updates) == 1

        assert len(agenda.member_moods) == 2
        assert agenda.member_moods["member1"] == CheckinMood.STRUGGLING
        assert agenda.member_moods["member2"] == CheckinMood.GOOD

        assert len(agenda.must_discuss_items) == 1
        assert agenda.must_discuss_items[0]["content"] == "Critical decision needed"


class TestBackwardCompatibility:
    """Tests for backward compatibility with V1 check-ins."""

    @pytest.mark.asyncio
    async def test_v2_generates_raw_text(self, checkin_repo, project_repo, user_id):
        """Test that V2 check-ins generate raw_text for V1 compatibility."""
        project = await project_repo.create(
            user_id,
            ProjectCreate(name="Test Project"),
        )

        checkin_data = CheckinCreateV2(
            member_user_id=user_id,
            checkin_date=date(2025, 1, 20),
            items=[
                CheckinItem(
                    category=CheckinItemCategory.BLOCKER,
                    content="API connection issue",
                ),
            ],
            mood=CheckinMood.OKAY,
            free_comment="Additional notes here",
        )

        created = await checkin_repo.create_v2(user_id, project.id, checkin_data)

        # Verify raw_text is populated
        assert created.raw_text is not None
        assert "ブロッカー" in created.raw_text
        assert "API connection issue" in created.raw_text
        assert "まあまあ" in created.raw_text
        assert "Additional notes here" in created.raw_text

    @pytest.mark.asyncio
    async def test_v2_with_explicit_raw_text(self, checkin_repo, project_repo, user_id):
        """Test that explicit raw_text is preserved."""
        project = await project_repo.create(
            user_id,
            ProjectCreate(name="Test Project"),
        )

        checkin_data = CheckinCreateV2(
            member_user_id=user_id,
            checkin_date=date(2025, 1, 20),
            raw_text="Custom legacy raw text format",
        )

        created = await checkin_repo.create_v2(user_id, project.id, checkin_data)

        assert created.raw_text == "Custom legacy raw text format"


class TestMultipleMembersScenario:
    """Tests for realistic multi-member scenarios."""

    @pytest.mark.asyncio
    async def test_team_weekly_checkins(self, checkin_repo, project_repo, user_id):
        """Test scenario with multiple team members doing weekly check-ins."""
        project = await project_repo.create(
            user_id,
            ProjectCreate(name="Team Project"),
        )

        # Simulate a week of team check-ins
        team_members = ["alice", "bob", "charlie"]
        check_dates = [date(2025, 1, 15), date(2025, 1, 17), date(2025, 1, 20)]

        for member in team_members:
            for check_date in check_dates:
                await checkin_repo.create_v2(
                    user_id,
                    project.id,
                    CheckinCreateV2(
                        member_user_id=member,
                        checkin_date=check_date,
                        items=[
                            CheckinItem(
                                category=CheckinItemCategory.UPDATE,
                                content=f"{member}'s update on {check_date}",
                            ),
                        ],
                        mood=CheckinMood.GOOD,
                    ),
                )

        # Get all check-ins
        all_checkins = await checkin_repo.list_v2(user_id, project.id)
        assert len(all_checkins) == 9  # 3 members * 3 dates

        # Get recent check-ins only
        recent = await checkin_repo.list_v2(
            user_id,
            project.id,
            start_date=date(2025, 1, 19),
        )
        assert len(recent) == 3  # 3 members on Jan 20

        # Get agenda items for the week
        agenda = await checkin_repo.get_agenda_items(
            user_id,
            project.id,
            start_date=date(2025, 1, 13),
            end_date=date(2025, 1, 20),
        )
        assert len(agenda.updates) == 9
        assert len(agenda.member_moods) == 3  # Latest mood per member
