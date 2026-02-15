import json
from datetime import datetime, timedelta
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest

from app.services.project_achievement_service import generate_project_achievement


class DummyUserRepo:
    def __init__(
        self,
        by_id: dict[str, SimpleNamespace] | None = None,
        by_email: dict[str, SimpleNamespace] | None = None,
        by_username: dict[str, SimpleNamespace] | None = None,
    ) -> None:
        self._by_id = by_id or {}
        self._by_email = by_email or {}
        self._by_username = by_username or {}

    async def get(self, user_id: UUID) -> SimpleNamespace | None:
        return self._by_id.get(str(user_id))

    async def get_by_email(self, email: str) -> SimpleNamespace | None:
        return self._by_email.get(email)

    async def get_by_username(self, username: str) -> SimpleNamespace | None:
        return self._by_username.get(username)


class DummyProjectAchievementRepo:
    def __init__(self) -> None:
        self.saved = None

    async def create(self, project_id, achievement):
        self.saved = achievement
        return achievement


async def _generate(
    monkeypatch: pytest.MonkeyPatch,
    member_user_id: str,
    user_repo: DummyUserRepo,
):
    monkeypatch.setattr(
        "app.services.project_achievement_service.generate_text",
        lambda **_: json.dumps(
            {
                "summary": "summary",
                "team_highlights": [],
                "challenges": [],
                "learnings": [],
                "member_areas": {},
            }
        ),
    )

    owner_id = str(uuid4())
    project_id = uuid4()
    task_id = uuid4()
    task = SimpleNamespace(id=task_id, title="Task A", completion_note=None)

    project_repo = SimpleNamespace()

    async def _get_project_by_id(_project_id):
        return SimpleNamespace(user_id=owner_id, name="Project A")

    async def _list_members(_project_id):
        return [SimpleNamespace(member_user_id=member_user_id)]

    async def _list_completed_in_period(**_kwargs):
        return [task]

    async def _list_tasks(**_kwargs):
        return []

    async def _list_assignments(_owner_id, _project_id):
        return [SimpleNamespace(task_id=task_id, assignee_id=member_user_id)]

    project_repo.get_by_id = _get_project_by_id
    project_member_repo = SimpleNamespace(list_by_project=_list_members)
    task_repo = SimpleNamespace(
        list_completed_in_period=_list_completed_in_period,
        list=_list_tasks,
    )
    task_assignment_repo = SimpleNamespace(list_by_project=_list_assignments)
    achievement_repo = DummyProjectAchievementRepo()

    period_start = datetime.utcnow() - timedelta(days=7)
    period_end = datetime.utcnow()

    achievement = await generate_project_achievement(
        llm_provider=object(),
        task_repo=task_repo,
        project_repo=project_repo,
        project_member_repo=project_member_repo,
        user_repo=user_repo,
        project_achievement_repo=achievement_repo,
        notification_repo=None,
        project_id=project_id,
        period_start=period_start,
        period_end=period_end,
        task_assignment_repo=task_assignment_repo,
    )
    return achievement


@pytest.mark.asyncio
async def test_member_display_name_resolved_from_uuid_member_id(monkeypatch: pytest.MonkeyPatch):
    member_id = str(uuid4())
    user_repo = DummyUserRepo(
        by_id={
            member_id: SimpleNamespace(display_name="Alice", username="alice"),
        }
    )

    achievement = await _generate(monkeypatch, member_id, user_repo)

    assert achievement is not None
    contribution = next(c for c in achievement.member_contributions if c.user_id == member_id)
    assert contribution.display_name == "Alice"


@pytest.mark.asyncio
async def test_member_display_name_resolved_from_email_member_id(monkeypatch: pytest.MonkeyPatch):
    member_id = "alice@example.com"
    user_repo = DummyUserRepo(
        by_email={
            member_id: SimpleNamespace(display_name="Alice Mail", username="alice"),
        }
    )

    achievement = await _generate(monkeypatch, member_id, user_repo)

    assert achievement is not None
    contribution = next(c for c in achievement.member_contributions if c.user_id == member_id)
    assert contribution.display_name == "Alice Mail"
