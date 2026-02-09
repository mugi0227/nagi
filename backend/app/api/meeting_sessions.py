"""
Meeting session API endpoints.
"""

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, HTTPException

from app.api.deps import (
    CurrentUser,
    LLMProvider,
    MeetingAgendaRepo,
    MeetingSessionRepo,
    TaskAssignmentRepo,
    TaskRepo,
)
from app.models.enums import CreatedBy, EnergyLevel, MeetingSessionStatus, Priority
from app.models.meeting_session import (
    MeetingSession,
    MeetingSessionCreate,
    MeetingSessionUpdate,
)
from app.models.meeting_summary import (
    ActionType,
    AnalyzeTranscriptRequest,
    CreateTasksFromActionsRequest,
    MeetingSummary,
)
from app.models.task import TaskCreate, TaskUpdate
from app.services.meeting_summary_service import MeetingSummaryService
from app.utils.datetime_utils import now_utc

router = APIRouter(prefix="/meeting-sessions", tags=["meeting-sessions"])


@router.post("", response_model=MeetingSession)
async def create_session(
    data: MeetingSessionCreate,
    user: CurrentUser,
    repo: MeetingSessionRepo,
):
    """Create a new meeting session."""
    return await repo.create(user.id, data)


@router.get("/{session_id}", response_model=MeetingSession)
async def get_session(
    session_id: UUID,
    user: CurrentUser,
    repo: MeetingSessionRepo,
):
    """Get a session by ID."""
    session = await repo.get(user.id, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@router.patch("/{session_id}", response_model=MeetingSession)
async def update_session(
    session_id: UUID,
    data: MeetingSessionUpdate,
    user: CurrentUser,
    repo: MeetingSessionRepo,
):
    """Update a session."""
    session = await repo.update(user.id, session_id, data)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@router.delete("/{session_id}")
async def delete_session(
    session_id: UUID,
    user: CurrentUser,
    repo: MeetingSessionRepo,
):
    """Delete a session."""
    success = await repo.delete(user.id, session_id)
    if not success:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"success": True}


@router.get("/task/{task_id}", response_model=MeetingSession | None)
async def get_session_by_task(
    task_id: UUID,
    user: CurrentUser,
    repo: MeetingSessionRepo,
):
    """Get the active (non-COMPLETED) session for a task."""
    return await repo.get_by_task(user.id, task_id)


@router.get("/task/{task_id}/latest", response_model=MeetingSession | None)
async def get_latest_session_by_task(
    task_id: UUID,
    user: CurrentUser,
    repo: MeetingSessionRepo,
):
    """Get the most recent session for a task (any status)."""
    return await repo.get_latest_by_task(user.id, task_id)


@router.get("/recurring/{recurring_meeting_id}", response_model=list[MeetingSession])
async def list_sessions_by_recurring_meeting(
    recurring_meeting_id: UUID,
    user: CurrentUser,
    repo: MeetingSessionRepo,
):
    """List COMPLETED sessions for a recurring meeting, ordered by created_at desc."""
    return await repo.list_by_recurring_meeting(user.id, recurring_meeting_id)


@router.post("/{session_id}/start", response_model=MeetingSession)
async def start_session(
    session_id: UUID,
    user: CurrentUser,
    repo: MeetingSessionRepo,
):
    """Start a meeting session (change status to IN_PROGRESS)."""
    session = await repo.get(user.id, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if session.status == MeetingSessionStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="Cannot start a completed session")

    update_data = MeetingSessionUpdate(
        status=MeetingSessionStatus.IN_PROGRESS,
        started_at=now_utc(),
        current_agenda_index=0,
    )
    return await repo.update(user.id, session_id, update_data)


@router.post("/{session_id}/end", response_model=MeetingSession)
async def end_session(
    session_id: UUID,
    user: CurrentUser,
    repo: MeetingSessionRepo,
):
    """End a meeting session (change status to COMPLETED)."""
    session = await repo.get(user.id, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if session.status == MeetingSessionStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="Session is already completed")

    update_data = MeetingSessionUpdate(
        status=MeetingSessionStatus.COMPLETED,
        ended_at=now_utc(),
    )
    return await repo.update(user.id, session_id, update_data)


