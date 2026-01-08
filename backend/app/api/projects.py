"""
Projects API endpoints.

CRUD operations for projects.
"""

from datetime import date, datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.api.deps import (
    BlockerRepo,
    CheckinRepo,
    CurrentUser,
    LLMProvider,
    ProjectMemberRepo,
    ProjectInvitationRepo,
    ProjectRepo,
    TaskAssignmentRepo,
    TaskRepo,
    UserRepo,
)
from app.core.exceptions import NotFoundError
from app.models.collaboration import (
    Blocker,
    Checkin,
    CheckinCreate,
    ProjectMember,
    ProjectMemberCreate,
    ProjectMemberUpdate,
    ProjectInvitation,
    ProjectInvitationCreate,
    ProjectInvitationUpdate,
    TaskAssignment,
)
from app.models.project import Project, ProjectCreate, ProjectUpdate, ProjectWithTaskCount
from app.models.project_kpi import ProjectKpiTemplate
from app.models.enums import InvitationStatus, ProjectRole
from app.services.kpi_calculator import apply_project_kpis
from app.services.kpi_templates import get_kpi_templates

router = APIRouter()


async def _get_project_or_404(user: CurrentUser, repo: ProjectRepo, project_id: UUID) -> Project:
    project = await repo.get(user.id, project_id)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project {project_id} not found",
        )
    return project


def _compact_text(value: str) -> str:
    return " ".join(value.strip().split())


def _truncate_text(value: str, max_length: int) -> str:
    if len(value) <= max_length:
        return value
    return value[: max_length - 3].rstrip() + "..."


def _normalize_email(value: str) -> str:
    return value.strip().lower()


def _summarize_checkin(llm_provider: LLMProvider, raw_text: str) -> str | None:
    compacted = _compact_text(raw_text)
    if not compacted:
        return None

    settings = getattr(llm_provider, "_settings", None)
    api_key = getattr(settings, "GOOGLE_API_KEY", None)
    if not api_key:
        return _truncate_text(compacted, 280)

    try:
        from google import genai
        from google.genai.types import Content, Part, GenerateContentConfig
    except Exception:
        return _truncate_text(compacted, 280)

    prompt = (
        "Summarize this check-in in 2-3 short sentences. "
        "Keep it concise and action-focused.\n\n"
        f"{compacted}"
    )

    try:
        client = genai.Client(api_key=api_key)
        model_name = llm_provider.get_model()
        response = client.models.generate_content(
            model=model_name,
            contents=[Content(role="user", parts=[Part(text=prompt)])],
            config=GenerateContentConfig(
                temperature=0.2,
                max_output_tokens=200,
            ),
        )
        summary = _compact_text(response.text or "")
        if summary:
            return _truncate_text(summary, 2000)
    except Exception:
        pass

    return _truncate_text(compacted, 280)


@router.get("/kpi-templates", response_model=list[ProjectKpiTemplate])
async def list_kpi_templates(user: CurrentUser):
    """List KPI templates."""
    return get_kpi_templates()


@router.post("", response_model=Project, status_code=status.HTTP_201_CREATED)
async def create_project(
    project: ProjectCreate,
    user: CurrentUser,
    repo: ProjectRepo,
    member_repo: ProjectMemberRepo,
):
    """Create a new project."""
    created_project = await repo.create(user.id, project)

    # Add creator as OWNER member
    await member_repo.create(
        user.id,
        created_project.id,
        ProjectMemberCreate(member_user_id=user.id, role=ProjectRole.OWNER),
    )

    return created_project


@router.get("/{project_id}", response_model=ProjectWithTaskCount)
async def get_project(
    project_id: UUID,
    user: CurrentUser,
    repo: ProjectRepo,
    task_repo: TaskRepo,
):
    """Get a project by ID with task counts."""
    # Use list_with_task_count to get task statistics
    all_projects = await repo.list_with_task_count(user.id)
    project = next((p for p in all_projects if p.id == project_id), None)

    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project {project_id} not found",
        )

    # Apply KPI calculations
    return await apply_project_kpis(user.id, project, task_repo)


@router.get("", response_model=list[ProjectWithTaskCount])
async def list_projects(
    user: CurrentUser,
    repo: ProjectRepo,
    task_repo: TaskRepo,
    status: Optional[str] = Query(None, description="Filter by status"),
):
    """List projects with task counts."""
    projects = await repo.list_with_task_count(user.id, status=status)
    return [await apply_project_kpis(user.id, project, task_repo) for project in projects]


