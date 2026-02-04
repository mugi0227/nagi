"""API routers."""

from app.api import (
    agent_tasks,
    auth,
    captures,
    chat,
    heartbeat,
    memories,
    milestones,
    phases,
    projects,
    realtime,
    recurring_meetings,
    schedule_settings,
    tasks,
    today,
    users,
)

__all__ = [
    "auth",
    "chat",
    "tasks",
    "projects",
    "phases",
    "milestones",
    "captures",
    "agent_tasks",
    "memories",
    "heartbeat",
    "today",
    "realtime",
    "recurring_meetings",
    "schedule_settings",
    "users",
]
