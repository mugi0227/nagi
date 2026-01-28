"""
Project Achievements API endpoints.

Endpoints for generating and retrieving project-level achievement summaries.
"""

from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.api.deps import (
    CurrentUser,
    LLMProvider,
    NotificationRepo,
    ProjectAchievementRepo,
    ProjectMemberRepo,
    ProjectRepo,
    TaskRepo,
    UserRepo,
)
from app.api.permissions import require_project_action
from app.core.exceptions import NotFoundError
from app.models.achievement import ProjectAchievement
from app.models.enums import GenerationType
from app.services.project_achievement_service import (
    generate_project_achievement,
    summarize_project_achievement_with_edits,
)
from app.services.project_permissions import ProjectAction

router = APIRouter()


# ===========================================
# Request/Response Models
# ===========================================


class GenerateProjectAchievementRequest(BaseModel):
    """Request to generate a project achievement."""

    period_start: datetime = Field(..., description="Period start datetime")
    period_end: datetime = Field(..., description="Period end datetime")
    period_label: Optional[str] = Field(None, description="Human-readable period label")


class MemberContributionResponse(BaseModel):
    """Member contribution response."""

    user_id: str
    display_name: str
    task_count: int
    main_areas: list[str]
    task_titles: list[str]


class ProjectAchievementResponse(BaseModel):
    """Project achievement response model."""

    id: str
    project_id: str
    period_start: datetime
    period_end: datetime
    period_label: Optional[str]
    summary: str
    team_highlights: list[str]
    challenges: list[str]
    learnings: list[str]
    member_contributions: list[MemberContributionResponse]
    total_task_count: int
    remaining_tasks_count: int
    open_issues: list[str]
    append_note: Optional[str]
    generation_type: str
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_model(cls, achievement: ProjectAchievement) -> "ProjectAchievementResponse":
        return cls(
            id=str(achievement.id),
            project_id=str(achievement.project_id),
            period_start=achievement.period_start,
            period_end=achievement.period_end,
            period_label=achievement.period_label,
            summary=achievement.summary,
            team_highlights=achievement.team_highlights,
            challenges=achievement.challenges,
            learnings=achievement.learnings,
            member_contributions=[
                MemberContributionResponse(
                    user_id=mc.user_id,
                    display_name=mc.display_name,
                    task_count=mc.task_count,
                    main_areas=mc.main_areas,
                    task_titles=mc.task_titles,
                )
                for mc in achievement.member_contributions
            ],
            total_task_count=achievement.total_task_count,
            remaining_tasks_count=achievement.remaining_tasks_count,
            open_issues=achievement.open_issues,
            append_note=achievement.append_note,
            generation_type=achievement.generation_type.value,
            created_at=achievement.created_at,
            updated_at=achievement.updated_at,
        )


class ProjectAchievementUpdateRequest(BaseModel):
    """Request to update a project achievement."""

    summary: Optional[str] = None
    team_highlights: Optional[list[str]] = None
    challenges: Optional[list[str]] = None
    learnings: Optional[list[str]] = None
    open_issues: Optional[list[str]] = None
    append_note: Optional[str] = None


class ProjectAchievementListResponse(BaseModel):
    """Response for listing project achievements."""

    achievements: list[ProjectAchievementResponse]
    total: int


# ===========================================
# Endpoints
# ===========================================


@router.post(
    "/{project_id}/achievements",
    response_model=ProjectAchievementResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_project_achievement(
    project_id: UUID,
    request: GenerateProjectAchievementRequest,
    user: CurrentUser,
    llm_provider: LLMProvider,
    task_repo: TaskRepo,
    project_repo: ProjectRepo,
    project_member_repo: ProjectMemberRepo,
    user_repo: UserRepo,
    project_achievement_repo: ProjectAchievementRepo,
    notification_repo: NotificationRepo,
):
    """
    Generate a new project achievement summary for the specified period.

    User must be a member of the project.
    """
    await require_project_action(
        user,
        project_id,
        project_repo,
        project_member_repo,
        ProjectAction.ACHIEVEMENT_WRITE,
    )

    # Validate period
    if request.period_end <= request.period_start:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="period_end must be after period_start",
        )

    achievement = await generate_project_achievement(
        llm_provider=llm_provider,
        task_repo=task_repo,
        project_repo=project_repo,
        project_member_repo=project_member_repo,
        user_repo=user_repo,
        project_achievement_repo=project_achievement_repo,
        notification_repo=notification_repo,
        project_id=project_id,
        period_start=request.period_start,
        period_end=request.period_end,
        period_label=request.period_label,
        generation_type=GenerationType.MANUAL,
    )

    if not achievement:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No completed tasks found for this period",
        )

    return ProjectAchievementResponse.from_model(achievement)


