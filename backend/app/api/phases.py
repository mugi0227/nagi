"""
Phase API endpoints.

Provides CRUD operations for phases.
"""

from uuid import UUID

from fastapi import APIRouter, HTTPException, status

from app.api.deps import CurrentUser, PhaseRepo, ProjectMemberRepo, ProjectRepo
from app.api.permissions import require_project_action, require_project_member
from app.core.exceptions import NotFoundError
from app.models.enums import PhaseStatus
from app.models.phase import Phase, PhaseCreate, PhaseUpdate, PhaseWithTaskCount
from app.services.project_permissions import ProjectAction

router = APIRouter(prefix="/phases", tags=["phases"])


@router.post("", response_model=Phase, status_code=status.HTTP_201_CREATED)
async def create_phase(
    phase: PhaseCreate,
    user: CurrentUser,
    repo: PhaseRepo,
    project_repo: ProjectRepo,
    member_repo: ProjectMemberRepo,
) -> Phase:
    """Create a new phase."""
    await require_project_action(
        user,
        phase.project_id,
        project_repo,
        member_repo,
        ProjectAction.PHASE_MANAGE,
    )
    return await repo.create(user.id, phase)


@router.get("/{phase_id}", response_model=Phase)
async def get_phase(
    phase_id: UUID,
    user: CurrentUser,
    repo: PhaseRepo,
    project_repo: ProjectRepo,
    member_repo: ProjectMemberRepo,
) -> Phase:
    """Get a phase by ID."""
    project_id = await repo.get_project_id(phase_id)
    if not project_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Phase {phase_id} not found",
        )
    access = await require_project_member(user, project_id, project_repo, member_repo)
    phase = await repo.get_by_id(access.owner_id, phase_id, project_id=project_id)
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
    project_repo: ProjectRepo,
    member_repo: ProjectMemberRepo,
) -> list[PhaseWithTaskCount]:
    """List all phases for a project with task counts."""
    access = await require_project_action(
        user,
        project_id,
        project_repo,
        member_repo,
        ProjectAction.PHASE_MANAGE,
    )
    owner_id = access.owner_id
    return await repo.list_by_project(owner_id, project_id)


@router.patch("/{phase_id}", response_model=Phase)
async def update_phase(
    phase_id: UUID,
    phase: PhaseUpdate,
    user: CurrentUser,
    repo: PhaseRepo,
    project_repo: ProjectRepo,
    member_repo: ProjectMemberRepo,
) -> Phase:
    """Update a phase."""
    project_id = await repo.get_project_id(phase_id)
    owner_id = user.id
    if project_id:
        access = await require_project_action(
            user,
            project_id,
            project_repo,
            member_repo,
            ProjectAction.PHASE_MANAGE,
        )
        owner_id = access.owner_id

    try:
        return await repo.update(owner_id, phase_id, phase, project_id=project_id)
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
    member_repo: ProjectMemberRepo,
) -> list[Phase]:
    """
    Set the specified phase as the current phase.

    This will update the status of all phases in the project:
    - The specified phase: ACTIVE
    - Earlier phases (lower order_in_project): COMPLETED
    - Later phases (higher order_in_project): PLANNED
    """
    # Get the target phase (try with user.id first for personal access)
    project_id = await repo.get_project_id(phase_id)
    if not project_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Phase {phase_id} not found",
        )
    access = await require_project_action(
        user,
        project_id,
        project_repo,
        member_repo,
        ProjectAction.PHASE_MANAGE,
    )
    phase = await repo.get_by_id(access.owner_id, phase_id, project_id=project_id)
    if not phase:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Phase {phase_id} not found",
        )

    owner_id = access.owner_id

    # Get all phases in the project
    all_phases = await repo.list_by_project(owner_id, project_id)

    # Update each phase's status based on its order
    updated_phases = []
    for p in all_phases:
        if p.id == phase_id:
            # Set target phase to ACTIVE
            updated = await repo.update(
                owner_id,
                p.id,
                PhaseUpdate(status=PhaseStatus.ACTIVE),
                project_id=project_id
            )
        elif p.order_in_project < phase.order_in_project:
            # Earlier phases -> COMPLETED
            updated = await repo.update(
                owner_id,
                p.id,
                PhaseUpdate(status=PhaseStatus.COMPLETED),
                project_id=project_id
            )
        else:
            # Later phases -> PLANNED
            updated = await repo.update(
                owner_id,
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
    member_repo: ProjectMemberRepo,
) -> None:
    """Delete a phase."""
    project_id = await repo.get_project_id(phase_id)
    owner_id = user.id
    if project_id:
        access = await require_project_action(
            user,
            project_id,
            project_repo,
            member_repo,
            ProjectAction.PHASE_MANAGE,
        )
        owner_id = access.owner_id

    deleted = await repo.delete(owner_id, phase_id, project_id=project_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Phase {phase_id} not found",
        )

