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