@router.patch("/{project_id}", response_model=Project)
async def update_project(
    project_id: UUID,
    update: ProjectUpdate,
    user: CurrentUser,
    repo: ProjectRepo,
):
    """Update a project."""
    try:
        return await repo.update(user.id, project_id, update)
    except NotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: UUID,
    user: CurrentUser,
    repo: ProjectRepo,
):
    """Delete a project."""
    deleted = await repo.delete(user.id, project_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project {project_id} not found",
        )


@router.get("/{project_id}/members", response_model=list[ProjectMember])
async def list_project_members(
    project_id: UUID,
    user: CurrentUser,
    repo: ProjectRepo,
    member_repo: ProjectMemberRepo,
    user_repo: UserRepo,
):
    """List members for a project."""
    project = await _get_project_or_404(user, repo, project_id)
    members = await member_repo.list(user.id, project_id)
    if project.user_id == user.id and not any(m.member_user_id == user.id for m in members):
        await member_repo.create(
            user.id,
            project_id,
            ProjectMemberCreate(member_user_id=user.id, role=ProjectRole.OWNER),
        )
        members = await member_repo.list(user.id, project_id)
    for member in members:
        try:
            member_uuid = UUID(member.member_user_id)
            user_account = await user_repo.get(member_uuid)
        except Exception:
            user_account = None
        if user_account and user_account.display_name:
            setattr(member, "member_display_name", user_account.display_name)
    return members


@router.post("/{project_id}/members", response_model=ProjectMember, status_code=status.HTTP_201_CREATED)
async def add_project_member(
    project_id: UUID,
    member: ProjectMemberCreate,
    user: CurrentUser,
    repo: ProjectRepo,
    member_repo: ProjectMemberRepo,
):
    """Add a member to a project."""
    await _get_project_or_404(user, repo, project_id)
    return await member_repo.create(user.id, project_id, member)


@router.patch("/{project_id}/members/{member_id}", response_model=ProjectMember)
async def update_project_member(
    project_id: UUID,
    member_id: UUID,
    update: ProjectMemberUpdate,
    user: CurrentUser,
    repo: ProjectRepo,
    member_repo: ProjectMemberRepo,
):
    """Update a project member."""
    await _get_project_or_404(user, repo, project_id)
    existing = await member_repo.get(user.id, member_id)
    if not existing or existing.project_id != project_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project member {member_id} not found",
        )
    return await member_repo.update(user.id, member_id, update)


@router.delete("/{project_id}/members/{member_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project_member(
    project_id: UUID,
    member_id: UUID,
    user: CurrentUser,
    repo: ProjectRepo,
    member_repo: ProjectMemberRepo,
):
    """Remove a member from a project."""
    await _get_project_or_404(user, repo, project_id)
    existing = await member_repo.get(user.id, member_id)
    if not existing or existing.project_id != project_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project member {member_id} not found",
        )
    deleted = await member_repo.delete(user.id, member_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project member {member_id} not found",
        )


@router.get("/{project_id}/invitations", response_model=list[ProjectInvitation])
async def list_project_invitations(
    project_id: UUID,
    user: CurrentUser,
    repo: ProjectRepo,
    invitation_repo: ProjectInvitationRepo,
):
    """List invitations for a project."""
    await _get_project_or_404(user, repo, project_id)
    return await invitation_repo.list_by_project(user.id, project_id)


@router.post("/{project_id}/invitations", response_model=ProjectInvitation, status_code=status.HTTP_201_CREATED)
async def create_project_invitation(
    project_id: UUID,
    invitation: ProjectInvitationCreate,
    user: CurrentUser,
    repo: ProjectRepo,
    invitation_repo: ProjectInvitationRepo,
    member_repo: ProjectMemberRepo,
    user_repo: UserRepo,
):
    """Create a project invitation (or add member if user exists)."""
    await _get_project_or_404(user, repo, project_id)
    normalized_email = _normalize_email(invitation.email)
    pending = await invitation_repo.get_pending_by_email(user.id, project_id, normalized_email)

    existing_user = await user_repo.get_by_email(normalized_email)
    member_user_id = str(existing_user.id) if existing_user else None

    if pending and member_user_id:
        members = await member_repo.list(user.id, project_id)
        if not any(m.member_user_id == member_user_id for m in members):
            await member_repo.create(
                user.id,
                project_id,
                ProjectMemberCreate(member_user_id=member_user_id, role=invitation.role),
            )
        return await invitation_repo.mark_accepted(pending.id, member_user_id)

    if pending:
        return pending

    created = await invitation_repo.create(
        user.id,
        project_id,
        invited_by=user.id,
        data=ProjectInvitationCreate(email=normalized_email, role=invitation.role),
    )

    if member_user_id:
        members = await member_repo.list(user.id, project_id)
        if not any(m.member_user_id == member_user_id for m in members):
            await member_repo.create(
                user.id,
                project_id,
                ProjectMemberCreate(member_user_id=member_user_id, role=invitation.role),
            )
        return await invitation_repo.mark_accepted(created.id, member_user_id)

    return created


