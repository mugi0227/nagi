"""
Issue Agent implementation using Google ADK.

This agent helps users articulate and submit feature requests,
bug reports, and improvements for the app.
"""

from __future__ import annotations

import logging
from pathlib import Path

from google.adk import Agent

from app.agents.prompts.issue_prompt import get_issue_agent_prompt
from app.interfaces.issue_repository import IIssueRepository
from app.interfaces.llm_provider import ILLMProvider
from app.tools.issue_tools import search_issues_tool, create_issue_tool
from app.tools.user_interaction_tools import ask_user_questions_tool

logger = logging.getLogger(__name__)

# APP_KNOWLEDGE.md のパス
APP_KNOWLEDGE_PATH = Path(__file__).parent.parent.parent.parent / "docs" / "APP_KNOWLEDGE.md"


def load_app_knowledge() -> str:
    """Load APP_KNOWLEDGE.md content."""
    if APP_KNOWLEDGE_PATH.exists():
        return APP_KNOWLEDGE_PATH.read_text(encoding="utf-8")
    return "(APP_KNOWLEDGE.md が見つかりません。アプリの詳細情報は利用できません。)"


def create_issue_agent(
    llm_provider: ILLMProvider,
    issue_repo: IIssueRepository,
    user_id: str,
) -> Agent:
    """
    Create the Issue Partner Agent.

    This agent helps users articulate their feature requests,
    bug reports, and improvements in a friendly way.

    Args:
        llm_provider: LLM provider instance
        issue_repo: Issue repository
        user_id: User ID

    Returns:
        Configured ADK Agent instance
    """
    # Get model from provider
    model = llm_provider.get_model()

    # Load app knowledge
    app_knowledge = load_app_knowledge()

    # Generate prompt with app knowledge
    system_prompt = get_issue_agent_prompt(app_knowledge)

    # Create tools
    tools = [
        search_issues_tool(issue_repo, user_id),
        create_issue_tool(issue_repo, user_id),
        ask_user_questions_tool(),
    ]

    # Create agent
    agent = Agent(
        name="issue_partner",
        model=model,
        instruction=system_prompt,
        tools=tools,
    )

    return agent
