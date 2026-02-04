"""
Chat API endpoint.

Main interface for user interaction with the secretary agent.
"""

import json
from typing import AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse

from app.api.deps import (
    CurrentUser,
    LLMProvider,
    TaskRepo,
    ProjectRepo,
    PhaseRepo,
    MilestoneRepo,
    ProjectMemberRepo,
    ProjectInvitationRepo,
    TaskAssignmentRepo,
    ProposalRepo,
    MemoryRepo,
    AgentTaskRepo,
    MeetingAgendaRepo,
    CaptureRepo,
    ChatRepo,
    CheckinRepo,
    RecurringMeetingRepo,
    RecurringTaskRepo,
)
from app.core.exceptions import LLMError
from app.models.chat import ChatRequest, ChatResponse
from app.services.agent_service import AgentService

router = APIRouter()


@router.post("", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    user: CurrentUser,
    llm_provider: LLMProvider,
    task_repo: TaskRepo,
    project_repo: ProjectRepo,
    phase_repo: PhaseRepo,
    milestone_repo: MilestoneRepo,
    project_member_repo: ProjectMemberRepo,
    project_invitation_repo: ProjectInvitationRepo,
    task_assignment_repo: TaskAssignmentRepo,
    proposal_repo: ProposalRepo,
    memory_repo: MemoryRepo,
    agent_task_repo: AgentTaskRepo,
    meeting_agenda_repo: MeetingAgendaRepo,
    capture_repo: CaptureRepo,
    chat_repo: ChatRepo,
    checkin_repo: CheckinRepo,
    recurring_meeting_repo: RecurringMeetingRepo,
    recurring_task_repo: RecurringTaskRepo,
    session_id: str | None = Query(None, description="Session ID for conversation continuity"),
):
    """
    Chat with the secretary agent.

    This is the main entry point for user interactions.
    The agent processes the input and can create tasks, search memories, etc.

    Args:
        request: Chat request with text/audio/image
        user: Current authenticated user
        llm_provider: LLM provider instance
        task_repo: Task repository
        memory_repo: Memory repository
        agent_task_repo: Agent task repository
        capture_repo: Capture repository
        session_id: Optional session ID for conversation continuity

    Returns:
        Chat response with assistant message and related tasks
    """
    # Create agent service
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
        meeting_agenda_repo=meeting_agenda_repo,
        capture_repo=capture_repo,
        chat_repo=chat_repo,
        proposal_repo=proposal_repo,
        checkin_repo=checkin_repo,
        recurring_meeting_repo=recurring_meeting_repo,
        recurring_task_repo=recurring_task_repo,
    )

    try:
        # Process chat request
        response = await agent_service.process_chat(
            user_id=user.id,
            request=request,
            session_id=session_id or request.session_id,
        )

        return response

    except LLMError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"LLM error: {str(e)}",
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal server error: {str(e)}",
        )


@router.post("/stream")
async def chat_stream(
    request: ChatRequest,
    user: CurrentUser,
    llm_provider: LLMProvider,
    task_repo: TaskRepo,
    project_repo: ProjectRepo,
    phase_repo: PhaseRepo,
    milestone_repo: MilestoneRepo,
    project_member_repo: ProjectMemberRepo,
    project_invitation_repo: ProjectInvitationRepo,
    task_assignment_repo: TaskAssignmentRepo,
    proposal_repo: ProposalRepo,
    memory_repo: MemoryRepo,
    agent_task_repo: AgentTaskRepo,
    meeting_agenda_repo: MeetingAgendaRepo,
    capture_repo: CaptureRepo,
    chat_repo: ChatRepo,
    checkin_repo: CheckinRepo,
    recurring_meeting_repo: RecurringMeetingRepo,
    recurring_task_repo: RecurringTaskRepo,
    session_id: str | None = Query(None, description="Session ID for conversation continuity"),
):
    """
    Chat with streaming response (Server-Sent Events).

    Returns a stream of events showing tool calls and text generation in real-time.
    """
    # Create agent service
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
        meeting_agenda_repo=meeting_agenda_repo,
        capture_repo=capture_repo,
        chat_repo=chat_repo,
        proposal_repo=proposal_repo,
        checkin_repo=checkin_repo,
        recurring_meeting_repo=recurring_meeting_repo,
        recurring_task_repo=recurring_task_repo,
    )

    async def event_generator() -> AsyncGenerator[str, None]:
        """Generate Server-Sent Events for streaming response."""
        try:
            async for chunk in agent_service.process_chat_stream(
                user_id=user.id,
                request=request,
                session_id=session_id or request.session_id,
            ):
                # Send each chunk as SSE
                yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"

        except Exception as e:
            error_chunk = {
                "chunk_type": "error",
                "content": str(e),
            }
            yield f"data: {json.dumps(error_chunk, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable buffering for nginx
        },
    )


@router.get("/sessions")
async def list_sessions(
    user: CurrentUser,
    llm_provider: LLMProvider,
    task_repo: TaskRepo,
    project_repo: ProjectRepo,
    phase_repo: PhaseRepo,
    milestone_repo: MilestoneRepo,
    project_member_repo: ProjectMemberRepo,
    project_invitation_repo: ProjectInvitationRepo,
    task_assignment_repo: TaskAssignmentRepo,
    proposal_repo: ProposalRepo,
    memory_repo: MemoryRepo,
    agent_task_repo: AgentTaskRepo,
    meeting_agenda_repo: MeetingAgendaRepo,
    capture_repo: CaptureRepo,
    chat_repo: ChatRepo,
    checkin_repo: CheckinRepo,
    recurring_meeting_repo: RecurringMeetingRepo,
    recurring_task_repo: RecurringTaskRepo,
):
    """List chat sessions for the current user."""
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
        meeting_agenda_repo=meeting_agenda_repo,
        capture_repo=capture_repo,
        chat_repo=chat_repo,
        proposal_repo=proposal_repo,
        checkin_repo=checkin_repo,
        recurring_meeting_repo=recurring_meeting_repo,
        recurring_task_repo=recurring_task_repo,
    )
    return await agent_service.list_user_sessions(user.id)


@router.get("/history/{session_id}")
async def get_history(
    session_id: str,
    user: CurrentUser,
    llm_provider: LLMProvider,
    task_repo: TaskRepo,
    project_repo: ProjectRepo,
    phase_repo: PhaseRepo,
    milestone_repo: MilestoneRepo,
    project_member_repo: ProjectMemberRepo,
    project_invitation_repo: ProjectInvitationRepo,
    task_assignment_repo: TaskAssignmentRepo,
    proposal_repo: ProposalRepo,
    memory_repo: MemoryRepo,
    agent_task_repo: AgentTaskRepo,
    meeting_agenda_repo: MeetingAgendaRepo,
    capture_repo: CaptureRepo,
    chat_repo: ChatRepo,
    checkin_repo: CheckinRepo,
    recurring_meeting_repo: RecurringMeetingRepo,
    recurring_task_repo: RecurringTaskRepo,
):
    """Get message history for a specific session."""
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
        meeting_agenda_repo=meeting_agenda_repo,
        capture_repo=capture_repo,
        chat_repo=chat_repo,
        proposal_repo=proposal_repo,
        checkin_repo=checkin_repo,
        recurring_meeting_repo=recurring_meeting_repo,
        recurring_task_repo=recurring_task_repo,
    )
    return await agent_service.get_session_messages(user.id, session_id)

