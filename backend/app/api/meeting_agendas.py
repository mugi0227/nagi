"""
Meeting agenda API endpoints.
"""

from datetime import date
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import (
    CurrentUser,
    MeetingAgendaRepo,
    ProjectMemberRepo,
    ProjectRepo,
    RecurringMeetingRepo,
    TaskRepo,
)
from app.api.permissions import require_project_action
from app.models.meeting_agenda import (
    MeetingAgendaItem,
    MeetingAgendaItemCreate,
    MeetingAgendaItemUpdate,
)
from app.services.project_permissions import ProjectAction

router = APIRouter(prefix="/meeting-agendas", tags=["meeting-agendas"])


async def _get_owner_id_from_meeting(
    user: CurrentUser,
    meeting_id: UUID,
    meeting_repo: RecurringMeetingRepo,
    project_repo: ProjectRepo,
    member_repo: ProjectMemberRepo,
) -> str:
    """Get owner_user_id from meeting's project."""
    meeting = await meeting_repo.get(user.id, meeting_id)
    if not meeting:
        projects = await project_repo.list(user.id, limit=1000)
        for project in projects:
            meeting = await meeting_repo.get(user.id, meeting_id, project_id=project.id)
            if meeting:
                break
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    if not meeting.project_id:
        return user.id

    access = await require_project_action(
        user,
        meeting.project_id,
        project_repo,
        member_repo,
        ProjectAction.MEETING_AGENDA_MANAGE,
    )
    return access.owner_id


async def _get_owner_id_from_task(
    user: CurrentUser,
    task_id: UUID,
    task_repo: TaskRepo,
    project_repo: ProjectRepo,
    member_repo: ProjectMemberRepo,
) -> str:
    """Get owner_user_id from task's project."""
    task = await task_repo.get(user.id, task_id)
    if not task:
        # Try to find task via project membership
        projects = await project_repo.list(user.id, limit=1000)
        for project in projects:
            task = await task_repo.get(user.id, task_id, project_id=project.id)
            if task:
                access = await require_project_action(
                    user,
                    project.id,
                    project_repo,
                    member_repo,
                    ProjectAction.MEETING_AGENDA_MANAGE,
                )
                return access.owner_id
        raise HTTPException(status_code=404, detail="Task not found")

    if task.project_id:
        access = await require_project_action(
            user,
            task.project_id,
            project_repo,
            member_repo,
            ProjectAction.MEETING_AGENDA_MANAGE,
        )
        return access.owner_id
    return user.id


@router.post("/{meeting_id}/items", response_model=MeetingAgendaItem)
async def create_agenda_item(
    meeting_id: UUID,
    data: MeetingAgendaItemCreate,
    user: CurrentUser,
    repo: MeetingAgendaRepo,
    meeting_repo: RecurringMeetingRepo,
    project_repo: ProjectRepo,
    member_repo: ProjectMemberRepo,
):
    """Create a new agenda item for a meeting."""
    owner_id = await _get_owner_id_from_meeting(
        user,
        meeting_id,
        meeting_repo,
        project_repo,
        member_repo,
    )
    return await repo.create(owner_id, meeting_id, data)


@router.get("/{meeting_id}/items", response_model=list[MeetingAgendaItem])
async def list_agenda_items(
    meeting_id: UUID,
    user: CurrentUser,
    repo: MeetingAgendaRepo,
    meeting_repo: RecurringMeetingRepo,
    project_repo: ProjectRepo,
    member_repo: ProjectMemberRepo,
    event_date: Optional[date] = None,
):
    """List all agenda items for a meeting."""
    owner_id = await _get_owner_id_from_meeting(
        user,
        meeting_id,
        meeting_repo,
        project_repo,
        member_repo,
    )
    return await repo.list_by_meeting(owner_id, meeting_id, event_date)


@router.get("/items/{agenda_item_id}", response_model=MeetingAgendaItem)
async def get_agenda_item(
    agenda_item_id: UUID,
    user: CurrentUser,
    repo: MeetingAgendaRepo,
):
    """Get a specific agenda item."""
    # Note: This endpoint doesn't have meeting/task context
    # Falls back to user.id which works for owners
    item = await repo.get(user.id, agenda_item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Agenda item not found")
    return item


@router.patch("/items/{agenda_item_id}", response_model=MeetingAgendaItem)
async def update_agenda_item(
    agenda_item_id: UUID,
    data: MeetingAgendaItemUpdate,
    user: CurrentUser,
    repo: MeetingAgendaRepo,
):
    """Update an agenda item."""
    # Note: This endpoint doesn't have meeting/task context
    # Falls back to user.id which works for owners
    return await repo.update(user.id, agenda_item_id, data)


@router.delete("/items/{agenda_item_id}")
async def delete_agenda_item(
    agenda_item_id: UUID,
    user: CurrentUser,
    repo: MeetingAgendaRepo,
):
    """Delete an agenda item."""
    # Note: This endpoint doesn't have meeting/task context
    # Falls back to user.id which works for owners
    success = await repo.delete(user.id, agenda_item_id)
    if not success:
        raise HTTPException(status_code=404, detail="Agenda item not found")
    return {"success": True}


@router.post("/{meeting_id}/items/reorder", response_model=list[MeetingAgendaItem])
async def reorder_agenda_items(
    meeting_id: UUID,
    ordered_ids: list[UUID],
    user: CurrentUser,
    repo: MeetingAgendaRepo,
    meeting_repo: RecurringMeetingRepo,
    project_repo: ProjectRepo,
    member_repo: ProjectMemberRepo,
):
    """Reorder agenda items."""
    owner_id = await _get_owner_id_from_meeting(
        user,
        meeting_id,
        meeting_repo,
        project_repo,
        member_repo,
    )
    return await repo.reorder(owner_id, ordered_ids, meeting_id=meeting_id)


# Task-based endpoints (for standalone meetings without RecurringMeeting)


@router.post("/tasks/{task_id}/items", response_model=MeetingAgendaItem)
async def create_task_agenda_item(
    task_id: UUID,
    data: MeetingAgendaItemCreate,
    user: CurrentUser,
    repo: MeetingAgendaRepo,
    task_repo: TaskRepo,
    project_repo: ProjectRepo,
    member_repo: ProjectMemberRepo,
):
    """Create a new agenda item for a standalone meeting task."""
    owner_id = await _get_owner_id_from_task(
        user,
        task_id,
        task_repo,
        project_repo,
        member_repo,
    )
    # Set task_id in data
    data.task_id = task_id
    return await repo.create(owner_id, None, data)


@router.get("/tasks/{task_id}/items", response_model=list[MeetingAgendaItem])
async def list_task_agenda_items(
    task_id: UUID,
    user: CurrentUser,
    repo: MeetingAgendaRepo,
    task_repo: TaskRepo,
    project_repo: ProjectRepo,
    member_repo: ProjectMemberRepo,
):
    """List all agenda items for a standalone meeting task."""
    owner_id = await _get_owner_id_from_task(
        user,
        task_id,
        task_repo,
        project_repo,
        member_repo,
    )
    return await repo.list_by_task(owner_id, task_id)
