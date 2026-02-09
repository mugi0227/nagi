from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from app.api.tasks import list_tasks
from app.models.enums import CreatedBy, TaskStatus
from app.models.task import Task


def _make_task(index: int, *, is_fixed_time: bool) -> Task:
    timestamp = datetime(2026, 2, 8, 12, 0, tzinfo=timezone.utc) - timedelta(minutes=index)
    start_time = timestamp if is_fixed_time else None
    end_time = (timestamp + timedelta(minutes=30)) if is_fixed_time else None
    return Task(
        id=uuid4(),
        user_id="owner-user",
        title=f"Task {index}",
        status=TaskStatus.TODO,
        created_by=CreatedBy.USER,
        created_at=timestamp,
        updated_at=timestamp,
        is_fixed_time=is_fixed_time,
        start_time=start_time,
        end_time=end_time,
    )


@pytest.mark.asyncio
async def test_list_tasks_exclude_meetings_filters_before_pagination() -> None:
    user = SimpleNamespace(id="owner-user")
    repo = AsyncMock()
    project_repo = AsyncMock()
    assignment_repo = AsyncMock()

    # Meetings dominate the newest items. Pagination should still return a full page
    # of non-meeting tasks when enough exist.
    repo.list.return_value = [_make_task(i, is_fixed_time=i < 50) for i in range(180)]
    repo.get_many.return_value = []
    project_repo.list.return_value = []
    assignment_repo.list_for_assignee.return_value = []

    result = await list_tasks(
        user=user,
        repo=repo,
        project_repo=project_repo,
        assignment_repo=assignment_repo,
        project_id=None,
        status=None,
        include_done=True,
        only_meetings=False,
        exclude_meetings=True,
        limit=100,
        offset=0,
    )

    assert len(result) == 100
    assert all(not task.is_fixed_time for task in result)
