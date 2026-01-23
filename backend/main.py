"""
Secretary Partner AI - Main Application Entry Point

Brain Dump Partner: ADHD向け自律型秘書AI
"""

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
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

    yield

    # Shutdown
    print("Shutting down Secretary Partner AI...")


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
        phases,
        projects,
        proposals,
        recurring_meetings,
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
    app.include_router(meeting_agendas.router, prefix="/api", tags=["meeting_agendas"])
    app.include_router(meeting_sessions.router, prefix="/api", tags=["meeting_sessions"])
    app.include_router(heartbeat.router, prefix="/api/heartbeat", tags=["heartbeat"])
    app.include_router(today.router, prefix="/api/today", tags=["today"])
    app.include_router(users.router, prefix="/api/users", tags=["users"])
    app.include_router(issues.router, prefix="/api/issues", tags=["issues"])
    app.include_router(achievements.router, prefix="/api/achievements", tags=["achievements"])

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
