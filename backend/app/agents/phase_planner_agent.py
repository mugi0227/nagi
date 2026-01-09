"""
Phase Planner Agent implementation.

Generates phase/milestone plans and phase task breakdowns.
"""

from __future__ import annotations

from google.adk import Agent

from app.agents.prompts.phase_planner_prompt import PHASE_PLANNER_SYSTEM_PROMPT
from app.interfaces.llm_provider import ILLMProvider
from app.interfaces.memory_repository import IMemoryRepository
from app.tools.memory_tools import search_skills_tool, search_work_memory_tool


def create_phase_planner_agent(
    llm_provider: ILLMProvider,
    memory_repo: IMemoryRepository,
    user_id: str,
) -> Agent:
    """Create the Phase Planner Agent."""
    model = llm_provider.get_model()

    tools = [
        search_skills_tool(memory_repo, user_id),
        search_work_memory_tool(memory_repo, user_id),
    ]

    return Agent(
        name="phase_planner",
        model=model,
        instruction=PHASE_PLANNER_SYSTEM_PROMPT,
        tools=tools,
    )