@router.patch("/{project_id}/invitations/{invitation_id}", response_model=ProjectInvitation)
async def update_project_invitation(
    project_id: UUID,
    invitation_id: UUID,
    update: ProjectInvitationUpdate,
    user: CurrentUser,
    repo: ProjectRepo,
    invitation_repo: ProjectInvitationRepo,
):
    """Update invitation status."""
    await _get_project_or_404(user, repo, project_id)
    if update.status not in {InvitationStatus.REVOKED, InvitationStatus.EXPIRED}:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Only REVOKED or EXPIRED status updates are allowed",
        )
    return await invitation_repo.update(user.id, invitation_id, update)


@router.post("/invitations/{token}/accept", response_model=ProjectInvitation)
async def accept_project_invitation(
    token: str,
    user: CurrentUser,
    invitation_repo: ProjectInvitationRepo,
    member_repo: ProjectMemberRepo,
    assignment_repo: TaskAssignmentRepo,
):
    """Accept an invitation using a token."""
    invitation = await invitation_repo.get_by_token(token)
    if not invitation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invitation not found",
        )
    if invitation.status != InvitationStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invitation is not pending",
        )
    if invitation.expires_at and invitation.expires_at < datetime.utcnow():
        await invitation_repo.update(
            invitation.user_id,
            invitation.id,
            ProjectInvitationUpdate(status=InvitationStatus.EXPIRED),
        )
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="Invitation expired",
        )
    if not user.email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email is required to accept invitation",
        )
    if _normalize_email(user.email) != _normalize_email(invitation.email):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Email does not match invitation",
        )

    members = await member_repo.list(invitation.user_id, invitation.project_id)
    if not any(m.member_user_id == user.id for m in members):
        await member_repo.create(
            invitation.user_id,
            invitation.project_id,
            ProjectMemberCreate(member_user_id=user.id, role=invitation.role),
        )

    # Convert any tasks assigned to this invitation to the new user
    from app.services.assignee_utils import make_invitation_assignee_id

    invitation_assignee_id = make_invitation_assignee_id(str(invitation.id))
    await assignment_repo.convert_invitation_to_user(
        invitation.user_id,
        invitation_assignee_id,
        user.id,
    )

    return await invitation_repo.mark_accepted(invitation.id, user.id)


@router.get("/{project_id}/assignments", response_model=list[TaskAssignment])
async def list_project_assignments(
    project_id: UUID,
    user: CurrentUser,
    repo: ProjectRepo,
    assignment_repo: TaskAssignmentRepo,
):
    """List task assignments for a project."""
    await _get_project_or_404(user, repo, project_id)
    return await assignment_repo.list_by_project(user.id, project_id)


@router.get("/{project_id}/blockers", response_model=list[Blocker])
async def list_project_blockers(
    project_id: UUID,
    user: CurrentUser,
    repo: ProjectRepo,
    blocker_repo: BlockerRepo,
):
    """List blockers for a project."""
    await _get_project_or_404(user, repo, project_id)
    return await blocker_repo.list_by_project(user.id, project_id)


@router.get("/{project_id}/checkins", response_model=list[Checkin])
async def list_project_checkins(
    project_id: UUID,
    user: CurrentUser,
    repo: ProjectRepo,
    checkin_repo: CheckinRepo,
    member_user_id: Optional[str] = Query(None, description="Filter by member user ID"),
    start_date: Optional[date] = Query(None, description="Start date (inclusive)"),
    end_date: Optional[date] = Query(None, description="End date (inclusive)"),
):
    """List check-ins for a project."""
    await _get_project_or_404(user, repo, project_id)
    return await checkin_repo.list(
        user.id,
        project_id,
        member_user_id=member_user_id,
        start_date=start_date,
        end_date=end_date,
    )


@router.post("/{project_id}/checkins", response_model=Checkin, status_code=status.HTTP_201_CREATED)
async def create_project_checkin(
    project_id: UUID,
    checkin: CheckinCreate,
    user: CurrentUser,
    repo: ProjectRepo,
    checkin_repo: CheckinRepo,
    llm_provider: LLMProvider,
):
    """Create a new check-in for a project."""
    await _get_project_or_404(user, repo, project_id)
    summary_text = _summarize_checkin(llm_provider, checkin.raw_text)
    payload = checkin.model_copy(update={"summary_text": summary_text})
    return await checkin_repo.create(user.id, project_id, payload)
