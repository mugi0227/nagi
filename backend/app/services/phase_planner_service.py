"""
Phase Planner Service.

Generates phase/milestone plans and phase task breakdowns via LLM.
"""

from __future__ import annotations

import json
import re
from datetime import datetime
from typing import Optional
from uuid import UUID

from google.adk.runners import InMemoryRunner
from google.genai.types import Content, Part
from pydantic import ValidationError

from app.core.exceptions import LLMValidationError, NotFoundError
from app.core.logger import logger
from app.interfaces.llm_provider import ILLMProvider
from app.interfaces.memory_repository import IMemoryRepository
from app.interfaces.milestone_repository import IMilestoneRepository
from app.interfaces.phase_repository import IPhaseRepository
from app.interfaces.project_repository import IProjectRepository
from app.interfaces.task_repository import ITaskRepository
from app.models.enums import CreatedBy, EnergyLevel, Priority
from app.models.milestone import MilestoneCreate
from app.models.phase import PhaseCreate
from app.models.phase_breakdown import (
    PhaseBreakdownResponse,
    PhaseBreakdownRequest,
    PhaseSuggestion,
    PhaseTaskBreakdownRequest,
    PhaseTaskBreakdownResponse,
    PhaseTaskSuggestion,
)
from app.models.project import Project
from app.models.task import TaskCreate


