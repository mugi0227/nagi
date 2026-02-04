"""
Integration tests for AgentService.

Tests the service layer with real repositories but mocked LLM calls.
"""

import pytest
from uuid import uuid4

from app.models.chat import ChatRequest, ChatMode
from app.services.agent_service import AgentService
from app.infrastructure.local.task_repository import SqliteTaskRepository
from app.infrastructure.local.memory_repository import SqliteMemoryRepository
from app.infrastructure.local.agent_task_repository import SqliteAgentTaskRepository
from app.infrastructure.local.capture_repository import SqliteCaptureRepository
from app.infrastructure.local.chat_session_repository import SqliteChatSessionRepository
from app.infrastructure.local.gemini_api_provider import GeminiAPIProvider
from app.infrastructure.local.phase_repository import SqlitePhaseRepository
from app.infrastructure.local.milestone_repository import SqliteMilestoneRepository
from app.infrastructure.local.project_member_repository import SqliteProjectMemberRepository
from app.infrastructure.local.project_invitation_repository import SqliteProjectInvitationRepository
from app.infrastructure.local.task_assignment_repository import SqliteTaskAssignmentRepository
from app.infrastructure.local.meeting_agenda_repository import SqliteMeetingAgendaRepository
from app.infrastructure.local.proposal_repository import InMemoryProposalRepository
from app.infrastructure.local.checkin_repository import SqliteCheckinRepository
from app.infrastructure.local.recurring_meeting_repository import SqliteRecurringMeetingRepository
from app.infrastructure.local.recurring_task_repository import SqliteRecurringTaskRepository
from app.infrastructure.local.project_repository import SqliteProjectRepository
from app.core.config import get_settings


def build_agent_service(session_factory, settings):
    task_repo = SqliteTaskRepository(session_factory=session_factory)
    project_repo = SqliteProjectRepository(session_factory=session_factory)
    phase_repo = SqlitePhaseRepository(session_factory=session_factory)
    milestone_repo = SqliteMilestoneRepository(session_factory=session_factory)
    project_member_repo = SqliteProjectMemberRepository(session_factory=session_factory)
    project_invitation_repo = SqliteProjectInvitationRepository(session_factory=session_factory)
    task_assignment_repo = SqliteTaskAssignmentRepository(session_factory=session_factory)
    memory_repo = SqliteMemoryRepository(session_factory=session_factory)
    agent_task_repo = SqliteAgentTaskRepository(session_factory=session_factory)
    meeting_agenda_repo = SqliteMeetingAgendaRepository(session_factory=session_factory)
    capture_repo = SqliteCaptureRepository(session_factory=session_factory)
    chat_repo = SqliteChatSessionRepository(session_factory=session_factory)
    proposal_repo = InMemoryProposalRepository()
    checkin_repo = SqliteCheckinRepository(session_factory=session_factory)
    recurring_meeting_repo = SqliteRecurringMeetingRepository(session_factory=session_factory)
    recurring_task_repo = SqliteRecurringTaskRepository(session_factory=session_factory)
    llm_provider = GeminiAPIProvider(settings.GEMINI_MODEL)

    return AgentService(
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


@pytest.mark.integration
@pytest.mark.asyncio
async def test_agent_service_initialization(session_factory, test_user_id):
    """Test AgentService can be initialized."""
    settings = get_settings()

    if not settings.GOOGLE_API_KEY:
        pytest.skip("GOOGLE_API_KEY not configured")

    service = build_agent_service(session_factory, settings)

    assert service is not None


@pytest.mark.integration
@pytest.mark.asyncio
async def test_agent_service_process_chat(session_factory, test_user_id):
    """Test AgentService can process a chat request."""
    settings = get_settings()

    if not settings.GOOGLE_API_KEY:
        pytest.skip("GOOGLE_API_KEY not configured")

    service = build_agent_service(session_factory, settings)

    request = ChatRequest(
        text="こんにちは",
        mode=ChatMode.DUMP,
    )

    response = await service.process_chat(
        user_id=test_user_id,
        request=request,
    )

    assert response.assistant_message is not None
    assert len(response.assistant_message) > 0
    assert response.session_id is not None
    assert isinstance(response.related_tasks, list)


@pytest.mark.integration
@pytest.mark.asyncio
async def test_agent_service_creates_capture(session_factory, test_user_id):
    """Test AgentService creates a capture for text input."""
    settings = get_settings()

    if not settings.GOOGLE_API_KEY:
        pytest.skip("GOOGLE_API_KEY not configured")

    service = build_agent_service(session_factory, settings)
    capture_repo = SqliteCaptureRepository(session_factory=session_factory)

    request = ChatRequest(
        text="テストメッセージ",
        mode=ChatMode.DUMP,
    )

    response = await service.process_chat(
        user_id=test_user_id,
        request=request,
    )

    # Verify capture was created
    assert response.capture_id is not None
    capture = await capture_repo.get(test_user_id, response.capture_id)
    assert capture is not None
    assert capture.raw_text == "テストメッセージ"

