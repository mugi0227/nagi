"""
Phase API endpoints.

Provides CRUD operations for phases.
"""

from uuid import UUID

from fastapi import APIRouter, HTTPException, status

from app.api.deps import (
    CurrentUser,
    LLMProvider,
    MemoryRepo,
    MilestoneRepo,
    PhaseRepo,
    ProjectRepo,
    TaskRepo,
)
from app.models.phase import Phase, PhaseCreate, PhaseUpdate, PhaseWithTaskCount
from app.models.phase_breakdown import PhaseTaskBreakdownRequest, PhaseTaskBreakdownResponse
from app.models.enums import PhaseStatus
from app.core.exceptions import NotFoundError
from app.services.phase_planner_service import PhasePlannerService

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
    project_repo: ProjectRepo,
) -> Phase:
    """Update a phase."""
    project_id = await repo.get_project_id(phase_id)
    if project_id:
        await _get_project_or_404(user, project_repo, project_id)

    try:
        return await repo.update(user.id, phase_id, phase, project_id=project_id)
    except NotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )


@router.post("/{phase_id}/set-current", response_model=list[Phase])
async def set_current_phase(
    phase_id: UUID,
    user: CurrentUser,
    repo: PhaseRepo,
    project_repo: ProjectRepo,
) -> list[Phase]:
    """
    Set the specified phase as the current phase.

    This will update the status of all phases in the project:
    - The specified phase: ACTIVE
    - Earlier phases (lower order_in_project): COMPLETED
    - Later phases (higher order_in_project): PLANNED
    """
    # Get the target phase
    phase = await repo.get_by_id(user.id, phase_id)
    if not phase:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Phase {phase_id} not found",
        )

    # Verify project access
    project_id = phase.project_id
    await _get_project_or_404(user, project_repo, project_id)

    # Get all phases in the project
    all_phases = await repo.list_by_project(user.id, project_id)

    # Update each phase's status based on its order
    updated_phases = []
    for p in all_phases:
        if p.id == phase_id:
            # Set target phase to ACTIVE
            updated = await repo.update(
                user.id,
                p.id,
                PhaseUpdate(status=PhaseStatus.ACTIVE),
                project_id=project_id
            )
        elif p.order_in_project < phase.order_in_project:
            # Earlier phases -> COMPLETED
            updated = await repo.update(
                user.id,
                p.id,
                PhaseUpdate(status=PhaseStatus.COMPLETED),
                project_id=project_id
            )
        else:
            # Later phases -> PLANNED
            updated = await repo.update(
                user.id,
                p.id,
                PhaseUpdate(status=PhaseStatus.PLANNED),
                project_id=project_id
            )
        updated_phases.append(updated)

    return updated_phases


@router.delete("/{phase_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_phase(
    phase_id: UUID,
    user: CurrentUser,
    repo: PhaseRepo,
    project_repo: ProjectRepo,
) -> None:
    """Delete a phase."""
    project_id = await repo.get_project_id(phase_id)
    if project_id:
        await _get_project_or_404(user, project_repo, project_id)

    deleted = await repo.delete(user.id, phase_id, project_id=project_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Phase {phase_id} not found",
        )


@router.post("/{phase_id}/task-breakdown", response_model=PhaseTaskBreakdownResponse)
async def breakdown_phase_tasks(
    phase_id: UUID,
    request: PhaseTaskBreakdownRequest,
    user: CurrentUser,
    repo: PhaseRepo,
    project_repo: ProjectRepo,
    milestone_repo: MilestoneRepo,
    task_repo: TaskRepo,
    memory_repo: MemoryRepo,
    llm_provider: LLMProvider,
) -> PhaseTaskBreakdownResponse:
    """Generate tasks for a phase using AI."""
    service = PhasePlannerService(
        llm_provider=llm_provider,
        memory_repo=memory_repo,
        project_repo=project_repo,
        phase_repo=repo,
        milestone_repo=milestone_repo,
        task_repo=task_repo,
    )
    return await service.breakdown_phase_tasks(
        user_id=user.id,
        phase_id=phase_id,
        request=request,
    )


async def _get_project_or_404(user: CurrentUser, repo: ProjectRepo, project_id: UUID):
    project = await repo.get(user.id, project_id)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project {project_id} not found",
        )
    return project