class PhasePlannerService:
    """Service for phase/milestone planning and phase task breakdown."""

    APP_NAME = "SecretaryPartnerAI_PhasePlanner"
    MAX_RETRIES = 2

    def __init__(
        self,
        llm_provider: ILLMProvider,
        memory_repo: IMemoryRepository,
        project_repo: IProjectRepository,
        phase_repo: IPhaseRepository,
        milestone_repo: IMilestoneRepository,
        task_repo: ITaskRepository,
    ):
        self._llm_provider = llm_provider
        self._memory_repo = memory_repo
        self._project_repo = project_repo
        self._phase_repo = phase_repo
        self._milestone_repo = milestone_repo
        self._task_repo = task_repo

    async def breakdown_project_phases(
        self,
        user_id: str,
        project_id: UUID,
        request: PhaseBreakdownRequest,
    ) -> PhaseBreakdownResponse:
        """Generate phases and milestones for a project."""
        project = await self._project_repo.get(user_id, project_id)
        if not project:
            raise NotFoundError(f"Project {project_id} not found")

        from app.agents.phase_planner_agent import create_phase_planner_agent

        agent = create_phase_planner_agent(
            llm_provider=self._llm_provider,
            memory_repo=self._memory_repo,
            user_id=user_id,
        )
        runner = InMemoryRunner(agent=agent, app_name=self.APP_NAME)

        prompt = self._build_project_prompt(project, request.instruction)
        plan = await self._run_with_retry(
            runner=runner,
            user_id=user_id,
            session_prefix=f"phase-plan-{project_id}",
            prompt=prompt,
            parser=self._parse_phase_plan,
        )

        created_phase_ids: list[UUID] = []
        created_milestone_ids: list[UUID] = []

        if request.create_phases:
            for index, phase in enumerate(plan, start=1):
                created_phase = await self._phase_repo.create(
                    user_id,
                    PhaseCreate(
                        project_id=project_id,
                        name=phase.name,
                        description=phase.description,
                        order_in_project=index,
                    ),
                )
                created_phase_ids.append(created_phase.id)

                if request.create_milestones and phase.milestones:
                    for milestone_index, milestone in enumerate(phase.milestones, start=1):
                        due_date = _parse_optional_datetime(milestone.due_date)
                        created = await self._milestone_repo.create(
                            user_id,
                            MilestoneCreate(
                                project_id=project_id,
                                phase_id=created_phase.id,
                                title=milestone.title,
                                description=milestone.description,
                                order_in_phase=milestone_index,
                                due_date=due_date,
                            ),
                        )
                        created_milestone_ids.append(created.id)

        return PhaseBreakdownResponse(
            phases=plan,
            created_phase_ids=created_phase_ids,
            created_milestone_ids=created_milestone_ids,
        )

    async def breakdown_phase_tasks(
        self,
        user_id: str,
        phase_id: UUID,
        request: PhaseTaskBreakdownRequest,
    ) -> PhaseTaskBreakdownResponse:
        """Generate tasks for a phase."""
        phase = await self._phase_repo.get_by_id(user_id, phase_id)
        if not phase:
            raise NotFoundError(f"Phase {phase_id} not found")

        project: Optional[Project] = None
        if phase.project_id:
            project = await self._project_repo.get(user_id, phase.project_id)

        from app.agents.phase_planner_agent import create_phase_planner_agent

        agent = create_phase_planner_agent(
            llm_provider=self._llm_provider,
            memory_repo=self._memory_repo,
            user_id=user_id,
        )
        runner = InMemoryRunner(agent=agent, app_name=self.APP_NAME)

        prompt = self._build_phase_task_prompt(phase, project, request.instruction)
        tasks = await self._run_with_retry(
            runner=runner,
            user_id=user_id,
            session_prefix=f"phase-task-{phase_id}",
            prompt=prompt,
            parser=self._parse_phase_tasks,
        )

        created_task_ids: list[UUID] = []
        if request.create_tasks:
            for task in tasks:
                created = await self._task_repo.create(
                    user_id,
                    TaskCreate(
                        title=task.title,
                        description=task.description,
                        project_id=phase.project_id,
                        phase_id=phase.id,
                        estimated_minutes=task.estimated_minutes,
                        energy_level=_normalize_energy_level(task.energy_level),
                        importance=_normalize_priority(task.importance),
                        urgency=_normalize_priority(task.urgency),
                        due_date=_parse_optional_datetime(task.due_date),
                        created_by=CreatedBy.AGENT,
                    ),
                )
                created_task_ids.append(created.id)

        return PhaseTaskBreakdownResponse(
            tasks=tasks,
            created_task_ids=created_task_ids,
        )

    def _build_project_prompt(self, project: Project, instruction: Optional[str]) -> str:
        prompt_parts = [
            "Break the following project into 3-6 phases.",
            "Each phase should include 2-5 milestones.",
            "Milestones must be concrete, measurable outcomes.",
            "Return JSON only (no markdown, no commentary).",
            "",
            "Project:",
            f"- Name: {project.name}",
            f"- Description: {project.description or 'N/A'}",
        ]

        if project.goals:
            prompt_parts.append("- Goals:")
            for goal in project.goals:
                prompt_parts.append(f"  - {goal}")

        if project.key_points:
            prompt_parts.append("- Key points:")
            for point in project.key_points:
                prompt_parts.append(f"  - {point}")

        if project.context:
            prompt_parts.append("- Context:")
            prompt_parts.append(project.context)
        if instruction:
            prompt_parts.extend([
                "",
                "User instruction:",
                instruction,
            ])

        prompt_parts.extend([
            "",
            "Required JSON schema:",
            "{",
            '  "phases": [',
            "    {",
            '      "name": "Phase name",',
            '      "description": "Optional description",',
            '      "milestones": [',
            "        {",
            '          "title": "Milestone title",',
            '          "description": "Optional description",',
            '          "due_date": "YYYY-MM-DD or null"',
            "        }",
            "      ]",
            "    }",
            "  ]",
            "}",
        ])

        return "\n".join(prompt_parts)

    def _build_phase_task_prompt(
        self,
        phase,
        project: Optional[Project],
        instruction: Optional[str],
    ) -> str:
        prompt_parts = [
            "Break the following phase into 4-8 tasks.",
            "Tasks should be actionable and scoped to 15-180 minutes when possible.",
            "Return JSON only (no markdown, no commentary).",
            "",
            "Phase:",
            f"- Name: {phase.name}",
            f"- Description: {phase.description or 'N/A'}",
        ]

        if project:
            prompt_parts.extend([
                "",
                "Project context:",
                f"- Name: {project.name}",
                f"- Description: {project.description or 'N/A'}",
            ])
            if project.goals:
                prompt_parts.append("- Goals:")
                for goal in project.goals:
                    prompt_parts.append(f"  - {goal}")
            if project.key_points:
                prompt_parts.append("- Key points:")
                for point in project.key_points:
                    prompt_parts.append(f"  - {point}")
        if project.context:
            prompt_parts.append("- Context:")
            prompt_parts.append(project.context)
        if instruction:
            prompt_parts.extend([
                "",
                "User instruction:",
                instruction,
            ])

        prompt_parts.extend([
            "",
            "Required JSON schema:",
            "{",
            '  "tasks": [',
            "    {",
            '      "title": "Task title",',
            '      "description": "Optional description",',
            '      "estimated_minutes": 60,',
            '      "energy_level": "LOW or HIGH",',
            '      "importance": "LOW/MEDIUM/HIGH",',
            '      "urgency": "LOW/MEDIUM/HIGH",',
            '      "due_date": "YYYY-MM-DD or null"',
            "    }",
            "  ]",
            "}",
        ])

        return "\n".join(prompt_parts)

    async def _run_with_retry(
        self,
        runner: InMemoryRunner,
        user_id: str,
        session_prefix: str,
        prompt: str,
        parser,
    ):
        last_error: Optional[Exception] = None
        raw_output = ""

        for attempt in range(1, self.MAX_RETRIES + 1):
            try:
                session_id = f"{session_prefix}-{attempt}"
                await runner.session_service.create_session(
                    app_name=self.APP_NAME,
                    user_id=user_id,
                    session_id=session_id,
                )

                message = Content(role="user", parts=[Part(text=prompt)])
                response_parts: list[str] = []

                async for event in runner.run_async(
                    user_id=user_id,
                    session_id=session_id,
                    new_message=message,
                ):
                    if event.content and getattr(event.content, "parts", None):
                        for part in event.content.parts or []:
                            text = getattr(part, "text", None)
                            if text:
                                response_parts.append(text)

                raw_output = "".join(response_parts)
                return parser(raw_output)

            except ValidationError as exc:
                last_error = exc
                logger.warning(
                    f"Phase planner validation failed (attempt {attempt}/{self.MAX_RETRIES}): {exc}"
                )
                prompt = f"Fix the JSON output. Error: {exc}\n\n{prompt}"
            except Exception as exc:
                last_error = exc
                logger.error(f"Phase planner failed: {exc}")
                break

        raise LLMValidationError(
            message="Phase planner validation failed",
            raw_output=raw_output,
            attempts=self.MAX_RETRIES,
        ) from last_error

    def _parse_phase_plan(self, raw_output: str) -> list[PhaseSuggestion]:
        data = _extract_json(raw_output)
        phases = data.get("phases", [])
        if not isinstance(phases, list):
            raise ValidationError.from_exception_data(
                "PhaseSuggestion",
                [{"type": "value_error", "msg": "phases must be a list"}],
            )
        parsed = [PhaseSuggestion.model_validate(item) for item in phases]
        return parsed

    def _parse_phase_tasks(self, raw_output: str) -> list[PhaseTaskSuggestion]:
        data = _extract_json(raw_output)
        tasks = data.get("tasks", [])
        if not isinstance(tasks, list):
            raise ValidationError.from_exception_data(
                "PhaseTaskSuggestion",
                [{"type": "value_error", "msg": "tasks must be a list"}],
            )
        parsed = []
        for item in tasks:
            parsed.append(PhaseTaskSuggestion.model_validate(item))
        return parsed


def _extract_json(raw_output: str) -> dict:
    json_match = re.search(r"```(?:json)?\s*([\s\S]*?)```", raw_output)
    if json_match:
        json_str = json_match.group(1).strip()
    else:
        json_match = re.search(r"\{[\s\S]*\}", raw_output)
        if json_match:
            json_str = json_match.group(0)
        else:
            raise ValidationError.from_exception_data(
                "PhasePlanner",
                [{"type": "value_error", "msg": "No JSON found in output"}],
            )
    return json.loads(json_str)


def _parse_optional_datetime(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _normalize_energy_level(value: Optional[EnergyLevel]) -> EnergyLevel:
    if isinstance(value, EnergyLevel):
        return value
    if isinstance(value, str):
        try:
            return EnergyLevel(value.upper())
        except ValueError:
            return EnergyLevel.LOW
    return EnergyLevel.LOW


def _normalize_priority(value: Optional[Priority]) -> Priority:
    if isinstance(value, Priority):
        return value
    if isinstance(value, str):
        try:
            return Priority(value.upper())
        except ValueError:
            return Priority.MEDIUM
    return Priority.MEDIUM
