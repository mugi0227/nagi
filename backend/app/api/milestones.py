"""
Milestone API endpoints.

Provides CRUD operations for milestones.
"""

from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status

from app.api.deps import CurrentUser, MilestoneRepo
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
    project_id: UUID | None = Query(None, description="Filter milestones by project ID"),
    phase_id: UUID | None = Query(None, description="Filter milestones by phase ID"),
) -> list[Milestone]:
    """List milestones by project or phase."""
    if project_id:
        return await repo.list_by_project(user.id, project_id)
    if phase_id:
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
) -> list[Milestone]:
    """List milestones for a project."""
    return await repo.list_by_project(user.id, project_id)


@router.patch("/{milestone_id}", response_model=Milestone)
async def update_milestone(
    milestone_id: UUID,
    milestone: MilestoneUpdate,
    user: CurrentUser,
    repo: MilestoneRepo,
) -> Milestone:
    """Update a milestone."""
    try:
        return await repo.update(user.id, milestone_id, milestone)
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
):
    """Delete a milestone."""
    deleted = await repo.delete(user.id, milestone_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Milestone {milestone_id} not found",
        )
