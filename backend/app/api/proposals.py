"""Proposal API endpoints for AI-suggested actions."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import (
    CurrentUser,
    ProposalRepo,
    TaskRepo,
    TaskAssignmentRepo,
    ProjectRepo,
    PhaseRepo,
    MilestoneRepo,
    ProjectMemberRepo,
    ProjectInvitationRepo,
    MemoryRepo,
    AgentTaskRepo,
    MeetingAgendaRepo,
    RecurringMeetingRepo,
    LLMProvider,
)
from app.models.proposal import ApprovalResult, ProposalStatus, RejectionResult
from app.tools.project_tools import CreateProjectInput
from app.tools.task_tools import CreateTaskInput, AssignTaskInput, assign_task
from app.tools.memory_tools import CreateSkillInput
from app.tools.phase_tools import apply_phase_plan
from app.models.memory import MemoryCreate

router = APIRouter()


def _proposal_user_uuid(user_id: str) -> UUID:
    try:
        return UUID(user_id)
    except (ValueError, TypeError, AttributeError):
        import hashlib

        return UUID(bytes=hashlib.md5(user_id.encode()).digest())


def _proposal_belongs_to_user(proposal, user_id: str) -> bool:
    if getattr(proposal, "user_id_raw", None) == user_id:
        return True
    try:
        return proposal.user_id == _proposal_user_uuid(user_id)
    except Exception:
        return False


@router.post("/{proposal_id}/approve")
async def approve_proposal(
    proposal_id: UUID,
    user: CurrentUser,
    proposal_repo: ProposalRepo,
    task_repo: TaskRepo,
    assignment_repo: TaskAssignmentRepo,
    project_repo: ProjectRepo,
    phase_repo: PhaseRepo,
    milestone_repo: MilestoneRepo,
    member_repo: ProjectMemberRepo,
    invitation_repo: ProjectInvitationRepo,
    memory_repo: MemoryRepo,
    agent_task_repo: AgentTaskRepo,
    meeting_agenda_repo: MeetingAgendaRepo,
    recurring_meeting_repo: RecurringMeetingRepo,
    llm_provider: LLMProvider,
) -> ApprovalResult:
    """Approve a proposal and create task/project.

    Args:
        proposal_id: The proposal ID
        proposal_repo: Proposal repository
        task_repo: Task repository
        project_repo: Project repository
        llm_provider: LLM provider (for project KPI selection)

    Returns:
        Approval result with created task_id or project_id

    Raises:
        HTTPException: If proposal not found or already processed
    """
    proposal = await proposal_repo.get(proposal_id)

    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")

    if proposal.status != ProposalStatus.PENDING:
        raise HTTPException(
            status_code=400,
            detail=f"Proposal already {proposal.status.value}",
        )

    if not _proposal_belongs_to_user(proposal, user.id):
        raise HTTPException(status_code=403, detail="Forbidden")

    # Import necessary tools
    from app.tools.task_tools import create_task
    from app.tools.project_tools import create_project

    result = ApprovalResult()

    # Execute the proposed action
    if proposal.proposal_type.value == "create_task":
        input_data = CreateTaskInput(**proposal.payload)
        created_task = await create_task(
            user_id=user.id,
            repo=task_repo,
            input_data=input_data,
            assignment_repo=assignment_repo,  # 担当者割り当てを有効にする
            project_repo=project_repo,
            member_repo=member_repo,
        )
        result.task_id = created_task.get("id")
        assignments = created_task.get("assignments")
        if isinstance(assignments, list):
            result.assignment_ids = [
                str(item.get("id"))
                for item in assignments
                if isinstance(item, dict) and item.get("id")
            ]

    elif proposal.proposal_type.value == "create_project":
        input_data = CreateProjectInput(**proposal.payload)
        created_project = await create_project(
            user_id=user.id,
            repo=project_repo,
            member_repo=member_repo,
            llm_provider=llm_provider,
            input_data=input_data,
        )
        result.project_id = created_project.get("id")

    elif proposal.proposal_type.value == "create_skill":
        input_data = CreateSkillInput(**proposal.payload)
        created_memory = await memory_repo.create(
            user.id,
            MemoryCreate(
                content=input_data.content,
                scope=input_data.scope,
                memory_type=input_data.memory_type,
                project_id=None,
                tags=input_data.tags,
                source="agent",
            ),
        )
        result.memory_id = str(created_memory.id)

    elif proposal.proposal_type.value == "assign_task":
        input_data = AssignTaskInput(**proposal.payload)
        assignment_result = await assign_task(
            user_id=user.id,
            assignment_repo=assignment_repo,
            task_repo=task_repo,
            input_data=input_data,
            project_repo=project_repo,
            member_repo=member_repo,
        )
        result.assignment_ids = []
        if isinstance(assignment_result, dict):
            if assignment_result.get("id"):
                result.assignment_ids = [assignment_result.get("id")]
            else:
                assignments = assignment_result.get("assignments")
                if assignments:
                    result.assignment_ids = [str(a["id"]) for a in assignments]
                assignments = assignment_result.get("assignments")
                if isinstance(assignments, list):
                    result.assignment_ids = [
                        item.get("id")
                        for item in assignments
                        if isinstance(item, dict) and item.get("id")
                    ]

    elif proposal.proposal_type.value == "phase_breakdown":
        payload = proposal.payload or {}
        project_id_raw = payload.get("project_id")
        phases = payload.get("phases")
        if not project_id_raw or not isinstance(phases, list):
            raise HTTPException(status_code=400, detail="Invalid phase breakdown payload")
        try:
            project_id = UUID(project_id_raw)
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail="Invalid project_id for phase breakdown")

        create_milestones = payload.get("create_milestones", True)
        created = await apply_phase_plan(
            user_id=user.id,
            project_id=project_id,
            phase_repo=phase_repo,
            milestone_repo=milestone_repo,
            project_repo=project_repo,
            member_repo=member_repo,
            phases=phases,
            create_milestones=bool(create_milestones),
        )
        result.phase_ids = created.get("created_phase_ids", [])
        result.milestone_ids = created.get("created_milestone_ids", [])

    elif proposal.proposal_type.value == "tool_action":
        payload = proposal.payload or {}
        tool_name = payload.get("tool_name")
        args = payload.get("args") or {}
        if not tool_name or not isinstance(args, dict):
            raise HTTPException(status_code=400, detail="Invalid tool_action payload")

        from app.tools.task_tools import (
            UpdateTaskInput,
            DeleteTaskInput,
            update_task,
            delete_task,
        )
        from app.tools.project_tools import (
            UpdateProjectInput,
            InviteProjectMemberInput,
            update_project,
            invite_project_member,
        )
        from app.tools.project_memory_tools import (
            CreateProjectSummaryInput,
            create_project_summary,
        )
        from app.tools.memory_tools import (
            AddToMemoryInput,
            RefreshUserProfileInput,
            add_to_memory,
            refresh_user_profile,
        )
        from app.tools.scheduler_tools import (
            ScheduleAgentTaskInput,
            schedule_agent_task,
        )
        from app.tools.meeting_agenda_tools import (
            AddAgendaItemInput,
            UpdateAgendaItemInput,
            DeleteAgendaItemInput,
            ReorderAgendaItemsInput,
            add_agenda_item,
            update_agenda_item,
            delete_agenda_item,
            reorder_agenda_items,
        )
        from app.tools.phase_tools import (
            UpdatePhaseInput,
            CreatePhaseInput,
            DeletePhaseInput,
            CreateMilestoneInput,
            UpdateMilestoneInput,
            DeleteMilestoneInput,
            update_phase,
            create_phase_tool,
            delete_phase_tool,
            create_milestone_tool,
            update_milestone_tool,
            delete_milestone_tool,
        )

        tool_result = None

        if tool_name == "update_task":
            tool_result = await update_task(
                user.id,
                task_repo,
                UpdateTaskInput(**args),
                project_repo,
                member_repo,
            )
        elif tool_name == "delete_task":
            tool_result = await delete_task(
                user.id,
                task_repo,
                DeleteTaskInput(**args),
                project_repo,
                member_repo,
            )
        elif tool_name == "update_project":
            tool_result = await update_project(
                user.id,
                project_repo,
                member_repo,
                UpdateProjectInput(**args),
            )
        elif tool_name == "invite_project_member":
            tool_result = await invite_project_member(
                user.id,
                invitation_repo,
                member_repo,
                project_repo,
                InviteProjectMemberInput(**args),
            )
        elif tool_name == "create_project_summary":
            tool_result = await create_project_summary(
                user.id,
                project_repo,
                task_repo,
                memory_repo,
                llm_provider,
                member_repo,
                CreateProjectSummaryInput(**args),
            )
        elif tool_name == "add_to_memory":
            tool_result = await add_to_memory(user.id, memory_repo, AddToMemoryInput(**args))
        elif tool_name == "refresh_user_profile":
            tool_result = await refresh_user_profile(
                user.id,
                memory_repo,
                llm_provider,
                RefreshUserProfileInput(**args),
            )
        elif tool_name == "schedule_agent_task":
            tool_result = await schedule_agent_task(
                user.id,
                agent_task_repo,
                ScheduleAgentTaskInput(**args),
            )
        elif tool_name == "add_agenda_item":
            tool_result = await add_agenda_item(
                user.id,
                meeting_agenda_repo,
                AddAgendaItemInput(**args),
                project_repo=project_repo,
                member_repo=member_repo,
                recurring_meeting_repo=recurring_meeting_repo,
                task_repo=task_repo,
            )
        elif tool_name == "update_agenda_item":
            tool_result = await update_agenda_item(
                user.id,
                meeting_agenda_repo,
                UpdateAgendaItemInput(**args),
                project_repo=project_repo,
                member_repo=member_repo,
                recurring_meeting_repo=recurring_meeting_repo,
                task_repo=task_repo,
            )
        elif tool_name == "delete_agenda_item":
            tool_result = await delete_agenda_item(
                user.id,
                meeting_agenda_repo,
                DeleteAgendaItemInput(**args),
                project_repo=project_repo,
                member_repo=member_repo,
                recurring_meeting_repo=recurring_meeting_repo,
                task_repo=task_repo,
            )
        elif tool_name == "reorder_agenda_items":
            tool_result = await reorder_agenda_items(
                user.id,
                meeting_agenda_repo,
                ReorderAgendaItemsInput(**args),
                project_repo=project_repo,
                member_repo=member_repo,
                recurring_meeting_repo=recurring_meeting_repo,
                task_repo=task_repo,
            )
        elif tool_name == "update_phase":
            tool_result = await update_phase(
                user.id,
                phase_repo,
                project_repo,
                member_repo,
                UpdatePhaseInput(**args),
            )
        elif tool_name == "create_phase":
            tool_func = create_phase_tool(phase_repo, project_repo, member_repo, user.id).func
            tool_result = await tool_func(args)
        elif tool_name == "delete_phase":
            tool_func = delete_phase_tool(phase_repo, project_repo, member_repo, user.id).func
            tool_result = await tool_func(args)
        elif tool_name == "create_milestone":
            tool_func = create_milestone_tool(milestone_repo, project_repo, member_repo, user.id).func
            tool_result = await tool_func(args)
        elif tool_name == "update_milestone":
            tool_func = update_milestone_tool(milestone_repo, project_repo, member_repo, user.id).func
            tool_result = await tool_func(args)
        elif tool_name == "delete_milestone":
            tool_func = delete_milestone_tool(milestone_repo, project_repo, member_repo, user.id).func
            tool_result = await tool_func(args)
        else:
            raise HTTPException(status_code=400, detail=f"Unknown tool_action: {tool_name}")

        if hasattr(tool_result, "model_dump"):
            tool_result = tool_result.model_dump(mode="json")
        result.result = tool_result if isinstance(tool_result, dict) else {"result": tool_result}

    # Update proposal status
    await proposal_repo.update_status(proposal_id, ProposalStatus.APPROVED)

    return result


@router.post("/{proposal_id}/reject")
async def reject_proposal(
    proposal_id: UUID,
    user: CurrentUser,
    proposal_repo: ProposalRepo,
) -> RejectionResult:
    """Reject a proposal without creating anything.

    Args:
        proposal_id: The proposal ID
        proposal_repo: Proposal repository

    Returns:
        Rejection result

    Raises:
        HTTPException: If proposal not found or already processed
    """
    proposal = await proposal_repo.get(proposal_id)

    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")

    if proposal.status != ProposalStatus.PENDING:
        raise HTTPException(
            status_code=400,
            detail=f"Proposal already {proposal.status.value}",
        )

    if not _proposal_belongs_to_user(proposal, user.id):
        raise HTTPException(status_code=403, detail="Forbidden")

    # Update proposal status
    await proposal_repo.update_status(proposal_id, ProposalStatus.REJECTED)

    return RejectionResult()


@router.get("/pending")
async def list_pending_proposals(
    user: CurrentUser,
    proposal_repo: ProposalRepo,
    session_id: str | None = None,
):
    """List pending proposals for current user.

    Args:
        session_id: Optional session ID to filter proposals
        proposal_repo: Proposal repository

    Returns:
        List of pending proposals
    """
    proposals = await proposal_repo.list_pending(_proposal_user_uuid(user.id), session_id)

    return {
        "proposals": [p.model_dump(mode="json") for p in proposals],
        "count": len(proposals),
    }
