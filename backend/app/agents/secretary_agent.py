"""
Main Secretary Agent implementation using Google ADK.

This is the primary agent that handles user interactions and orchestrates tasks.
"""

from __future__ import annotations

from google.adk import Agent

from app.agents.prompts.secretary_prompt import SECRETARY_SYSTEM_PROMPT
from app.interfaces.agent_task_repository import IAgentTaskRepository
from app.interfaces.memory_repository import IMemoryRepository
from app.interfaces.project_repository import IProjectRepository
from app.interfaces.proposal_repository import IProposalRepository
from app.interfaces.task_repository import ITaskRepository
from app.interfaces.llm_provider import ILLMProvider
from app.tools import (
    create_meeting_tool,
    list_kpi_templates_tool,
    list_projects_tool,
    load_project_context_tool,
    update_project_tool,
    create_project_summary_tool,
    update_task_tool,
    delete_task_tool,
    search_similar_tasks_tool,
    list_tasks_tool,
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
    propose_project_tool,
)


def create_secretary_agent(
    llm_provider: ILLMProvider,
    task_repo: ITaskRepository,
    project_repo: IProjectRepository,
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
    project_creation_tool = propose_project_tool(
        proposal_repo, project_repo, llm_provider, user_id, session_id, auto_approve
    )
    skill_creation_tool = propose_skill_tool(
        proposal_repo, memory_repo, user_id, session_id, auto_approve
    )

    # Create tools
    tools = [
        get_current_datetime_tool(),
        task_creation_tool,
        create_meeting_tool(task_repo, user_id),
        list_kpi_templates_tool(),
        project_creation_tool,
        skill_creation_tool,
        list_projects_tool(project_repo, user_id),
        load_project_context_tool(project_repo, user_id),
        create_project_summary_tool(project_repo, task_repo, memory_repo, llm_provider, user_id),
        update_project_tool(project_repo, user_id),
        update_task_tool(task_repo, user_id),
        delete_task_tool(task_repo, user_id),
        search_similar_tasks_tool(task_repo, user_id),
        list_tasks_tool(task_repo, user_id),
        breakdown_task_tool(task_repo, memory_repo, llm_provider, user_id, project_repo),
        search_memories_tool(memory_repo, user_id),
        search_skills_tool(memory_repo, user_id),
        search_work_memory_tool(memory_repo, user_id),
        add_to_memory_tool(memory_repo, user_id),
        refresh_user_profile_tool(memory_repo, llm_provider, user_id),
        schedule_agent_task_tool(agent_task_repo, user_id),
    ]

    # Create agent
    agent = Agent(
        name="secretary",
        model=model,
        instruction=SECRETARY_SYSTEM_PROMPT,
        tools=tools,
    )

    return agent

