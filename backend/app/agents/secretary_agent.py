"""
Main Secretary Agent implementation using Google ADK.

This is the primary agent that handles user interactions and orchestrates tasks.
"""

from __future__ import annotations

from google.adk import Agent

from app.agents.prompts.secretary_prompt import SECRETARY_SYSTEM_PROMPT
from app.interfaces.agent_task_repository import IAgentTaskRepository
from app.interfaces.memory_repository import IMemoryRepository
from app.interfaces.project_invitation_repository import IProjectInvitationRepository
from app.interfaces.project_member_repository import IProjectMemberRepository
from app.interfaces.project_repository import IProjectRepository
from app.interfaces.phase_repository import IPhaseRepository
from app.interfaces.milestone_repository import IMilestoneRepository
from app.interfaces.proposal_repository import IProposalRepository
from app.interfaces.task_assignment_repository import ITaskAssignmentRepository
from app.interfaces.task_repository import ITaskRepository
from app.interfaces.llm_provider import ILLMProvider
from app.tools import (
    create_meeting_tool,
    list_kpi_templates_tool,
    list_projects_tool,
    list_project_members_tool,
    list_project_invitations_tool,
    load_project_context_tool,
    update_project_tool,
    invite_project_member_tool,
    create_project_summary_tool,
    update_task_tool,
    delete_task_tool,
    search_similar_tasks_tool,
    list_tasks_tool,
    list_task_assignments_tool,
    list_project_assignments_tool,
    breakdown_task_tool,
    search_work_memory_tool,
    search_memories_tool,
    search_skills_tool,
    add_to_memory_tool,
    refresh_user_profile_tool,
    propose_skill_tool,
    get_current_datetime_tool,
    schedule_agent_task_tool,
    propose_task_tool,
    propose_task_assignment_tool,
    propose_project_tool,
    plan_project_phases_tool,
    plan_phase_tasks_tool,
    propose_phase_breakdown_tool,
    list_phases_tool,
    get_phase_tool,
    update_phase_tool,
)


def create_secretary_agent(
    llm_provider: ILLMProvider,
    task_repo: ITaskRepository,
    project_repo: IProjectRepository,
    phase_repo: IPhaseRepository,
    milestone_repo: IMilestoneRepository,
    project_member_repo: IProjectMemberRepository,
    project_invitation_repo: IProjectInvitationRepository,
    task_assignment_repo: ITaskAssignmentRepository,
    memory_repo: IMemoryRepository,
    agent_task_repo: IAgentTaskRepository,
    user_id: str,
    proposal_repo: IProposalRepository,
    session_id: str,
    auto_approve: bool = True,
) -> Agent:
    """
    Create the main Secretary Agent with all tools.

    Args:
        llm_provider: LLM provider instance
        task_repo: Task repository
        project_repo: Project repository
        project_member_repo: Project member repository
        project_invitation_repo: Project invitation repository
        task_assignment_repo: Task assignment repository
        memory_repo: Memory repository
        agent_task_repo: Agent task repository
        user_id: User ID
        proposal_repo: Proposal repository
        session_id: Session ID
        auto_approve: If True, automatically approve proposals (False = show to user)

    Returns:
        Configured ADK Agent instance
    """
    # Get model from provider
    model = llm_provider.get_model()

    # Always use propose_* tools (with auto_approve flag)
    task_creation_tool = propose_task_tool(
        proposal_repo, task_repo, user_id, session_id, auto_approve
    )
    task_assignment_tool = propose_task_assignment_tool(
        proposal_repo, task_assignment_repo, user_id, session_id, auto_approve
    )
    project_creation_tool = propose_project_tool(
        proposal_repo, project_repo, project_member_repo, llm_provider, user_id, session_id, auto_approve
    )
    skill_creation_tool = propose_skill_tool(
        proposal_repo, memory_repo, user_id, session_id, auto_approve
    )

    # Create tools
    tools = [
        get_current_datetime_tool(),
        task_creation_tool,
        task_assignment_tool,
        create_meeting_tool(task_repo, proposal_repo, user_id, session_id, auto_approve=False),
        list_kpi_templates_tool(),
        project_creation_tool,
        skill_creation_tool,
        list_projects_tool(project_repo, user_id),
        list_project_members_tool(project_member_repo, user_id),
        list_project_invitations_tool(project_invitation_repo, user_id),
        load_project_context_tool(project_repo, user_id),
        create_project_summary_tool(project_repo, task_repo, memory_repo, llm_provider, user_id),
        update_project_tool(project_repo, user_id),
        invite_project_member_tool(project_invitation_repo, user_id),
        update_task_tool(task_repo, user_id),
        delete_task_tool(task_repo, user_id),
        search_similar_tasks_tool(task_repo, user_id),
        list_tasks_tool(task_repo, user_id),
        list_task_assignments_tool(task_assignment_repo, user_id),
        list_project_assignments_tool(task_assignment_repo, user_id),
        breakdown_task_tool(task_repo, memory_repo, llm_provider, user_id, project_repo),
        search_memories_tool(memory_repo, user_id),
        search_skills_tool(memory_repo, user_id),
        search_work_memory_tool(memory_repo, user_id),
        add_to_memory_tool(memory_repo, user_id),
        refresh_user_profile_tool(memory_repo, llm_provider, user_id),
        schedule_agent_task_tool(agent_task_repo, user_id),
        plan_project_phases_tool(
            project_repo,
            phase_repo,
            milestone_repo,
            task_repo,
            memory_repo,
            llm_provider,
            user_id,
        ),
        plan_phase_tasks_tool(
            project_repo,
            phase_repo,
            milestone_repo,
            task_repo,
            memory_repo,
            llm_provider,
            user_id,
        ),
        propose_phase_breakdown_tool(
            proposal_repo,
            project_repo,
            phase_repo,
            milestone_repo,
            task_repo,
            memory_repo,
            llm_provider,
            user_id,
            session_id,
            auto_approve,
        ),
        list_phases_tool(phase_repo, user_id),
        get_phase_tool(phase_repo, user_id),
        update_phase_tool(phase_repo, user_id),
    ]

    # Create agent
    agent = Agent(
        name="secretary",
        model=model,
        instruction=SECRETARY_SYSTEM_PROMPT,
        tools=tools,
    )

    return agent

