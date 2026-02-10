"""
Secretary Partner AI - Main Application Entry Point

Brain Dump Partner: ADHD向け自律型秘書AI
"""

import json
import os
from contextlib import asynccontextmanager
from uuid import UUID

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.config import get_settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler for startup/shutdown events."""
    # Startup
    settings = get_settings()
    print(f"Starting Secretary Partner AI in {settings.ENVIRONMENT} mode...")

    # Initialize database if needed
    if settings.ENVIRONMENT == "local":
        from app.infrastructure.local.database import init_db

        await init_db()  # This also runs migrations

    # Start background scheduler for periodic jobs
    from app.services.background_scheduler import (
        start_background_scheduler,
        stop_background_scheduler,
    )

    await start_background_scheduler()

    yield

    # Shutdown
    print("Shutting down Secretary Partner AI...")
    await stop_background_scheduler()


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    settings = get_settings()

    app = FastAPI(
        title="Secretary Partner AI",
        description="Brain Dump Partner - ADHD向け自律型秘書AI (外付け前頭葉)",
        version="0.1.0",
        lifespan=lifespan,
        docs_url="/docs" if settings.DEBUG else None,
        redoc_url="/redoc" if settings.DEBUG else None,
    )

    from app.api.deps import (
        get_blocker_repository,
        get_meeting_agenda_repository,
        get_milestone_repository,
        get_phase_repository,
        get_project_member_repository,
        get_project_repository,
        get_recurring_meeting_repository,
        get_task_assignment_repository,
        get_task_repository,
    )
    from app.services.realtime_service import realtime_manager

    async def resolve_task_project_id(user_id: str, task_id: UUID) -> UUID | None:
        task_repo = get_task_repository()
        task = await task_repo.get(user_id, task_id)
        if task:
            return task.project_id
        project_repo = get_project_repository()
        projects = await project_repo.list(user_id, limit=1000)
        for project in projects:
            task = await task_repo.get(user_id, task_id, project_id=project.id)
            if task:
                return task.project_id
        return None

    async def resolve_recurring_meeting_project_id(
        user_id: str,
        meeting_id: UUID,
    ) -> UUID | None:
        meeting_repo = get_recurring_meeting_repository()
        meeting = await meeting_repo.get(user_id, meeting_id)
        if meeting:
            return meeting.project_id
        project_repo = get_project_repository()
        projects = await project_repo.list(user_id, limit=1000)
        for project in projects:
            meeting = await meeting_repo.get(user_id, meeting_id, project_id=project.id)
            if meeting:
                return meeting.project_id
        return None

    async def resolve_project_id(path: str, body: dict | None, user_id: str) -> UUID | None:
        if isinstance(body, dict):
            project_value = body.get("project_id")
            if project_value:
                try:
                    return UUID(str(project_value))
                except ValueError:
                    pass

        parts = path.strip("/").split("/")
        if len(parts) < 2 or parts[0] != "api":
            return None

        resource = parts[1]

        if resource == "projects" and len(parts) >= 3:
            try:
                return UUID(parts[2])
            except ValueError:
                return None

        if resource == "phases":
            if len(parts) >= 4 and parts[2] == "project":
                try:
                    return UUID(parts[3])
                except ValueError:
                    return None
            if len(parts) >= 3:
                try:
                    phase_id = UUID(parts[2])
                except ValueError:
                    return None
                phase_repo = get_phase_repository()
                if hasattr(phase_repo, "get_project_id"):
                    return await phase_repo.get_project_id(phase_id)

        if resource == "milestones":
            if len(parts) >= 4 and parts[2] == "project":
                try:
                    return UUID(parts[3])
                except ValueError:
                    return None
            if len(parts) >= 3:
                try:
                    milestone_id = UUID(parts[2])
                except ValueError:
                    return None
                milestone_repo = get_milestone_repository()
                if hasattr(milestone_repo, "get_project_id"):
                    return await milestone_repo.get_project_id(milestone_id)

        if resource == "tasks":
            if len(parts) >= 4 and parts[2] == "assignments":
                try:
                    assignment_id = UUID(parts[3])
                except ValueError:
                    return None
                assignment_repo = get_task_assignment_repository()
                assignment = await assignment_repo.get_by_id(assignment_id)
                if assignment:
                    return await resolve_task_project_id(user_id, assignment.task_id)
                return None
            if len(parts) >= 4 and parts[2] == "blockers":
                try:
                    blocker_id = UUID(parts[3])
                except ValueError:
                    return None
                blocker_repo = get_blocker_repository()
                blocker = await blocker_repo.get_by_id(blocker_id)
                if blocker:
                    return await resolve_task_project_id(user_id, blocker.task_id)
                return None
            if len(parts) >= 3:
                try:
                    task_id = UUID(parts[2])
                except ValueError:
                    return None
                return await resolve_task_project_id(user_id, task_id)

        if resource == "meeting-agendas":
            if len(parts) >= 4 and parts[2] == "tasks":
                try:
                    task_id = UUID(parts[3])
                except ValueError:
                    return None
                return await resolve_task_project_id(user_id, task_id)

            if len(parts) >= 4 and parts[2] == "items":
                try:
                    agenda_item_id = UUID(parts[3])
                except ValueError:
                    return None
                agenda_repo = get_meeting_agenda_repository()
                agenda_item = await agenda_repo.get_by_id(agenda_item_id)
                if not agenda_item:
                    return None
                if agenda_item.task_id:
                    return await resolve_task_project_id(user_id, agenda_item.task_id)
                if agenda_item.meeting_id:
                    return await resolve_recurring_meeting_project_id(user_id, agenda_item.meeting_id)
                return None

            if len(parts) >= 3:
                try:
                    meeting_id = UUID(parts[2])
                except ValueError:
                    return None
                return await resolve_recurring_meeting_project_id(user_id, meeting_id)

        return None

    async def resolve_recipients(user_id: str, project_id: UUID | None) -> set[str]:
        if not project_id:
            return {user_id}
        member_repo = get_project_member_repository()
        project_repo = get_project_repository()
        members = await member_repo.list_by_project(project_id)
        member_ids = {member.member_user_id for member in members}
        project = await project_repo.get_by_id(project_id)
        if project:
            member_ids.add(project.user_id)
        member_ids.add(user_id)
        return member_ids

    @app.middleware("http")
    async def realtime_middleware(request: Request, call_next):
        body_json = None
        if request.method in {"POST", "PUT", "PATCH", "DELETE"}:
            body_bytes = await request.body()
            if body_bytes:
                try:
                    body_json = json.loads(body_bytes)
                except json.JSONDecodeError:
                    body_json = None
        response = await call_next(request)
        if request.method in {"POST", "PUT", "PATCH", "DELETE"} and response.status_code < 400:
            if request.url.path.endswith("/stream"):
                return response
            user = getattr(request.state, "user", None)
            if user:
                project_id = await resolve_project_id(request.url.path, body_json, user.id)
                recipients = await resolve_recipients(user.id, project_id)
                await realtime_manager.publish_many(
                    recipients,
                    {
                        "type": "refresh",
                        "path": request.url.path,
                        "method": request.method,
                    },
                )
        return response

    # CORS middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.ALLOWED_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Include routers
    from app.api import (
        achievements,
        agent_tasks,
        auth,
        captures,
        chat,
        heartbeat,
        issues,
        meeting_agendas,
        meeting_sessions,
        memories,
        milestones,
        models,
        notifications,
        phases,
        project_achievements,
        projects,
        proposals,
        realtime,
        recurring_meetings,
        recurring_tasks,
        schedule_settings,
        tasks,
        today,
        users,
    )

    app.include_router(chat.router, prefix="/api/chat", tags=["chat"])
    app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
    app.include_router(tasks.router, prefix="/api/tasks", tags=["tasks"])
    app.include_router(projects.router, prefix="/api/projects", tags=["projects"])
    app.include_router(phases.router, prefix="/api", tags=["phases"])
    app.include_router(milestones.router, prefix="/api", tags=["milestones"])
    app.include_router(proposals.router, prefix="/api/proposals", tags=["proposals"])
    app.include_router(captures.router, prefix="/api/captures", tags=["captures"])
    app.include_router(agent_tasks.router, prefix="/api/agent-tasks", tags=["agent_tasks"])
    app.include_router(memories.router, prefix="/api/memories", tags=["memories"])
    app.include_router(recurring_meetings.router, prefix="/api/recurring-meetings", tags=["recurring_meetings"])
    app.include_router(recurring_tasks.router, prefix="/api/recurring-tasks", tags=["recurring_tasks"])
    app.include_router(meeting_agendas.router, prefix="/api", tags=["meeting_agendas"])
    app.include_router(meeting_sessions.router, prefix="/api", tags=["meeting_sessions"])
    app.include_router(heartbeat.router, prefix="/api/heartbeat", tags=["heartbeat"])
    app.include_router(today.router, prefix="/api/today", tags=["today"])
    app.include_router(schedule_settings.router, prefix="/api", tags=["schedule_settings"])
    app.include_router(users.router, prefix="/api/users", tags=["users"])
    app.include_router(issues.router, prefix="/api/issues", tags=["issues"])
    app.include_router(achievements.router, prefix="/api/achievements", tags=["achievements"])
    app.include_router(project_achievements.router, prefix="/api/projects", tags=["project_achievements"])
    app.include_router(notifications.router, prefix="/api/notifications", tags=["notifications"])
    app.include_router(realtime.router, prefix="/api/realtime", tags=["realtime"])
    app.include_router(models.router, prefix="/api/models", tags=["models"])

    # Mount storage for local development
    storage_path = settings.STORAGE_BASE_PATH
    if not os.path.isabs(storage_path):
        storage_path = os.path.join(os.getcwd(), storage_path)

    if os.path.exists(storage_path):
        app.mount("/storage", StaticFiles(directory=storage_path), name="storage")

    @app.get("/health")
    async def health_check():
        """Health check endpoint."""
        return {
            "status": "healthy",
            "environment": settings.ENVIRONMENT,
            "version": "0.1.0"
        }

    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn

    settings = get_settings()
    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
    )
