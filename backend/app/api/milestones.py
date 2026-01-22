"""
Milestone API endpoints.

Provides CRUD operations for milestones.
"""

from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status, Depends

from app.api.deps import CurrentUser, MilestoneRepo, ProjectRepo
from app.api.deps import get_project_repository
from app.core.exceptions import NotFoundError
from app.models.milestone import Milestone, MilestoneCreate, MilestoneUpdate

router = APIRouter(prefix="/milestones", tags=["milestones"])


@router.post("", response_model=Milestone, status_code=status.HTTP_201_CREATED)
async def create_milestone(
    milestone: MilestoneCreate,
    user: CurrentUser,
    repo: MilestoneRepo,
) -> Milestone:
    """Create a new milestone."""
    return await repo.create(user.id, milestone)


@router.get("", response_model=list[Milestone])
async def list_milestones(
    user: CurrentUser,
    repo: MilestoneRepo,
    project_repo: ProjectRepo,
    project_id: UUID | None = Query(None, description="Filter milestones by project ID"),
    phase_id: UUID | None = Query(None, description="Filter milestones by phase ID"),
) -> list[Milestone]:
    """List milestones by project or phase."""
    if project_id:
        project = await _get_project_or_404(user, project_repo, project_id)
        owner_id = project.user_id
        return await repo.list_by_project(owner_id, project_id)
    if phase_id:
        # Note: For phase_id queries, we use user.id as fallback
        # since getting project context from phase requires additional lookup
        return await repo.list_by_phase(user.id, phase_id)
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="project_id or phase_id query parameter is required",
    )


@router.get("/{milestone_id}", response_model=Milestone)
async def get_milestone(
    milestone_id: UUID,
    user: CurrentUser,
    repo: MilestoneRepo,
) -> Milestone:
    """Get a milestone by ID."""
    milestone = await repo.get_by_id(user.id, milestone_id)
    if not milestone:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Milestone {milestone_id} not found",
        )
    return milestone


@router.get("/phase/{phase_id}", response_model=list[Milestone])
async def list_milestones_by_phase(
    phase_id: UUID,
    user: CurrentUser,
    repo: MilestoneRepo,
) -> list[Milestone]:
    """List milestones for a phase."""
    return await repo.list_by_phase(user.id, phase_id)


@router.get("/project/{project_id}", response_model=list[Milestone])
async def list_milestones_by_project(
    project_id: UUID,
    user: CurrentUser,
    repo: MilestoneRepo,
    project_repo: ProjectRepo,
) -> list[Milestone]:
    """List milestones for a project."""
    project = await _get_project_or_404(user, project_repo, project_id)
    owner_id = project.user_id
    return await repo.list_by_project(owner_id, project_id)


@router.patch("/{milestone_id}", response_model=Milestone)
async def update_milestone(
    milestone_id: UUID,
    milestone: MilestoneUpdate,
    user: CurrentUser,
    repo: MilestoneRepo,
    project_repo: ProjectRepo,
) -> Milestone:
    """Update a milestone."""
    project_id = await repo.get_project_id(milestone_id)
    owner_id = user.id
    if project_id:
        project = await _get_project_or_404(user, project_repo, project_id)
        owner_id = project.user_id

    try:
        return await repo.update(owner_id, milestone_id, project_id, milestone)
    except NotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.delete("/{milestone_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_milestone(
    milestone_id: UUID,
    user: CurrentUser,
    repo: MilestoneRepo,
    project_repo: ProjectRepo,
):
    """Delete a milestone."""
    project_id = await repo.get_project_id(milestone_id)
    owner_id = user.id
    if project_id:
        project = await _get_project_or_404(user, project_repo, project_id)
        owner_id = project.user_id

    deleted = await repo.delete(owner_id, milestone_id, project_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Milestone {milestone_id} not found",
        )


async def _get_project_or_404(user: CurrentUser, repo: ProjectRepo, project_id: UUID):
    project = await repo.get(user.id, project_id)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project {project_id} not found",
        )
    return project
