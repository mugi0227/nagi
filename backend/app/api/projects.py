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
    MilestoneRepo,
    ProjectMemberRepo,
    ProjectInvitationRepo,
    ProjectRepo,
    PhaseRepo,
    TaskAssignmentRepo,
    TaskRepo,
    MemoryRepo,
    UserRepo,
)
from app.core.config import get_settings
from app.core.exceptions import NotFoundError
from app.utils.datetime_utils import ensure_utc, now_utc
from app.models.collaboration import (
    Blocker,
    Checkin,
    CheckinAgendaItems,
    CheckinCreate,
    CheckinCreateV2,
    CheckinSummaryRequest,
    CheckinSummarySave,
    CheckinSummary,
    CheckinUpdateV2,
    CheckinV2,
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
from app.models.enums import CheckinType, InvitationStatus, MemoryScope, MemoryType, ProjectRole
from app.models.memory import Memory, MemoryCreate
from app.services.kpi_calculator import apply_project_kpis
from app.services.kpi_templates import get_kpi_templates
from app.services.llm_utils import generate_text, generate_text_with_status

router = APIRouter()


async def _get_project_or_404(user: CurrentUser, repo: ProjectRepo, project_id: UUID) -> Project:
    project = await repo.get(user.id, project_id)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project {project_id} not found",
        )
    return project


async def _get_project_owner_id(
    user: CurrentUser,
    repo: ProjectRepo,
    project_id: UUID,
) -> str:
    """
    Get the project owner's user_id after verifying the current user has access.
    
    This function checks if the user is either:
    - The project owner
    - A member of the project
    
    Returns the owner's user_id, which should be used for repository queries.
    Raises 404 if the user doesn't have access to the project.
    """
    project = await repo.get(user.id, project_id)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project {project_id} not found",
        )
    # project.user_id is the owner's ID
    return project.user_id


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

    prompt = (
        "Summarize this check-in in 2-3 short sentences. "
        "Keep it concise and action-focused.\n\n"
        f"{compacted}"
    )
    summary_text = generate_text(
        llm_provider,
        prompt,
        temperature=0.2,
        max_output_tokens=200,
    )
    summary = _compact_text(summary_text or "")
    if summary:
        return _truncate_text(summary, 2000)
    return _truncate_text(compacted, 280)


def _format_checkin_for_summary(checkin: Checkin, max_length: int = 500) -> str:
    text = _compact_text(checkin.raw_text)
    if not text:
        text = "(empty)"
    text = _truncate_text(text, max_length)
    checkin_type = getattr(checkin.checkin_type, "value", checkin.checkin_type)
    return f"- {checkin.checkin_date.isoformat()} {checkin.member_user_id} ({checkin_type}): {text}"


def _format_checkin_fallback(checkin: Checkin, max_length: int = 200) -> str:
    text = _truncate_text(_compact_text(checkin.raw_text), max_length)
    return f"- {checkin.checkin_date.isoformat()} {checkin.member_user_id}: {text}"


def _fallback_checkin_summary(
    checkins: list[Checkin],
    start_date: Optional[date],
    end_date: Optional[date],
) -> str:
    period_label = f"{start_date or '...'} to {end_date or '...'}"
    lines = [f"Check-ins ({period_label})", ""]
    for checkin in checkins[:20]:
        text = _truncate_text(_compact_text(checkin.raw_text), 200)
        lines.append(f"- {checkin.checkin_date.isoformat()} {checkin.member_user_id}: {text}")
    remaining = len(checkins) - min(len(checkins), 20)
    if remaining > 0:
        lines.append(f"- ...and {remaining} more")
    return "\n".join(lines).strip()


def _looks_like_summary(value: str) -> bool:
    cleaned = value.strip()
    if not cleaned:
        return False
    if any(marker in cleaned for marker in ("- ", "•", "・", "* ")):
        return True
    if "\n" in cleaned:
        return True
    return len(cleaned) >= 80


