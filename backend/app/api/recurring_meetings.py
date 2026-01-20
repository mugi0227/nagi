"""
Recurring meeting API endpoints.
"""

from datetime import datetime, timedelta
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status, Depends

from app.api.deps import CheckinRepo, CurrentUser, RecurringMeetingRepo, TaskRepo, ProjectRepo
from app.api.deps import get_project_repository
from app.core.exceptions import NotFoundError
from app.models.recurring_meeting import RecurringMeeting, RecurringMeetingCreate, RecurringMeetingUpdate
from app.services.recurring_meeting_service import RecurringMeetingService

router = APIRouter()


def _align_to_weekday(current, target_weekday: int):
    delta = (target_weekday - current.weekday()) % 7
    return current + timedelta(days=delta)


def _compute_anchor_date(start_time, weekday: int, now: datetime):
    candidate_date = _align_to_weekday(now.date(), weekday)
    candidate_dt = datetime.combine(candidate_date, start_time)
    if candidate_dt <= now:
        candidate_date += timedelta(days=7)
    return candidate_date


async def _get_or_404(user: CurrentUser, repo: RecurringMeetingRepo, meeting_id: UUID) -> RecurringMeeting:
    meeting = await repo.get(user.id, meeting_id)
    if not meeting:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"RecurringMeeting {meeting_id} not found",
        )
    return meeting


@router.post("", response_model=RecurringMeeting, status_code=status.HTTP_201_CREATED)
async def create_recurring_meeting(
    payload: RecurringMeetingCreate,
    user: CurrentUser,
    repo: RecurringMeetingRepo,
    task_repo: TaskRepo,
    checkin_repo: CheckinRepo,
):
    """Create a new recurring meeting series."""
    anchor_date = payload.anchor_date or _compute_anchor_date(
        payload.start_time,
        payload.weekday,
        datetime.now(),
    )
    if anchor_date.weekday() != payload.weekday:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="anchor_date weekday must match weekday",
        )
    created = await repo.create(user.id, payload.model_copy(update={"anchor_date": anchor_date}))
    service = RecurringMeetingService(repo, task_repo, checkin_repo)
    await service.ensure_upcoming_meetings(user.id)
    return created


@router.get("", response_model=list[RecurringMeeting])
async def list_recurring_meetings(
    user: CurrentUser,
    repo: RecurringMeetingRepo,
    project_id: Optional[UUID] = Query(None, description="Filter by project ID"),
    include_inactive: bool = Query(False, description="Include inactive recurring meetings"),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
) -> list[RecurringMeeting]:
    """List recurring meetings."""
    return await repo.list(
        user.id,
        project_id=project_id,
        include_inactive=include_inactive,
        limit=limit,
        offset=offset,
    )


@router.get("/{meeting_id}", response_model=RecurringMeeting)
async def get_recurring_meeting(
    meeting_id: UUID,
    user: CurrentUser,
    repo: RecurringMeetingRepo,
) -> RecurringMeeting:
    """Get a recurring meeting by ID."""
    meeting = await repo.get(user.id, meeting_id)
    if not meeting:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"RecurringMeeting {meeting_id} not found",
        )
    return meeting


@router.patch("/{meeting_id}", response_model=RecurringMeeting)
async def update_recurring_meeting(
    meeting_id: UUID,
    update: RecurringMeetingUpdate,
    user: CurrentUser,
    repo: RecurringMeetingRepo,
    task_repo: TaskRepo,
    checkin_repo: CheckinRepo,
    project_repo: ProjectRepo,
) -> RecurringMeeting:
    """Update a recurring meeting."""
    await _get_or_404(user, repo, meeting_id)
    try:
        return await repo.update(user.id, meeting_id, update, None)
    except NotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.delete("/{meeting_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_recurring_meeting(
    meeting_id: UUID,
    user: CurrentUser,
    repo: RecurringMeetingRepo,
    project_repo: ProjectRepo,
):
    """Delete a recurring meeting."""
    await _get_or_404(user, repo, meeting_id)
    deleted = await repo.delete(user.id, meeting_id, None)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"RecurringMeeting {meeting_id} not found",
        )


@router.post("/{meeting_id}/generate-tasks")
async def generate_meeting_tasks(
    meeting_id: UUID,
    user: CurrentUser,
    repo: RecurringMeetingRepo,
    task_repo: TaskRepo,
    checkin_repo: CheckinRepo,
    lookahead_days: int = Query(30, ge=1, le=180, description="Generate tasks for the next N days"),
):
    """
    Generate meeting tasks for a recurring meeting.

    Args:
        meeting_id: Recurring meeting ID
        lookahead_days: Number of days to look ahead (default: 30)

    Returns:
        Dictionary with created task count and task details
    """
    await _get_or_404(user, repo, meeting_id)

    service = RecurringMeetingService(
        recurring_repo=repo,
        task_repo=task_repo,
        checkin_repo=checkin_repo,
        lookahead_days=lookahead_days,
    )

    result = await service.ensure_upcoming_meetings(user.id)
    return result