@router.post("/{session_id}/next-agenda", response_model=MeetingSession)
async def next_agenda(
    session_id: UUID,
    user: CurrentUser,
    repo: MeetingSessionRepo,
):
    """Move to the next agenda item."""
    session = await repo.get(user.id, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if session.status != MeetingSessionStatus.IN_PROGRESS:
        raise HTTPException(status_code=400, detail="Session is not in progress")

    current_index = session.current_agenda_index or 0
    update_data = MeetingSessionUpdate(current_agenda_index=current_index + 1)
    return await repo.update(user.id, session_id, update_data)


@router.post("/{session_id}/prev-agenda", response_model=MeetingSession)
async def prev_agenda(
    session_id: UUID,
    user: CurrentUser,
    repo: MeetingSessionRepo,
):
    """Move to the previous agenda item."""
    session = await repo.get(user.id, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if session.status != MeetingSessionStatus.IN_PROGRESS:
        raise HTTPException(status_code=400, detail="Session is not in progress")

    current_index = session.current_agenda_index or 0
    if current_index > 0:
        update_data = MeetingSessionUpdate(current_agenda_index=current_index - 1)
        return await repo.update(user.id, session_id, update_data)
    return session


@router.post("/{session_id}/reset", response_model=MeetingSession)
async def reset_session(
    session_id: UUID,
    user: CurrentUser,
    repo: MeetingSessionRepo,
):
    """Reset a meeting session (reset agenda index to 0, keep IN_PROGRESS status)."""
    session = await repo.get(user.id, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if session.status != MeetingSessionStatus.IN_PROGRESS:
        raise HTTPException(status_code=400, detail="Session is not in progress")

    update_data = MeetingSessionUpdate(current_agenda_index=0)
    return await repo.update(user.id, session_id, update_data)


@router.post("/{session_id}/reopen", response_model=MeetingSession)
async def reopen_session(
    session_id: UUID,
    user: CurrentUser,
    repo: MeetingSessionRepo,
):
    """Reopen a completed meeting session (change status back to IN_PROGRESS)."""
    session = await repo.get(user.id, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if session.status != MeetingSessionStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="Session is not completed")

    update_data = MeetingSessionUpdate(
        status=MeetingSessionStatus.IN_PROGRESS,
        ended_at=None,
        current_agenda_index=0,
    )
    return await repo.update(user.id, session_id, update_data)


@router.post("/{session_id}/reset-to-preparation", response_model=MeetingSession)
async def reset_to_preparation(
    session_id: UUID,
    user: CurrentUser,
    repo: MeetingSessionRepo,
):
    """Reset a session to PREPARATION status (before meeting started)."""
    session = await repo.get(user.id, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if session.status == MeetingSessionStatus.PREPARATION:
        raise HTTPException(status_code=400, detail="Session is already in preparation")

    update_data = MeetingSessionUpdate(
        status=MeetingSessionStatus.PREPARATION,
        started_at=None,
        ended_at=None,
        current_agenda_index=None,
    )
    return await repo.update(user.id, session_id, update_data)


@router.post("/{session_id}/analyze-transcript", response_model=MeetingSummary)
async def analyze_transcript(
    session_id: UUID,
    request: AnalyzeTranscriptRequest,
    user: CurrentUser,
    repo: MeetingSessionRepo,
    agenda_repo: MeetingAgendaRepo,
    task_repo: TaskRepo,
    llm_provider: LLMProvider,
):
    """
    Analyze meeting transcript to extract summary, decisions, and next actions.

    The transcript will be analyzed using AI to extract:
    - Overall meeting summary
    - Discussion summary per agenda item
    - Decisions made during the meeting
    - Next actions with assignees and due dates

    If project_id is provided, existing project tasks are included as context
    to prevent duplicate task creation.
    """
    # Get session
    session = await repo.get(user.id, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Get agenda items for context
    agenda_items = await agenda_repo.list_by_task(user.id, session.task_id)

    # Get existing project tasks for duplicate prevention
    existing_tasks = None
    if request.project_id:
        try:
            project_id = UUID(request.project_id)
            existing_tasks = await task_repo.list(
                user_id=user.id,
                project_id=project_id,
                include_done=False,
                limit=200,
            )
            # Exclude meeting tasks (is_fixed_time) to keep context focused
            existing_tasks = [
                t for t in existing_tasks if not t.is_fixed_time
            ]
        except ValueError:
            pass  # Invalid project_id, skip task fetching

    # Analyze transcript
    service = MeetingSummaryService(llm_provider)
    summary = await service.analyze_transcript(
        session_id=session_id,
        transcript=request.transcript,
        agenda_items=agenda_items,
        existing_tasks=existing_tasks,
    )

    # Save transcript and summary to session
    update_data = MeetingSessionUpdate(
        transcript=request.transcript,
        summary=summary.overall_summary,
    )
    await repo.update(user.id, session_id, update_data)

    return summary


@router.post("/{session_id}/apply-actions")
async def apply_actions(
    session_id: UUID,
    request: CreateTasksFromActionsRequest,
    user: CurrentUser,
    repo: MeetingSessionRepo,
    task_repo: TaskRepo,
    assignment_repo: TaskAssignmentRepo,
):
    """
    Apply next actions from meeting transcript analysis.

    Handles three action types:
    - create: Create a new task
    - update: Update an existing task (description, priority, due_date, etc.)
    - add_subtask: Add a subtask to an existing task

    Returns summary of all operations performed.
    """
    # Verify session exists
    session = await repo.get(user.id, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Parse project_id if provided
    project_id = None
    if request.project_id:
        try:
            project_id = UUID(request.project_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid project ID format")

    priority_map = {
        "HIGH": Priority.HIGH,
        "MEDIUM": Priority.MEDIUM,
        "LOW": Priority.LOW,
    }
    energy_map = {
        "HIGH": EnergyLevel.HIGH,
        "MEDIUM": EnergyLevel.MEDIUM,
        "LOW": EnergyLevel.LOW,
    }

    results: list[dict] = []

    for action in request.actions:
        priority = priority_map.get(action.priority, Priority.MEDIUM)
        energy_level = energy_map.get(
            action.energy_level or "", EnergyLevel.MEDIUM
        )
        due_date = None
        if action.due_date:
            due_date = datetime.combine(action.due_date, datetime.min.time())

        action_type = action.action_type

        if action_type == ActionType.UPDATE and action.existing_task_id:
            # Update existing task
            result = await _handle_update_action(
                user, task_repo, assignment_repo, action,
                priority, energy_level, due_date,
            )
            results.append(result)

        elif action_type == ActionType.ADD_SUBTASK and action.existing_task_id:
            # Add subtask to existing task
            result = await _handle_add_subtask_action(
                user, task_repo, assignment_repo, action,
                project_id, priority, energy_level, due_date,
            )
            results.append(result)

        else:
            # Create new task (default)
            result = await _handle_create_action(
                user, task_repo, assignment_repo, action,
                project_id, priority, energy_level, due_date,
            )
            results.append(result)

    created = [r for r in results if r["action_type"] == "create"]
    updated = [r for r in results if r["action_type"] == "update"]
    subtasks = [r for r in results if r["action_type"] == "add_subtask"]

    return {
        "created_count": len(created),
        "updated_count": len(updated),
        "subtask_count": len(subtasks),
        "results": results,
    }


# Keep legacy endpoint for backward compatibility
@router.post("/{session_id}/create-tasks")
async def create_tasks_from_actions(
    session_id: UUID,
    request: CreateTasksFromActionsRequest,
    user: CurrentUser,
    repo: MeetingSessionRepo,
    task_repo: TaskRepo,
    assignment_repo: TaskAssignmentRepo,
):
    """Legacy endpoint: Create tasks from next actions. Delegates to apply-actions."""
    response = await apply_actions(
        session_id, request, user, repo, task_repo, assignment_repo,
    )
    # Return legacy format for backward compat
    created_tasks = [r for r in response["results"] if r["action_type"] == "create"]
    return {
        "created_count": len(created_tasks),
        "tasks": created_tasks,
    }


async def _handle_create_action(
    user, task_repo, assignment_repo, action,
    project_id, priority, energy_level, due_date,
) -> dict:
    """Handle a 'create' action — create a new task."""
    task_data = TaskCreate(
        title=action.title,
        description=action.description,
        purpose=action.purpose,
        project_id=project_id,
        importance=priority,
        urgency=priority,
        energy_level=energy_level,
        estimated_minutes=action.estimated_minutes,
        due_date=due_date,
        created_by=CreatedBy.AGENT,
    )
    task = await task_repo.create(user.id, task_data)

    if action.assignee_id:
        try:
            from app.models.collaboration import TaskAssignmentCreate
            await assignment_repo.assign(
                user.id, task.id,
                TaskAssignmentCreate(assignee_id=action.assignee_id),
            )
        except Exception:
            pass

    return {
        "action_type": "create",
        "id": str(task.id),
        "title": task.title,
        "assignee": action.assignee,
        "assignee_id": action.assignee_id,
        "due_date": action.due_date.isoformat() if action.due_date else None,
    }


async def _handle_update_action(
    user, task_repo, assignment_repo, action,
    priority, energy_level, due_date,
) -> dict:
    """Handle an 'update' action — update an existing task."""
    existing_task_id = UUID(action.existing_task_id)

    # Build update data from the action fields
    update_fields: dict = {}
    if action.description:
        update_fields["description"] = action.description
    if action.purpose:
        update_fields["purpose"] = action.purpose
    if due_date:
        update_fields["due_date"] = due_date
    if action.priority:
        update_fields["importance"] = priority
        update_fields["urgency"] = priority
    if action.energy_level:
        update_fields["energy_level"] = energy_level
    if action.estimated_minutes:
        update_fields["estimated_minutes"] = action.estimated_minutes

    if update_fields:
        task_update = TaskUpdate(**update_fields)
        await task_repo.update(user.id, existing_task_id, task_update)

    if action.assignee_id:
        try:
            from app.models.collaboration import TaskAssignmentCreate
            await assignment_repo.assign(
                user.id, existing_task_id,
                TaskAssignmentCreate(assignee_id=action.assignee_id),
            )
        except Exception:
            pass

    return {
        "action_type": "update",
        "id": str(existing_task_id),
        "title": action.title,
        "existing_task_title": action.existing_task_title,
        "update_reason": action.update_reason,
        "assignee": action.assignee,
        "assignee_id": action.assignee_id,
        "due_date": action.due_date.isoformat() if action.due_date else None,
    }


async def _handle_add_subtask_action(
    user, task_repo, assignment_repo, action,
    project_id, priority, energy_level, due_date,
) -> dict:
    """Handle an 'add_subtask' action — create a subtask under an existing task."""
    parent_task_id = UUID(action.existing_task_id)

    task_data = TaskCreate(
        title=action.title,
        description=action.description,
        purpose=action.purpose,
        project_id=project_id,
        parent_id=parent_task_id,
        importance=priority,
        urgency=priority,
        energy_level=energy_level,
        estimated_minutes=action.estimated_minutes,
        due_date=due_date,
        created_by=CreatedBy.AGENT,
    )
    task = await task_repo.create(user.id, task_data)

    if action.assignee_id:
        try:
            from app.models.collaboration import TaskAssignmentCreate
            await assignment_repo.assign(
                user.id, task.id,
                TaskAssignmentCreate(assignee_id=action.assignee_id),
            )
        except Exception:
            pass

    return {
        "action_type": "add_subtask",
        "id": str(task.id),
        "title": task.title,
        "parent_task_id": str(parent_task_id),
        "existing_task_title": action.existing_task_title,
        "assignee": action.assignee,
        "assignee_id": action.assignee_id,
        "due_date": action.due_date.isoformat() if action.due_date else None,
    }