def _summarize_checkins(
    llm_provider: LLMProvider,
    checkins: list[Checkin],
    start_date: Optional[date],
    end_date: Optional[date],
    weekly_context: Optional[str] = None,
) -> tuple[str, Optional[str], Optional[str], Optional[str], Optional[str]]:
    if not checkins:
        return "", None, None, None, None

    period_label = f"{start_date or '...'} to {end_date or '...'}"
    prompt_lines = [
        "You are summarizing project check-ins for a recurring meeting.",
        "Summarize in 5-10 bullet points with clear, actionable phrasing.",
        "Focus on progress, blockers, decisions, risks, and next actions.",
        "Write in the same language as the check-ins.",
        "If you cannot summarize, list the check-ins as bullet points.",
        f"Period: {period_label}",
        f"Total check-ins: {len(checkins)}",
        "",
        "Check-ins:",
    ]
    checkin_lines = [_format_checkin_for_summary(checkin) for checkin in checkins]
    prompt_lines.extend(checkin_lines)
    if weekly_context:
        prompt_lines.extend(["", "Weekly snapshot:", _truncate_text(weekly_context, 1500)])
    prompt = "\n".join(prompt_lines)
    summary, error_code, error_detail = generate_text_with_status(
        llm_provider,
        prompt,
        temperature=0.2,
        max_output_tokens=6000,
    )
    debug_prompt = _truncate_text(prompt, 800)
    debug_output = _truncate_text(summary, 800) if summary else None
    if summary and _looks_like_summary(summary):
        return _truncate_text(summary, 5000), None, None, debug_prompt, debug_output

    retriable_errors = {"genai_empty_response", "litellm_empty_response"}
    if not error_code or error_code in retriable_errors:
        fallback_lines = [_format_checkin_fallback(checkin) for checkin in checkins]
        strict_prompt_lines = [
            "Task: Summarize the check-ins below.",
            "Output rules:",
            "- Output ONLY bullet points (5-10 lines).",
            "- Each line must start with '- ' and be at least 12 characters.",
            "- Mention concrete content from the check-ins.",
            "- Do not include introductions or the period line.",
            "- Use the same language as the check-ins.",
            "",
            "If you cannot follow the rules, output the Fallback list exactly as provided.",
            "",
            "Check-ins:",
            *checkin_lines,
            "",
            "Weekly snapshot:",
            _truncate_text(weekly_context or "", 1500) or "(none)",
            "",
            "Fallback list:",
            *fallback_lines,
        ]
        strict_prompt = "\n".join(strict_prompt_lines)
        summary, error_code, error_detail = generate_text_with_status(
            llm_provider,
            strict_prompt,
            temperature=0.2,
            max_output_tokens=6000,
        )
        debug_prompt = _truncate_text(strict_prompt, 800)
        debug_output = _truncate_text(summary, 800) if summary else None
        if summary and _looks_like_summary(summary):
            return _truncate_text(summary, 5000), None, None, debug_prompt, debug_output

    if not error_code:
        error_code = "llm_response_unusable"
    return _fallback_checkin_summary(checkins, start_date, end_date), error_code, error_detail, debug_prompt, debug_output


