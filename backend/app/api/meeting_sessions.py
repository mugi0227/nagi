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
    TaskRepo,
)
from app.models.meeting_session import (
    MeetingSession,
    MeetingSessionCreate,
    MeetingSessionUpdate,
)
from app.models.meeting_summary import (
    AnalyzeTranscriptRequest,
    CreateTasksFromActionsRequest,
    MeetingSummary,
)
from app.models.enums import CreatedBy, EnergyLevel, MeetingSessionStatus, Priority
from app.models.task import TaskCreate
from app.services.meeting_summary_service import MeetingSummaryService

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
        started_at=datetime.utcnow(),
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
        ended_at=datetime.utcnow(),
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


@router.post("/{session_id}/analyze-transcript", response_model=MeetingSummary)
async def analyze_transcript(
    session_id: UUID,
    request: AnalyzeTranscriptRequest,
    user: CurrentUser,
    repo: MeetingSessionRepo,
    agenda_repo: MeetingAgendaRepo,
    llm_provider: LLMProvider,
):
    """
    Analyze meeting transcript to extract summary, decisions, and next actions.

    The transcript will be analyzed using AI to extract:
    - Overall meeting summary
    - Discussion summary per agenda item
    - Decisions made during the meeting
    - Next actions with assignees and due dates
    """
    # Get session
    session = await repo.get(user.id, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Get agenda items for context
    agenda_items = await agenda_repo.list_by_task(user.id, session.task_id)

    # Analyze transcript
    service = MeetingSummaryService(llm_provider)
    summary = await service.analyze_transcript(
        session_id=session_id,
        transcript=request.transcript,
        agenda_items=agenda_items,
    )

    # Save transcript and summary to session
    update_data = MeetingSessionUpdate(
        transcript=request.transcript,
        summary=summary.overall_summary,
    )
    await repo.update(user.id, session_id, update_data)

    return summary


@router.post("/{session_id}/create-tasks")
async def create_tasks_from_actions(
    session_id: UUID,
    request: CreateTasksFromActionsRequest,
    user: CurrentUser,
    repo: MeetingSessionRepo,
    task_repo: TaskRepo,
):
    """
    Create tasks from next actions extracted from meeting transcript.

    Takes a list of next actions and creates corresponding tasks.
    Returns the list of created task IDs.
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

    # Create tasks from actions
    created_tasks = []
    for action in request.actions:
        # Map priority string to enum
        priority_map = {
            "HIGH": Priority.HIGH,
            "MEDIUM": Priority.MEDIUM,
            "LOW": Priority.LOW,
        }
        priority = priority_map.get(action.priority, Priority.MEDIUM)

        # Parse due_date if provided
        due_date = None
        if action.due_date:
            due_date = datetime.combine(action.due_date, datetime.min.time())

        task_data = TaskCreate(
            title=action.title,
            description=action.description,
            project_id=project_id,
            importance=priority,
            urgency=priority,
            energy_level=EnergyLevel.MEDIUM,
            due_date=due_date,
            created_by=CreatedBy.AGENT,
        )

        task = await task_repo.create(user.id, task_data)
        created_tasks.append({
            "id": str(task.id),
            "title": task.title,
            "assignee": action.assignee,
            "due_date": action.due_date.isoformat() if action.due_date else None,
        })

    return {
        "created_count": len(created_tasks),
        "tasks": created_tasks,
    }
