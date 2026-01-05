"""
Phase API endpoints.

Provides CRUD operations for phases.
"""

from uuid import UUID

from fastapi import APIRouter, HTTPException, status

from app.api.deps import CurrentUser, PhaseRepo
from app.models.phase import Phase, PhaseCreate, PhaseUpdate, PhaseWithTaskCount
from app.core.exceptions import NotFoundError

router = APIRouter(prefix="/phases", tags=["phases"])


@router.post("", response_model=Phase, status_code=status.HTTP_201_CREATED)
async def create_phase(
    phase: PhaseCreate,
    user: CurrentUser,
    repo: PhaseRepo,
) -> Phase:
    """Create a new phase."""
    return await repo.create(user.id, phase)


@router.get("/{phase_id}", response_model=Phase)
async def get_phase(
    phase_id: UUID,
    user: CurrentUser,
    repo: PhaseRepo,
) -> Phase:
    """Get a phase by ID."""
    phase = await repo.get_by_id(user.id, phase_id)
    if not phase:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Phase {phase_id} not found",
        )
    return phase


@router.get("/project/{project_id}", response_model=list[PhaseWithTaskCount])
async def list_phases_by_project(
    project_id: UUID,
    user: CurrentUser,
    repo: PhaseRepo,
) -> list[PhaseWithTaskCount]:
    """List all phases for a project with task counts."""
    return await repo.list_by_project(user.id, project_id)


@router.patch("/{phase_id}", response_model=Phase)
async def update_phase(
    phase_id: UUID,
    phase: PhaseUpdate,
    user: CurrentUser,
    repo: PhaseRepo,
) -> Phase:
    """Update a phase."""
    try:
        return await repo.update(user.id, phase_id, phase)
    except NotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )


@router.delete("/{phase_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_phase(
    phase_id: UUID,
    user: CurrentUser,
    repo: PhaseRepo,
) -> None:
    """Delete a phase."""
    deleted = await repo.delete(user.id, phase_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Phase {phase_id} not found",
        )
