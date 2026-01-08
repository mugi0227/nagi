"""Proposal API endpoints for AI-suggested actions."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import (
    CurrentUser,
    get_proposal_repository,
    get_task_repository,
    get_task_assignment_repository,
    get_project_repository,
    get_project_member_repository,
    get_llm_provider,
    get_memory_repository,
)
from app.interfaces.llm_provider import ILLMProvider
from app.interfaces.memory_repository import IMemoryRepository
from app.interfaces.project_repository import IProjectRepository
from app.interfaces.project_member_repository import IProjectMemberRepository
from app.interfaces.proposal_repository import IProposalRepository
from app.interfaces.task_assignment_repository import ITaskAssignmentRepository
from app.interfaces.task_repository import ITaskRepository
from app.models.proposal import ApprovalResult, ProposalStatus, RejectionResult
from app.models.project import ProjectCreate
from app.models.task import TaskCreate
from app.tools.project_tools import CreateProjectInput
from app.tools.task_tools import CreateTaskInput, AssignTaskInput, assign_task
from app.tools.memory_tools import CreateSkillInput
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
    proposal_repo: IProposalRepository = Depends(get_proposal_repository),
    task_repo: ITaskRepository = Depends(get_task_repository),
    assignment_repo: ITaskAssignmentRepository = Depends(get_task_assignment_repository),
    project_repo: IProjectRepository = Depends(get_project_repository),
    member_repo: IProjectMemberRepository = Depends(get_project_member_repository),
    memory_repo: IMemoryRepository = Depends(get_memory_repository),
    llm_provider: ILLMProvider = Depends(get_llm_provider),
) -> ApprovalResult:
    """Approve a proposal and create the task/project.

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
        )
        result.task_id = created_task.get("id")

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
            input_data=input_data,
        )
        result.assignment_ids = []
        if isinstance(assignment_result, dict):
            if assignment_result.get("id"):
                result.assignment_ids = [assignment_result.get("id")]
            else:
                assignments = assignment_result.get("assignments")
                if isinstance(assignments, list):
                    result.assignment_ids = [
                        item.get("id")
                        for item in assignments
                        if isinstance(item, dict) and item.get("id")
                    ]

    # Update proposal status
    await proposal_repo.update_status(proposal_id, ProposalStatus.APPROVED)

    return result


@router.post("/{proposal_id}/reject")
async def reject_proposal(
    proposal_id: UUID,
    user: CurrentUser,
    proposal_repo: IProposalRepository = Depends(get_proposal_repository),
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
    session_id: str | None = None,
    proposal_repo: IProposalRepository = Depends(get_proposal_repository),
):
    """List pending proposals for the current user.

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