def _build_checkin_summary_response(
    project_id: UUID,
    checkins: list[Checkin],
    start_date: Optional[date],
    end_date: Optional[date],
    weekly_context: Optional[str],
    llm_provider: LLMProvider,
) -> CheckinSummary:
    if not checkins:
        return CheckinSummary(
            project_id=project_id,
            start_date=start_date,
            end_date=end_date,
            checkin_count=0,
            summary_text=None,
            summary_error=None,
            summary_error_detail=None,
            summary_debug_prompt=None,
            summary_debug_output=None,
        )

    summary_text, summary_error, summary_error_detail, debug_prompt, debug_output = _summarize_checkins(
        llm_provider,
        checkins[:50],
        start_date,
        end_date,
        weekly_context=weekly_context,
    )
    summary_text = summary_text.strip() or None
    settings = get_settings()
    return CheckinSummary(
        project_id=project_id,
        start_date=start_date,
        end_date=end_date,
        checkin_count=len(checkins),
        summary_text=summary_text,
        summary_error=summary_error,
        summary_error_detail=summary_error_detail,
        summary_debug_prompt=debug_prompt if settings.DEBUG else None,
        summary_debug_output=debug_output if settings.DEBUG else None,
    )


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
    project = await _get_project_or_404(user, repo, project_id)
    owner_id = project.user_id
    try:
        return await repo.update(owner_id, project_id, update)
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
    member_repo: ProjectMemberRepo,
):
    """Delete a project. Only OWNER or ADMIN can delete."""
    project = await _get_project_or_404(user, repo, project_id)
    owner_id = project.user_id

    # Check if user has OWNER or ADMIN role
    members = await member_repo.list(owner_id, project_id)
    user_member = next((m for m in members if m.member_user_id == user.id), None)

    if not user_member or user_member.role not in (ProjectRole.OWNER, ProjectRole.ADMIN):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only project owner or admin can delete the project",
        )

    deleted = await repo.delete(owner_id, project_id)
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
    owner_id = project.user_id  # Use owner's user_id for queries
    
    members = await member_repo.list(owner_id, project_id)
    if owner_id == user.id and not any(m.member_user_id == user.id for m in members):
        await member_repo.create(
            owner_id,
            project_id,
            ProjectMemberCreate(member_user_id=user.id, role=ProjectRole.OWNER),
        )
        members = await member_repo.list(owner_id, project_id)
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
    user_repo: UserRepo,
):
    """Add a member to a project."""
    project = await _get_project_or_404(user, repo, project_id)
    owner_id = project.user_id

    # Validate that the member user exists
    try:
        member_uuid = UUID(member.member_user_id)
        existing_user = await user_repo.get(member_uuid)
    except ValueError:
        existing_user = None

    if not existing_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User {member.member_user_id} not found",
        )

    return await member_repo.create(owner_id, project_id, member)


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
    project = await _get_project_or_404(user, repo, project_id)
    owner_id = project.user_id
    existing = await member_repo.get(owner_id, member_id)
    if not existing or existing.project_id != project_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project member {member_id} not found",
        )
    return await member_repo.update(owner_id, member_id, update)


@router.delete("/{project_id}/members/{member_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project_member(
    project_id: UUID,
    member_id: UUID,
    user: CurrentUser,
    repo: ProjectRepo,
    member_repo: ProjectMemberRepo,
):
    """Remove a member from a project."""
    project = await _get_project_or_404(user, repo, project_id)
    owner_id = project.user_id
    existing = await member_repo.get(owner_id, member_id)
    if not existing or existing.project_id != project_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project member {member_id} not found",
        )
    deleted = await member_repo.delete(owner_id, member_id)
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
    project = await _get_project_or_404(user, repo, project_id)
    owner_id = project.user_id
    return await invitation_repo.list_by_project(owner_id, project_id)


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
    project = await _get_project_or_404(user, repo, project_id)
    normalized_email = _normalize_email(invitation.email)
    existing_invitation = await invitation_repo.get_by_email(project_id, normalized_email)

    existing_user = await user_repo.get_by_email(normalized_email)
    member_user_id = str(existing_user.id) if existing_user else None

    # Handle existing invitation based on status
    if existing_invitation:
        if existing_invitation.status == InvitationStatus.ACCEPTED:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"An invitation for {normalized_email} has already been accepted",
            )
        elif existing_invitation.status == InvitationStatus.PENDING:
            # If user exists, auto-accept the pending invitation
            if member_user_id:
                members = await member_repo.list(project.user_id, project_id)
                if not any(m.member_user_id == member_user_id for m in members):
                    await member_repo.create(
                        project.user_id,
                        project_id,
                        ProjectMemberCreate(member_user_id=member_user_id, role=invitation.role),
                    )
                return await invitation_repo.mark_accepted(existing_invitation.id, member_user_id)
            return existing_invitation
        else:
            # EXPIRED or REVOKED: reinvite
            reinvited = await invitation_repo.reinvite(existing_invitation.id, user.id)
            if member_user_id:
                members = await member_repo.list(project.user_id, project_id)
                if not any(m.member_user_id == member_user_id for m in members):
                    await member_repo.create(
                        project.user_id,
                        project_id,
                        ProjectMemberCreate(member_user_id=member_user_id, role=invitation.role),
                    )
                return await invitation_repo.mark_accepted(reinvited.id, member_user_id)
            return reinvited

    # No existing invitation: create new one
    created = await invitation_repo.create(
        project.user_id,
        project_id,
        invited_by=user.id,
        data=ProjectInvitationCreate(email=normalized_email, role=invitation.role),
    )

    if member_user_id:
        members = await member_repo.list(project.user_id, project_id)
        if not any(m.member_user_id == member_user_id for m in members):
            await member_repo.create(
                project.user_id,
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
    project = await _get_project_or_404(user, repo, project_id)
    owner_id = project.user_id
    if update.status not in {InvitationStatus.REVOKED, InvitationStatus.EXPIRED}:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Only REVOKED or EXPIRED status updates are allowed",
        )
    return await invitation_repo.update(owner_id, invitation_id, update)


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
    expires_at = ensure_utc(invitation.expires_at)
    if expires_at and expires_at < now_utc():
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
    project = await _get_project_or_404(user, repo, project_id)
    owner_id = project.user_id
    return await assignment_repo.list_by_project(owner_id, project_id)


