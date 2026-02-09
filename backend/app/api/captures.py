"""
Captures API endpoints.

Endpoints for storing and retrieving user input captures.
"""

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status

from app.api.deps import (
    AgentTaskRepo,
    CaptureRepo,
    ChatRepo,
    CheckinRepo,
    CurrentUser,
    LLMProvider,
    MeetingAgendaRepo,
    MemoryRepo,
    MilestoneRepo,
    PhaseRepo,
    ProjectInvitationRepo,
    ProjectMemberRepo,
    ProjectRepo,
    ProposalRepo,
    RecurringMeetingRepo,
    RecurringTaskRepo,
    StorageProvider,
    TaskAssignmentRepo,
    TaskRepo,
)
from app.core.exceptions import NotFoundError
from app.models.capture import Capture, CaptureCreate
from app.services.agent_service import AgentService

router = APIRouter()


@router.post("", response_model=Capture, status_code=status.HTTP_201_CREATED)
async def create_capture(
    capture: CaptureCreate,
    user: CurrentUser,
    repo: CaptureRepo,
    storage: StorageProvider,
):
    """Create a new capture."""
    import base64
    import mimetypes
    from pathlib import Path
    from uuid import uuid4

    def _split_data_url(data_url: str) -> tuple[str, str]:
        """Split data URL into (mime_type, encoded_data)."""
        if not data_url or "," not in data_url:
            return "", ""

        header, encoded = data_url.split(",", 1)
        mime_type = ""
        if header.startswith("data:"):
            mime_type = header[5:].split(";")[0].strip().lower()
        return mime_type, encoded

    def _guess_extension(mime_type: str, file_name: str | None = None) -> str:
        if file_name:
            suffix = Path(file_name).suffix.strip()
            if suffix:
                return suffix

        mime_map = {
            "image/jpeg": ".jpg",
            "image/png": ".png",
            "image/gif": ".gif",
            "image/webp": ".webp",
            "application/pdf": ".pdf",
            "text/plain": ".txt",
            "application/json": ".json",
        }
        if mime_type in mime_map:
            return mime_map[mime_type]

        guessed = mimetypes.guess_extension(mime_type or "")
        if guessed:
            return guessed
        return ".bin"

    # Process base64 image if provided.
    if capture.base64_image:
        try:
            image_mime_type, encoded = _split_data_url(capture.base64_image)
            if image_mime_type.startswith("image/") and encoded:
                image_bytes = base64.b64decode(encoded)
                ext = _guess_extension(image_mime_type)
                filename = f"captures/{uuid4()}{ext}"
                await storage.upload(filename, image_bytes, content_type=image_mime_type)
                capture.content_url = storage.get_public_url(filename)
                capture.file_content_type = image_mime_type
                capture.base64_image = None
        except (ValueError, IndexError, TypeError):
            pass

    # Process base64 file (PDF etc) if provided.
    if capture.base64_file:
        try:
            file_mime_type, encoded = _split_data_url(capture.base64_file)
            if not encoded:
                # Accept plain base64 as fallback.
                encoded = capture.base64_file
            if not file_mime_type:
                file_mime_type = (capture.file_content_type or "application/octet-stream").strip().lower()

            file_bytes = base64.b64decode(encoded)
            ext = _guess_extension(file_mime_type, capture.file_name)
            filename = f"captures/{uuid4()}{ext}"
            await storage.upload(filename, file_bytes, content_type=file_mime_type)
            capture.content_url = storage.get_public_url(filename)
            capture.file_content_type = file_mime_type
            capture.base64_file = None
        except (ValueError, IndexError, TypeError):
            pass

    return await repo.create(user.id, capture)


@router.get("/{capture_id}", response_model=Capture)
async def get_capture(
    capture_id: UUID,
    user: CurrentUser,
    repo: CaptureRepo,
):
    """Get a capture by ID."""
    capture = await repo.get(user.id, capture_id)
    if not capture:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Capture {capture_id} not found",
        )
    return capture


@router.get("", response_model=list[Capture])
async def list_captures(
    user: CurrentUser,
    repo: CaptureRepo,
    processed: Optional[bool] = Query(None, description="Filter by processed status"),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
):
    """List captures with optional filters."""
    return await repo.list(
        user.id,
        processed=processed,
        limit=limit,
        offset=offset,
    )


@router.post("/{capture_id}/process", response_model=Capture)
async def mark_capture_processed(
    capture_id: UUID,
    user: CurrentUser,
    repo: CaptureRepo,
):
    """Mark a capture as processed."""
    try:
        return await repo.mark_processed(user.id, capture_id)
    except NotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )


@router.delete("/{capture_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_capture(
    capture_id: UUID,
    user: CurrentUser,
    repo: CaptureRepo,
):
    """Delete a capture."""
    deleted = await repo.delete(user.id, capture_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Capture {capture_id} not found",
        )


@router.post("/{capture_id}/analyze")
async def analyze_capture(
    capture_id: UUID,
    user: CurrentUser,
    llm_provider: LLMProvider,
    task_repo: TaskRepo,
    project_repo: ProjectRepo,
    phase_repo: PhaseRepo,
    milestone_repo: MilestoneRepo,
    project_member_repo: ProjectMemberRepo,
    project_invitation_repo: ProjectInvitationRepo,
    task_assignment_repo: TaskAssignmentRepo,
    memory_repo: MemoryRepo,
    agent_task_repo: AgentTaskRepo,
    capture_repo: CaptureRepo,
    proposal_repo: ProposalRepo,
    chat_repo: ChatRepo,
    checkin_repo: CheckinRepo,
    meeting_agenda_repo: MeetingAgendaRepo,
    recurring_meeting_repo: RecurringMeetingRepo,
    recurring_task_repo: RecurringTaskRepo,
):
    """
    Analyze a capture using AI to suggest task details.

    Returns a TaskCreate-compatible JSON object.
    """
    agent_service = AgentService(
        llm_provider=llm_provider,
        task_repo=task_repo,
        project_repo=project_repo,
        phase_repo=phase_repo,
        milestone_repo=milestone_repo,
        project_member_repo=project_member_repo,
        project_invitation_repo=project_invitation_repo,
        task_assignment_repo=task_assignment_repo,
        memory_repo=memory_repo,
        agent_task_repo=agent_task_repo,
        capture_repo=capture_repo,
        chat_repo=chat_repo,
        proposal_repo=proposal_repo,
        checkin_repo=checkin_repo,
        meeting_agenda_repo=meeting_agenda_repo,
        recurring_meeting_repo=recurring_meeting_repo,
        recurring_task_repo=recurring_task_repo,
    )

    try:
        return await agent_service.analyze_capture(user.id, capture_id)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Analysis failed: {str(e)}",
        )
