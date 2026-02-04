"""
Heartbeat API endpoint.

Called periodically to trigger autonomous agent actions.
"""

from fastapi import APIRouter, Depends, status

from app.api.deps import CheckinRepo, CurrentUser, AgentTaskRepo, RecurringMeetingRepo, RecurringTaskRepo, TaskRepo
from app.services.heartbeat_service import HeartbeatService
from app.services.recurring_meeting_service import RecurringMeetingService
from app.services.recurring_task_service import RecurringTaskService

router = APIRouter()


def get_heartbeat_service(
    agent_task_repo: AgentTaskRepo,
    recurring_meeting_repo: RecurringMeetingRepo,
    recurring_task_repo: RecurringTaskRepo,
    task_repo: TaskRepo,
    checkin_repo: CheckinRepo,
) -> HeartbeatService:
    """Get HeartbeatService instance."""
    recurring_service = RecurringMeetingService(
        recurring_repo=recurring_meeting_repo,
        task_repo=task_repo,
        checkin_repo=checkin_repo,
    )
    recurring_task_service = RecurringTaskService(
        recurring_repo=recurring_task_repo,
        task_repo=task_repo,
    )
    return HeartbeatService(
        agent_task_repo=agent_task_repo,
        recurring_meeting_service=recurring_service,
        recurring_task_service=recurring_task_service,
    )


@router.post("", status_code=status.HTTP_200_OK)
async def heartbeat(
    user: CurrentUser,
    heartbeat_service: HeartbeatService = Depends(get_heartbeat_service),
):
    """
    Heartbeat endpoint for triggering autonomous agent actions.

    This endpoint is called periodically (via scheduler) to:
    - Check for pending agent tasks
    - Execute scheduled actions (reminders, reviews, etc.)
    - Respect quiet hours

    Returns:
        dict: Status, processed count, and failed count
    """
    result = await heartbeat_service.process_heartbeat(user.id)
    return result

