"""
Achievements API endpoints.

Endpoints for generating and retrieving achievement summaries.
"""

from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.api.deps import (
    AchievementRepo,
    CurrentUser,
    LLMProvider,
    TaskRepo,
)
from app.core.exceptions import NotFoundError
from app.models.achievement import Achievement, SkillAnalysis
from app.models.enums import GenerationType
from app.services.achievement_service import (
    generate_achievement,
    check_and_auto_generate,
)

router = APIRouter()


# ===========================================
# Request/Response Models
# ===========================================


class GenerateAchievementRequest(BaseModel):
    """Request to generate an achievement."""

    period_start: datetime = Field(..., description="Period start datetime")
    period_end: datetime = Field(..., description="Period end datetime")
    period_label: Optional[str] = Field(None, description="Human-readable period label")


class AchievementResponse(BaseModel):
    """Achievement response model."""

    id: str
    user_id: str
    period_start: datetime
    period_end: datetime
    period_label: Optional[str]
    summary: str
    growth_points: list[str]
    skill_analysis: SkillAnalysis
    next_suggestions: list[str]
    task_count: int
    project_ids: list[str]
    generation_type: str
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_model(cls, achievement: Achievement) -> "AchievementResponse":
        return cls(
            id=str(achievement.id),
            user_id=achievement.user_id,
            period_start=achievement.period_start,
            period_end=achievement.period_end,
            period_label=achievement.period_label,
            summary=achievement.summary,
            growth_points=achievement.growth_points,
            skill_analysis=achievement.skill_analysis,
            next_suggestions=achievement.next_suggestions,
            task_count=achievement.task_count,
            project_ids=[str(pid) for pid in achievement.project_ids],
            generation_type=achievement.generation_type.value,
            created_at=achievement.created_at,
            updated_at=achievement.updated_at,
        )


class AchievementListResponse(BaseModel):
    """Response for listing achievements."""

    achievements: list[AchievementResponse]
    total: int


# ===========================================
# Endpoints
# ===========================================


@router.post("", response_model=AchievementResponse, status_code=status.HTTP_201_CREATED)
async def create_achievement(
    request: GenerateAchievementRequest,
    user: CurrentUser,
    llm_provider: LLMProvider,
    task_repo: TaskRepo,
    achievement_repo: AchievementRepo,
):
    """
    Generate a new achievement summary for the specified period.

    This endpoint uses AI to analyze completed tasks and generate
    a comprehensive achievement summary including skill analysis.
    """
    # Validate period
    if request.period_end <= request.period_start:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="period_end must be after period_start",
        )

    achievement = await generate_achievement(
        llm_provider=llm_provider,
        task_repo=task_repo,
        achievement_repo=achievement_repo,
        user_id=user.id,
        period_start=request.period_start,
        period_end=request.period_end,
        period_label=request.period_label,
        generation_type=GenerationType.MANUAL,
    )

    return AchievementResponse.from_model(achievement)


@router.get("", response_model=AchievementListResponse)
async def list_achievements(
    user: CurrentUser,
    achievement_repo: AchievementRepo,
    period_start: Optional[datetime] = Query(None, description="Filter by period start"),
    period_end: Optional[datetime] = Query(None, description="Filter by period end"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """
    List achievements for the current user.

    Optionally filter by period range.
    """
    achievements = await achievement_repo.list(
        user_id=user.id,
        period_start=period_start,
        period_end=period_end,
        limit=limit,
        offset=offset,
    )

    return AchievementListResponse(
        achievements=[AchievementResponse.from_model(a) for a in achievements],
        total=len(achievements),
    )


@router.get("/latest", response_model=Optional[AchievementResponse])
async def get_latest_achievement(
    user: CurrentUser,
    achievement_repo: AchievementRepo,
):
    """
    Get the most recent achievement for the current user.

    Returns null if no achievements exist.
    """
    achievement = await achievement_repo.get_latest(user.id)
    if not achievement:
        return None
    return AchievementResponse.from_model(achievement)


@router.get("/{achievement_id}", response_model=AchievementResponse)
async def get_achievement(
    achievement_id: UUID,
    user: CurrentUser,
    achievement_repo: AchievementRepo,
):
    """
    Get a specific achievement by ID.
    """
    achievement = await achievement_repo.get(user.id, achievement_id)
    if not achievement:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Achievement {achievement_id} not found",
        )
    return AchievementResponse.from_model(achievement)


@router.delete("/{achievement_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_achievement(
    achievement_id: UUID,
    user: CurrentUser,
    achievement_repo: AchievementRepo,
):
    """
    Delete an achievement.
    """
    deleted = await achievement_repo.delete(user.id, achievement_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Achievement {achievement_id} not found",
        )


@router.post("/auto-generate", response_model=Optional[AchievementResponse])
async def auto_generate_achievement(
    user: CurrentUser,
    llm_provider: LLMProvider,
    task_repo: TaskRepo,
    achievement_repo: AchievementRepo,
):
    """
    Trigger automatic achievement generation if conditions are met.

    Generates a weekly achievement if:
    - Last achievement was more than 7 days ago (or never)
    - There are new completed tasks since last achievement

    Returns null if conditions are not met.
    """
    achievement = await check_and_auto_generate(
        llm_provider=llm_provider,
        task_repo=task_repo,
        achievement_repo=achievement_repo,
        user_id=user.id,
    )

    if not achievement:
        return None
    return AchievementResponse.from_model(achievement)


@router.get("/preview/completed-tasks")
async def preview_completed_tasks(
    user: CurrentUser,
    task_repo: TaskRepo,
    period_start: datetime = Query(..., description="Period start datetime"),
    period_end: datetime = Query(..., description="Period end datetime"),
):
    """
    Preview completed tasks for a given period.

    Useful for showing what will be included in an achievement
    before generating it.
    """
    if period_end <= period_start:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="period_end must be after period_start",
        )

    tasks = await task_repo.list_completed_in_period(
        user_id=user.id,
        period_start=period_start,
        period_end=period_end,
    )

    return {
        "task_count": len(tasks),
        "tasks": [
            {
                "id": str(task.id),
                "title": task.title,
                "description": task.description,
                "project_id": str(task.project_id) if task.project_id else None,
                "completed_at": task.completed_at or task.updated_at,
                "completion_note": task.completion_note,
            }
            for task in tasks
        ],
    }
