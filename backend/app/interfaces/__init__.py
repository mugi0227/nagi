"""Abstract interfaces for infrastructure abstraction."""

from app.interfaces.agent_task_repository import IAgentTaskRepository
from app.interfaces.auth_provider import IAuthProvider
from app.interfaces.blocker_repository import IBlockerRepository
from app.interfaces.capture_repository import ICaptureRepository
from app.interfaces.chat_session_repository import IChatSessionRepository
from app.interfaces.checkin_repository import ICheckinRepository
from app.interfaces.llm_provider import ILLMProvider
from app.interfaces.memory_repository import IMemoryRepository
from app.interfaces.project_invitation_repository import IProjectInvitationRepository
from app.interfaces.project_member_repository import IProjectMemberRepository
from app.interfaces.project_repository import IProjectRepository
from app.interfaces.recurring_meeting_repository import IRecurringMeetingRepository
from app.interfaces.speech_provider import ISpeechToTextProvider
from app.interfaces.storage_provider import IStorageProvider
from app.interfaces.task_assignment_repository import ITaskAssignmentRepository
from app.interfaces.task_repository import ITaskRepository
from app.interfaces.user_repository import IUserRepository

__all__ = [
    "ITaskRepository",
    "IProjectRepository",
    "IAgentTaskRepository",
    "IMemoryRepository",
    "ICaptureRepository",
    "IChatSessionRepository",
    "ILLMProvider",
    "ISpeechToTextProvider",
    "IStorageProvider",
    "IAuthProvider",
    "IUserRepository",
    "IProjectInvitationRepository",
    "IProjectMemberRepository",
    "ITaskAssignmentRepository",
    "ICheckinRepository",
    "IBlockerRepository",
    "IRecurringMeetingRepository",
]