@router.get("/{project_id}/achievements", response_model=ProjectAchievementListResponse)
async def list_project_achievements(
    project_id: UUID,
    user: CurrentUser,
    project_member_repo: ProjectMemberRepo,
    project_achievement_repo: ProjectAchievementRepo,
    project_repo: ProjectRepo,
    period_start: Optional[datetime] = Query(None, description="Filter by period start"),
    period_end: Optional[datetime] = Query(None, description="Filter by period end"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """
    List project achievements.

    User must be a member of the project.
    """
    await require_project_action(
        user,
        project_id,
        project_repo,
        project_member_repo,
        ProjectAction.ACHIEVEMENT_READ,
    )

    achievements = await project_achievement_repo.list(
        project_id=project_id,
        period_start=period_start,
        period_end=period_end,
        limit=limit,
        offset=offset,
    )

    return ProjectAchievementListResponse(
        achievements=[ProjectAchievementResponse.from_model(a) for a in achievements],
        total=len(achievements),
    )


@router.get("/{project_id}/achievements/latest", response_model=Optional[ProjectAchievementResponse])
async def get_latest_project_achievement(
    project_id: UUID,
    user: CurrentUser,
    project_member_repo: ProjectMemberRepo,
    project_achievement_repo: ProjectAchievementRepo,
    project_repo: ProjectRepo,
):
    """
    Get the most recent project achievement.

    User must be a member of the project.
    """
    await require_project_action(
        user,
        project_id,
        project_repo,
        project_member_repo,
        ProjectAction.ACHIEVEMENT_READ,
    )

    achievement = await project_achievement_repo.get_latest(project_id)
    if not achievement:
        return None
    return ProjectAchievementResponse.from_model(achievement)


@router.get("/{project_id}/achievements/{achievement_id}", response_model=ProjectAchievementResponse)
async def get_project_achievement(
    project_id: UUID,
    achievement_id: UUID,
    user: CurrentUser,
    project_member_repo: ProjectMemberRepo,
    project_achievement_repo: ProjectAchievementRepo,
    project_repo: ProjectRepo,
):
    """
    Get a specific project achievement by ID.

    User must be a member of the project.
    """
    await require_project_action(
        user,
        project_id,
        project_repo,
        project_member_repo,
        ProjectAction.ACHIEVEMENT_READ,
    )

    achievement = await project_achievement_repo.get(project_id, achievement_id)
    if not achievement:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Achievement {achievement_id} not found",
        )
    return ProjectAchievementResponse.from_model(achievement)


@router.delete("/{project_id}/achievements/{achievement_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project_achievement(
    project_id: UUID,
    achievement_id: UUID,
    user: CurrentUser,
    project_member_repo: ProjectMemberRepo,
    project_achievement_repo: ProjectAchievementRepo,
    project_repo: ProjectRepo,
):
    """
    Delete a project achievement.

    User must be a member of the project.
    """
    await require_project_action(
        user,
        project_id,
        project_repo,
        project_member_repo,
        ProjectAction.ACHIEVEMENT_WRITE,
    )

    deleted = await project_achievement_repo.delete(project_id, achievement_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Achievement {achievement_id} not found",
        )


@router.patch(
    "/{project_id}/achievements/{achievement_id}",
    response_model=ProjectAchievementResponse,
)
async def update_project_achievement(
    project_id: UUID,
    achievement_id: UUID,
    request: ProjectAchievementUpdateRequest,
    user: CurrentUser,
    project_member_repo: ProjectMemberRepo,
    project_achievement_repo: ProjectAchievementRepo,
    project_repo: ProjectRepo,
):
    """
    Update a project achievement (partial update).

    User must be a member of the project.
    """
    await require_project_action(
        user,
        project_id,
        project_repo,
        project_member_repo,
        ProjectAction.ACHIEVEMENT_WRITE,
    )

    try:
        achievement = await project_achievement_repo.update(
            project_id=project_id,
            achievement_id=achievement_id,
            summary=request.summary,
            team_highlights=request.team_highlights,
            challenges=request.challenges,
            learnings=request.learnings,
            open_issues=request.open_issues,
            append_note=request.append_note,
        )
    except NotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

    return ProjectAchievementResponse.from_model(achievement)


@router.post(
    "/{project_id}/achievements/{achievement_id}/ai-summary",
    response_model=ProjectAchievementResponse,
)
async def summarize_project_achievement(
    project_id: UUID,
    achievement_id: UUID,
    user: CurrentUser,
    llm_provider: LLMProvider,
    project_member_repo: ProjectMemberRepo,
    project_achievement_repo: ProjectAchievementRepo,
    project_repo: ProjectRepo,
):
    """
    Summarize a project achievement using current edits.

    User must be a member of the project.
    """
    await require_project_action(
        user,
        project_id,
        project_repo,
        project_member_repo,
        ProjectAction.ACHIEVEMENT_WRITE,
    )

    achievement = await project_achievement_repo.get(project_id, achievement_id)
    if not achievement:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Achievement {achievement_id} not found",
        )

    updated = await summarize_project_achievement_with_edits(
        llm_provider=llm_provider,
        project_achievement_repo=project_achievement_repo,
        achievement=achievement,
    )

    return ProjectAchievementResponse.from_model(updated)
