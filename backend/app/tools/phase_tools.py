"""
Phase-related agent tools.

Tools for planning phases/milestones and phase task breakdowns.
"""

from __future__ import annotations

from typing import Optional
from uuid import UUID

from google.adk.tools import FunctionTool
from pydantic import BaseModel, Field

from app.interfaces.llm_provider import ILLMProvider
from app.interfaces.memory_repository import IMemoryRepository
from app.interfaces.milestone_repository import IMilestoneRepository
from app.interfaces.phase_repository import IPhaseRepository
from app.interfaces.project_repository import IProjectRepository
from app.interfaces.task_repository import ITaskRepository
from app.models.phase_breakdown import (
    PhaseBreakdownRequest,
    PhaseTaskBreakdownRequest,
)
from app.services.phase_planner_service import PhasePlannerService


class PlanProjectPhasesInput(BaseModel):
    """Input for plan_project_phases tool."""

    project_id: str = Field(..., description="Project ID")
    instruction: Optional[str] = Field(
        None,
        description="User instruction or constraints for phase planning",
    )
    create_phases: bool = Field(
        False,
        description="Create phases in the database",
    )
    create_milestones: bool = Field(
        False,
        description="Create milestones in the database",
    )


class PlanPhaseTasksInput(BaseModel):
    """Input for plan_phase_tasks tool."""

    phase_id: str = Field(..., description="Phase ID")
    instruction: Optional[str] = Field(
        None,
        description="User instruction or constraints for task breakdown",
    )
    create_tasks: bool = Field(
        False,
        description="Create tasks in the database",
    )


def plan_project_phases_tool(
    project_repo: IProjectRepository,
    phase_repo: IPhaseRepository,
    milestone_repo: IMilestoneRepository,
    task_repo: ITaskRepository,
    memory_repo: IMemoryRepository,
    llm_provider: ILLMProvider,
    user_id: str,
) -> FunctionTool:
    """Create ADK tool for AI phase/milestone planning."""

    async def _tool(input_data: dict) -> dict:
        """plan_project_phases: generate phases and milestones for a project.

        Parameters:
            project_id (str): Project ID
            instruction (str, optional): User instruction or constraints
            create_phases (bool, optional): Create phases in DB
            create_milestones (bool, optional): Create milestones in DB

        Returns:
            dict: phases list and created IDs if requested
        """
        payload = PlanProjectPhasesInput(**input_data)
        service = PhasePlannerService(
            llm_provider=llm_provider,
            memory_repo=memory_repo,
            project_repo=project_repo,
            phase_repo=phase_repo,
            milestone_repo=milestone_repo,
            task_repo=task_repo,
        )
        response = await service.breakdown_project_phases(
            user_id=user_id,
            project_id=UUID(payload.project_id),
            request=PhaseBreakdownRequest(
                create_phases=payload.create_phases,
                create_milestones=payload.create_milestones,
                instruction=payload.instruction,
            ),
        )
        return response.model_dump(mode="json")

    _tool.__name__ = "plan_project_phases"
    return FunctionTool(func=_tool)


def plan_phase_tasks_tool(
    project_repo: IProjectRepository,
    phase_repo: IPhaseRepository,
    milestone_repo: IMilestoneRepository,
    task_repo: ITaskRepository,
    memory_repo: IMemoryRepository,
    llm_provider: ILLMProvider,
    user_id: str,
) -> FunctionTool:
    """Create ADK tool for AI phase task breakdown."""

    async def _tool(input_data: dict) -> dict:
        """plan_phase_tasks: generate tasks for a phase.

        Parameters:
            phase_id (str): Phase ID
            instruction (str, optional): User instruction or constraints
            create_tasks (bool, optional): Create tasks in DB

        Returns:
            dict: tasks list and created IDs if requested
        """
        payload = PlanPhaseTasksInput(**input_data)
        service = PhasePlannerService(
            llm_provider=llm_provider,
            memory_repo=memory_repo,
            project_repo=project_repo,
            phase_repo=phase_repo,
            milestone_repo=milestone_repo,
            task_repo=task_repo,
        )
        response = await service.breakdown_phase_tasks(
            user_id=user_id,
            phase_id=UUID(payload.phase_id),
            request=PhaseTaskBreakdownRequest(
                create_tasks=payload.create_tasks,
                instruction=payload.instruction,
            ),
        )
        return response.model_dump(mode="json")

    _tool.__name__ = "plan_phase_tasks"
    return FunctionTool(func=_tool)
