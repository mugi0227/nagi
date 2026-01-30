"""
Meeting agenda API endpoints.
"""

from datetime import date
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

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


async def _resolve_owner_from_agenda_item(
    user: CurrentUser,
    item: MeetingAgendaItem,
    repo: MeetingAgendaRepo,
    meeting_repo: RecurringMeetingRepo,
    task_repo: TaskRepo,
    project_repo: ProjectRepo,
    member_repo: ProjectMemberRepo,
) -> str:
    """Resolve owner_id from an agenda item's meeting or task context.

    This enables project members (not just the owner) to operate on agenda items.
    """
    if item.meeting_id:
        return await _get_owner_id_from_meeting(
            user, item.meeting_id, meeting_repo, project_repo, member_repo
        )
    if item.task_id:
        return await _get_owner_id_from_task(
            user, item.task_id, task_repo, project_repo, member_repo
        )
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
    meeting_repo: RecurringMeetingRepo,
    task_repo: TaskRepo,
    project_repo: ProjectRepo,
    member_repo: ProjectMemberRepo,
):
    """Get a specific agenda item."""
    # First look up item without user check to get meeting/task context
    item = await repo.get_by_id(agenda_item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Agenda item not found")

    # Resolve owner via project permissions (supports members)
    owner_id = await _resolve_owner_from_agenda_item(
        user, item, repo, meeting_repo, task_repo, project_repo, member_repo
    )

    # Verify access by fetching with resolved owner_id
    verified = await repo.get(owner_id, agenda_item_id)
    if not verified:
        raise HTTPException(status_code=404, detail="Agenda item not found")
    return verified


@router.patch("/items/{agenda_item_id}", response_model=MeetingAgendaItem)
async def update_agenda_item(
    agenda_item_id: UUID,
    data: MeetingAgendaItemUpdate,
    user: CurrentUser,
    repo: MeetingAgendaRepo,
    meeting_repo: RecurringMeetingRepo,
    task_repo: TaskRepo,
    project_repo: ProjectRepo,
    member_repo: ProjectMemberRepo,
):
    """Update an agenda item."""
    # First look up item without user check to get meeting/task context
    item = await repo.get_by_id(agenda_item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Agenda item not found")

    # Resolve owner via project permissions (supports members)
    owner_id = await _resolve_owner_from_agenda_item(
        user, item, repo, meeting_repo, task_repo, project_repo, member_repo
    )
    return await repo.update(owner_id, agenda_item_id, data)


@router.delete("/items/{agenda_item_id}")
async def delete_agenda_item(
    agenda_item_id: UUID,
    user: CurrentUser,
    repo: MeetingAgendaRepo,
    meeting_repo: RecurringMeetingRepo,
    task_repo: TaskRepo,
    project_repo: ProjectRepo,
    member_repo: ProjectMemberRepo,
):
    """Delete an agenda item."""
    # First look up item without user check to get meeting/task context
    item = await repo.get_by_id(agenda_item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Agenda item not found")

    # Resolve owner via project permissions (supports members)
    owner_id = await _resolve_owner_from_agenda_item(
        user, item, repo, meeting_repo, task_repo, project_repo, member_repo
    )
    success = await repo.delete(owner_id, agenda_item_id)
    if not success:
        raise HTTPException(status_code=404, detail="Agenda item not found")
    return {"success": True}


class BulkDeleteRequest(BaseModel):
    """Request body for bulk agenda deletion."""
    item_ids: list[UUID] = Field(..., min_length=1, description="削除するアジェンダ項目のIDリスト")


@router.post("/{meeting_id}/items/bulk-delete")
async def bulk_delete_agenda_items(
    meeting_id: UUID,
    request: BulkDeleteRequest,
    user: CurrentUser,
    repo: MeetingAgendaRepo,
    meeting_repo: RecurringMeetingRepo,
    project_repo: ProjectRepo,
    member_repo: ProjectMemberRepo,
):
    """Bulk delete agenda items for a meeting."""
    owner_id = await _get_owner_id_from_meeting(
        user, meeting_id, meeting_repo, project_repo, member_repo
    )

    deleted_count = 0
    for item_id in request.item_ids:
        success = await repo.delete(owner_id, item_id)
        if success:
            deleted_count += 1

    return {"deleted_count": deleted_count, "total_requested": len(request.item_ids)}


@router.post("/tasks/{task_id}/items/bulk-delete")
async def bulk_delete_task_agenda_items(
    task_id: UUID,
    request: BulkDeleteRequest,
    user: CurrentUser,
    repo: MeetingAgendaRepo,
    task_repo: TaskRepo,
    project_repo: ProjectRepo,
    member_repo: ProjectMemberRepo,
):
    """Bulk delete agenda items for a standalone meeting task."""
    owner_id = await _get_owner_id_from_task(
        user, task_id, task_repo, project_repo, member_repo
    )

    deleted_count = 0
    for item_id in request.item_ids:
        success = await repo.delete(owner_id, item_id)
        if success:
            deleted_count += 1

    return {"deleted_count": deleted_count, "total_requested": len(request.item_ids)}


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