@router.get("/{project_id}/blockers", response_model=list[Blocker])
async def list_project_blockers(
    project_id: UUID,
    user: CurrentUser,
    repo: ProjectRepo,
    blocker_repo: BlockerRepo,
):
    """List blockers for a project."""
    project = await _get_project_or_404(user, repo, project_id)
    owner_id = project.user_id
    return await blocker_repo.list_by_project(owner_id, project_id)


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
    project = await _get_project_or_404(user, repo, project_id)
    owner_id = project.user_id
    return await checkin_repo.list(
        owner_id,
        project_id,
        member_user_id=member_user_id,
        start_date=start_date,
        end_date=end_date,
    )


@router.get("/{project_id}/checkins/summary", response_model=CheckinSummary)
async def summarize_project_checkins(
    project_id: UUID,
    user: CurrentUser,
    repo: ProjectRepo,
    checkin_repo: CheckinRepo,
    llm_provider: LLMProvider,
    member_user_id: Optional[str] = Query(None, description="Filter by member user ID"),
    start_date: Optional[date] = Query(None, description="Start date (inclusive)"),
    end_date: Optional[date] = Query(None, description="End date (inclusive)"),
    checkin_type: Optional[CheckinType] = Query(None, description="Filter by check-in type"),
):
    """Summarize check-ins for a project within a date range."""
    project = await _get_project_or_404(user, repo, project_id)
    owner_id = project.user_id
    checkins = await checkin_repo.list(
        owner_id,
        project_id,
        member_user_id=member_user_id,
        start_date=start_date,
        end_date=end_date,
    )
    if checkin_type is not None:
        checkins = [checkin for checkin in checkins if checkin.checkin_type == checkin_type]
    return _build_checkin_summary_response(
        project_id=project_id,
        checkins=checkins,
        start_date=start_date,
        end_date=end_date,
        weekly_context=None,
        llm_provider=llm_provider,
    )


@router.post("/{project_id}/checkins/summary", response_model=CheckinSummary)
async def summarize_project_checkins_post(
    project_id: UUID,
    payload: CheckinSummaryRequest,
    user: CurrentUser,
    repo: ProjectRepo,
    checkin_repo: CheckinRepo,
    llm_provider: LLMProvider,
):
    """Summarize check-ins with optional weekly context."""
    project = await _get_project_or_404(user, repo, project_id)
    owner_id = project.user_id
    checkins = await checkin_repo.list(
        owner_id,
        project_id,
        member_user_id=payload.member_user_id,
        start_date=payload.start_date,
        end_date=payload.end_date,
    )
    if payload.checkin_type is not None:
        checkins = [checkin for checkin in checkins if checkin.checkin_type == payload.checkin_type]
    return _build_checkin_summary_response(
        project_id=project_id,
        checkins=checkins,
        start_date=payload.start_date,
        end_date=payload.end_date,
        weekly_context=payload.weekly_context,
        llm_provider=llm_provider,
    )


@router.post("/{project_id}/checkins/summary/save", response_model=Memory)
async def save_project_checkin_summary(
    project_id: UUID,
    payload: CheckinSummarySave,
    user: CurrentUser,
    repo: ProjectRepo,
    memory_repo: MemoryRepo,
):
    """Save a check-in summary as project memory."""
    await _get_project_or_404(user, repo, project_id)
    tags = [
        "checkin_summary",
        f"count:{payload.checkin_count}",
    ]
    if payload.start_date or payload.end_date:
        tags.append(f"range:{payload.start_date or '...'}..{payload.end_date or '...'}")
    memory = await memory_repo.create(
        user.id,
        MemoryCreate(
            content=payload.summary_text,
            scope=MemoryScope.PROJECT,
            memory_type=MemoryType.FACT,
            project_id=project_id,
            tags=tags,
            source="agent",
        ),
    )
    return memory


