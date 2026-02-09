"""Unit tests for scheduler tools."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

import pytest

from app.models.collaboration import TaskAssignment
from app.models.enums import (
    CreatedBy,
    EnergyLevel,
    Priority,
    ProjectStatus,
    ProjectVisibility,
    TaskStatus,
)
from app.models.project import Project
from app.models.task import Task, TaskUpdate
from app.tools.scheduler_tools import ApplyScheduleRequestInput, apply_schedule_request
from app.utils.datetime_utils import get_user_today


def _make_task(
    *,
    title: str,
    user_id: str,
    project_id: UUID | None = None,
    status: TaskStatus = TaskStatus.TODO,
    pinned_date: datetime | None = None,
) -> Task:
    now = datetime(2026, 2, 8, 9, 0, 0)
    return Task(
        id=uuid4(),
        user_id=user_id,
        title=title,
        status=status,
        project_id=project_id,
        pinned_date=pinned_date,
        importance=Priority.MEDIUM,
        urgency=Priority.MEDIUM,
        energy_level=EnergyLevel.LOW,
        estimated_minutes=30,
        dependency_ids=[],
        same_day_allowed=True,
        min_gap_days=0,
        progress=0,
        created_by=CreatedBy.USER,
        created_at=now,
        updated_at=now,
        touchpoint_steps=[],
    )


def _make_project(*, project_id: UUID, user_id: str, visibility: ProjectVisibility) -> Project:
    now = datetime(2026, 2, 8, 9, 0, 0)
    return Project(
        id=project_id,
        user_id=user_id,
        name="Project",
        visibility=visibility,
        status=ProjectStatus.ACTIVE,
        created_at=now,
        updated_at=now,
    )


def _make_assignment(*, task_id: UUID, assignee_id: str, owner_id: str) -> TaskAssignment:
    now = datetime(2026, 2, 8, 9, 0, 0)
    return TaskAssignment(
        id=uuid4(),
        user_id=owner_id,
        task_id=task_id,
        assignee_id=assignee_id,
        created_at=now,
        updated_at=now,
    )


class MockTaskRepository:
    """Mock task repository with methods used by apply_schedule_request."""

    def __init__(self, tasks: list[Task]):
        self.tasks = {task.id: task for task in tasks}

    async def list(
        self,
        user_id: str,
        project_id: UUID | None = None,
        status: str | None = None,
        parent_id: UUID | None = None,
        include_done: bool = False,
        limit: int = 100,
        offset: int = 0,
    ) -> list[Task]:
        del project_id, status, parent_id
        tasks = [task for task in self.tasks.values() if task.user_id == user_id]
        if not include_done:
            tasks = [task for task in tasks if task.status != TaskStatus.DONE]
        return tasks[offset:offset + limit]

    async def update(
        self,
        user_id: str,
        task_id: UUID,
        update: TaskUpdate,
        project_id: UUID | None = None,
    ) -> Task:
        del user_id, project_id
        task = self.tasks[task_id]
        for field, value in update.model_dump(exclude_unset=True).items():
            setattr(task, field, value)
        return task

    async def get_many(self, task_ids: list[UUID]) -> list[Task]:
        return [self.tasks[task_id] for task_id in task_ids if task_id in self.tasks]


class MockTaskAssignmentRepository:
    """Mock assignment repository with list_for_assignee support."""

    def __init__(self, assignments: list[TaskAssignment]):
        self.assignments = assignments

    async def list_for_assignee(self, user_id: str) -> list[TaskAssignment]:
        return [assignment for assignment in self.assignments if assignment.assignee_id == user_id]


class MockProjectRepository:
    """Mock project repository with list support."""

    def __init__(self, projects: list[Project]):
        self.projects = projects

    async def list(
        self,
        user_id: str,
        status: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[Project]:
        del status
        projects = [project for project in self.projects if project.user_id == user_id]
        return projects[offset:offset + limit]


@pytest.mark.asyncio
async def test_apply_schedule_request_pins_focus_task_for_today() -> None:
    user_id = "user-1"
    focus_task = _make_task(title="Prepare design proposal", user_id=user_id)
    other_task = _make_task(title="Clean inbox", user_id=user_id)
    task_repo = MockTaskRepository([focus_task, other_task])
    assignment_repo = MockTaskAssignmentRepository([])
    project_repo = MockProjectRepository([])

    result = await apply_schedule_request(
        user_id=user_id,
        task_repo=task_repo,
        assignment_repo=assignment_repo,
        project_repo=project_repo,
        input_data=ApplyScheduleRequestInput(
            request="I want to focus on design today",
            focus_keywords=["design"],
            max_focus_tasks=1,
        ),
    )

    today = get_user_today("Asia/Tokyo")
    assert result["selected_count"] == 1
    assert result["updated_task_ids"] == [str(focus_task.id)]
    assert focus_task.pinned_date is not None
    assert focus_task.pinned_date.date() == today
    assert other_task.pinned_date is None


@pytest.mark.asyncio
async def test_apply_schedule_request_excludes_unassigned_team_tasks() -> None:
    user_id = "user-1"
    team_project_id = uuid4()
    assigned_task = _make_task(title="API refactor", user_id=user_id, project_id=team_project_id)
    unassigned_task = _make_task(title="API docs", user_id=user_id, project_id=team_project_id)
    task_repo = MockTaskRepository([assigned_task, unassigned_task])
    assignment_repo = MockTaskAssignmentRepository(
        [_make_assignment(task_id=assigned_task.id, assignee_id=user_id, owner_id=user_id)]
    )
    project_repo = MockProjectRepository(
        [_make_project(project_id=team_project_id, user_id=user_id, visibility=ProjectVisibility.TEAM)]
    )

    result = await apply_schedule_request(
        user_id=user_id,
        task_repo=task_repo,
        assignment_repo=assignment_repo,
        project_repo=project_repo,
        input_data=ApplyScheduleRequestInput(
            request="Prioritize API work",
            focus_keywords=["api"],
            max_focus_tasks=10,
        ),
    )

    selected_ids = {item["task_id"] for item in result["selected_tasks"]}
    assert str(assigned_task.id) in selected_ids
    assert str(unassigned_task.id) not in selected_ids


@pytest.mark.asyncio
async def test_apply_schedule_request_unpins_avoided_tasks_for_today() -> None:
    user_id = "user-1"
    today = get_user_today("Asia/Tokyo")
    today_datetime = datetime.combine(today, datetime.min.time())
    focus_task = _make_task(title="Design review", user_id=user_id)
    avoided_task = _make_task(title="Legacy bugfix", user_id=user_id, pinned_date=today_datetime)
    task_repo = MockTaskRepository([focus_task, avoided_task])
    assignment_repo = MockTaskAssignmentRepository([])
    project_repo = MockProjectRepository([])

    result = await apply_schedule_request(
        user_id=user_id,
        task_repo=task_repo,
        assignment_repo=assignment_repo,
        project_repo=project_repo,
        input_data=ApplyScheduleRequestInput(
            request="Focus design today",
            focus_keywords=["design"],
            avoid_keywords=["bugfix"],
            unpin_avoided_today=True,
        ),
    )

    assert str(avoided_task.id) in result["unpinned_task_ids"]
    assert avoided_task.pinned_date is None
