"""
Browser automation delegation tool.

This tool allows the secretary agent to delegate browser work to the Chrome extension.
"""

from __future__ import annotations

from typing import Optional

from google.adk.tools import FunctionTool
from pydantic import BaseModel, Field


class RunBrowserTaskInput(BaseModel):
    """Input for run_browser_task tool."""

    goal: str = Field(..., min_length=1, description="Task goal for browser automation")
    start_url: Optional[str] = Field(None, description="Optional starting URL")
    notes: Optional[str] = Field(None, description="Optional notes for execution context")


class RegisterBrowserSkillInput(BaseModel):
    """Input for register_browser_skill tool."""

    title: str = Field(..., min_length=1, description="Skill title")
    when_to_use: Optional[str] = Field(
        None,
        description="Optional 'When to use' description for the skill"
    )
    tags: list[str] = Field(
        default_factory=lambda: ["browser", "automation", "skill"],
        description="Optional skill tags"
    )
    target_goal: Optional[str] = Field(
        None,
        description="Optional browser run goal text to match the target run"
    )
    force: bool = Field(
        False,
        description="If true, allow using an in-progress run when no completed run is found"
    )


class RunHybridRpaInput(BaseModel):
    """Input for run_hybrid_rpa tool."""

    goal: str = Field(..., min_length=1, description="Overall automation goal")
    scenario_name: Optional[str] = Field(
        None,
        description="Optional scenario name shown in activity log"
    )
    start_url: Optional[str] = Field(
        None,
        description="Optional URL to open before first RPA step"
    )
    steps: list[dict] = Field(
        default_factory=list,
        description=(
            "Structured RPA steps. Supported types: "
            "navigate/new_tab/click/type/scroll/wait/keypress/assert_text/assert_url."
        ),
    )
    ai_fallback: bool = Field(
        True,
        description="If true, run browser AI fallback when deterministic RPA step fails"
    )
    ai_fallback_max_steps: int = Field(
        3,
        ge=1,
        le=10,
        description="Max planner steps per fallback attempt"
    )
    step_retry_limit: int = Field(
        1,
        ge=0,
        le=3,
        description="Retry count per deterministic step before fallback"
    )
    stop_on_failure: bool = Field(
        True,
        description="If true, stop scenario when a step cannot be recovered"
    )
    notes: Optional[str] = Field(
        None,
        description="Optional free-form context for execution"
    )


async def run_browser_task(input_data: RunBrowserTaskInput) -> dict:
    """
    Create browser task delegation payload for extension-side execution.
    """
    return {
        "status": "browser_task_requested",
        "requires_extension_execution": True,
        "goal": input_data.goal,
        "start_url": input_data.start_url,
        "notes": input_data.notes,
        "instruction": input_data.goal,
    }


async def register_browser_skill(input_data: RegisterBrowserSkillInput) -> dict:
    """
    Request extension-side skill registration from latest browser run logs.
    """
    return {
        "status": "browser_skill_registration_requested",
        "requires_extension_execution": True,
        "kind": "register_browser_skill",
        "title": input_data.title,
        "when_to_use": input_data.when_to_use,
        "tags": input_data.tags,
        "target_goal": input_data.target_goal,
        "force": input_data.force,
        "payload": {
            "title": input_data.title,
            "when_to_use": input_data.when_to_use,
            "tags": input_data.tags,
            "target_goal": input_data.target_goal,
            "force": input_data.force,
        },
    }


async def run_hybrid_rpa(input_data: RunHybridRpaInput) -> dict:
    """
    Request extension-side hybrid RPA execution (deterministic steps + AI fallback).
    """
    payload = {
        "goal": input_data.goal,
        "scenario_name": input_data.scenario_name,
        "start_url": input_data.start_url,
        "steps": input_data.steps,
        "ai_fallback": input_data.ai_fallback,
        "ai_fallback_max_steps": input_data.ai_fallback_max_steps,
        "step_retry_limit": input_data.step_retry_limit,
        "stop_on_failure": input_data.stop_on_failure,
        "notes": input_data.notes,
    }
    return {
        "status": "hybrid_rpa_requested",
        "requires_extension_execution": True,
        "kind": "run_hybrid_rpa",
        "goal": input_data.goal,
        "instruction": input_data.goal,
        "payload": payload,
    }


def run_browser_task_tool() -> FunctionTool:
    """Create ADK tool for browser automation delegation."""

    async def _tool(input_data: dict) -> dict:
        """
        run_browser_task: Delegate browser operation task to the Chrome extension.

        Parameters:
            goal (str): Browser task goal in natural language.
            start_url (str, optional): URL to open before execution.
            notes (str, optional): Additional context.

        Returns:
            dict: Delegation payload consumed by extension stream handler.
        """
        return await run_browser_task(RunBrowserTaskInput(**input_data))

    _tool.__name__ = "run_browser_task"
    return FunctionTool(func=_tool)


def run_hybrid_rpa_tool() -> FunctionTool:
    """Create ADK tool for hybrid RPA execution via Chrome extension."""

    async def _tool(input_data: dict) -> dict:
        """
        run_hybrid_rpa: Execute structured browser RPA steps and use AI only when needed.

        Parameters:
            goal (str): Overall automation goal.
            scenario_name (str, optional): Display name for scenario.
            start_url (str, optional): URL to open before step execution.
            steps (list[dict], optional): Deterministic RPA steps.
            ai_fallback (bool, optional): Enable fallback planner on failure.
            ai_fallback_max_steps (int, optional): Planner step budget per fallback.
            step_retry_limit (int, optional): Retry count for deterministic steps.
            stop_on_failure (bool, optional): Stop when unrecoverable.
            notes (str, optional): Extra context for runtime.

        Returns:
            dict: Delegation payload consumed by extension stream handler.
        """
        return await run_hybrid_rpa(RunHybridRpaInput(**input_data))

    _tool.__name__ = "run_hybrid_rpa"
    return FunctionTool(func=_tool)


def register_browser_skill_tool() -> FunctionTool:
    """Create ADK tool for extension-side browser skill registration."""

    async def _tool(input_data: dict) -> dict:
        """
        register_browser_skill: Create a WORK/RULE skill from browser-agent run logs
        (including screenshots) via the Chrome extension.

        Parameters:
            title (str): Skill title.
            when_to_use (str, optional): Optional usage guidance.
            tags (list[str], optional): Skill tags.
            target_goal (str, optional): Match a specific browser run by goal text.
            force (bool, optional): Allow in-progress run fallback.

        Returns:
            dict: Delegation payload consumed by extension stream handler.
        """
        return await register_browser_skill(RegisterBrowserSkillInput(**input_data))

    _tool.__name__ = "register_browser_skill"
    return FunctionTool(func=_tool)