@router.post("/{project_id}/checkins", response_model=Checkin, status_code=status.HTTP_201_CREATED)
async def create_project_checkin(
    project_id: UUID,
    checkin: CheckinCreate,
    user: CurrentUser,
    repo: ProjectRepo,
    checkin_repo: CheckinRepo,
):
    """Create a new check-in for a project."""
    project = await _get_project_or_404(user, repo, project_id)
    owner_id = project.user_id
    return await checkin_repo.create(owner_id, project_id, checkin)


# =============================================================================
# V2 Check-in Endpoints (Structured, ADHD-friendly)
# =============================================================================


@router.post(
    "/{project_id}/checkins/v2",
    response_model=CheckinV2,
    status_code=status.HTTP_201_CREATED,
)
async def create_project_checkin_v2(
    project_id: UUID,
    checkin: CheckinCreateV2,
    user: CurrentUser,
    repo: ProjectRepo,
    checkin_repo: CheckinRepo,
):
    """Create a structured check-in (V2)."""
    project = await _get_project_or_404(user, repo, project_id)
    owner_id = project.user_id
    return await checkin_repo.create_v2(owner_id, project_id, checkin)


@router.get("/{project_id}/checkins/v2", response_model=list[CheckinV2])
async def list_project_checkins_v2(
    project_id: UUID,
    user: CurrentUser,
    repo: ProjectRepo,
    checkin_repo: CheckinRepo,
    member_user_id: Optional[str] = Query(None),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
):
    """List structured check-ins (V2)."""
    project = await _get_project_or_404(user, repo, project_id)
    owner_id = project.user_id
    return await checkin_repo.list_v2(
        owner_id,
        project_id,
        member_user_id=member_user_id,
        start_date=start_date,
        end_date=end_date,
    )


@router.patch("/{project_id}/checkins/v2/{checkin_id}", response_model=CheckinV2)
async def update_project_checkin_v2(
    project_id: UUID,
    checkin_id: UUID,
    checkin_update: CheckinUpdateV2,
    user: CurrentUser,
    repo: ProjectRepo,
    checkin_repo: CheckinRepo,
):
    """Update a structured check-in (V2). Only the creator can update."""
    await _get_project_or_404(user, repo, project_id)

    # Get existing checkin to verify ownership
    existing = await checkin_repo.get_v2(checkin_id)
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Check-in {checkin_id} not found",
        )
    if existing.project_id != project_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Check-in {checkin_id} not found in project {project_id}",
        )
    if existing.user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only update your own check-ins",
        )

    result = await checkin_repo.update_v2(checkin_id, checkin_update)
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Check-in {checkin_id} not found",
        )
    return result


@router.delete("/{project_id}/checkins/v2/{checkin_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project_checkin_v2(
    project_id: UUID,
    checkin_id: UUID,
    user: CurrentUser,
    repo: ProjectRepo,
    checkin_repo: CheckinRepo,
):
    """Delete a structured check-in (V2). Only the creator can delete."""
    await _get_project_or_404(user, repo, project_id)

    # Get existing checkin to verify ownership
    existing = await checkin_repo.get_v2(checkin_id)
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Check-in {checkin_id} not found",
        )
    if existing.project_id != project_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Check-in {checkin_id} not found in project {project_id}",
        )
    if existing.user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only delete your own check-ins",
        )

    deleted = await checkin_repo.delete_v2(checkin_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Check-in {checkin_id} not found",
        )


@router.get("/{project_id}/checkins/agenda-items", response_model=CheckinAgendaItems)
async def get_project_checkin_agenda_items(
    project_id: UUID,
    user: CurrentUser,
    repo: ProjectRepo,
    checkin_repo: CheckinRepo,
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
):
    """Get check-in items grouped by category for meeting agenda generation."""
    project = await _get_project_or_404(user, repo, project_id)
    owner_id = project.user_id
    return await checkin_repo.get_agenda_items(
        owner_id,
        project_id,
        start_date=start_date,
        end_date=end_date,
    )


