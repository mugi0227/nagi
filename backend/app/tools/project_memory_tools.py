"""
Project memory tools.

Tools for creating project summaries and saving them as ProjectMemory entries.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

from google.adk.tools import FunctionTool
from pydantic import BaseModel, Field

from app.core.logger import logger
from app.interfaces.llm_provider import ILLMProvider
from app.interfaces.memory_repository import IMemoryRepository
from app.interfaces.project_member_repository import IProjectMemberRepository
from app.interfaces.project_repository import IProjectRepository
from app.interfaces.proposal_repository import IProposalRepository
from app.interfaces.task_repository import ITaskRepository
from app.models.enums import MemoryScope, MemoryType, TaskStatus
from app.models.memory import MemoryCreate
from app.services.kpi_calculator import apply_project_kpis
from app.services.llm_utils import generate_text
from app.services.project_permissions import ProjectAction
from app.tools.approval_tools import create_tool_action_proposal
from app.tools.permissions import require_project_action


class CreateProjectSummaryInput(BaseModel):
    """Input for create_project_summary tool."""

    project_id: str = Field(..., description="プロジェクトID（UUID）")
    summary_type: str = Field("weekly", description="サマリタイプ (weekly)")
    week_start: Optional[str] = Field(None, description="週の開始日 (YYYY-MM-DD)")
    week_end: Optional[str] = Field(None, description="週の終了日 (YYYY-MM-DD)")
    note: Optional[str] = Field(None, description="補足メモ")


@dataclass
class SummaryWindow:
    start: datetime
    end: datetime
    label: str


def _parse_date(value: str) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed
    except ValueError:
        return None


def _ensure_dt(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def _get_week_window(
    week_start: Optional[str],
    week_end: Optional[str],
) -> SummaryWindow:
    start = _parse_date(week_start) if week_start else None
    end = _parse_date(week_end) if week_end else None
    if start and end:
        label = f"{start.date().isoformat()}..{end.date().isoformat()}"
        return SummaryWindow(start=start, end=end, label=label)

    now = datetime.now(timezone.utc)
    week_start_date = (now - timedelta(days=now.weekday())).date()
    start = datetime.combine(week_start_date, datetime.min.time(), tzinfo=timezone.utc)
    end = start + timedelta(days=7)
    label = f"{start.date().isoformat()}..{(end - timedelta(days=1)).date().isoformat()}"
    return SummaryWindow(start=start, end=end, label=label)


def _task_in_window(task_dt: datetime | None, window: SummaryWindow) -> bool:
    if task_dt is None:
        return False
    task_dt = _ensure_dt(task_dt)
    return window.start <= task_dt < window.end


async def _generate_summary_text(
    llm_provider: ILLMProvider,
    prompt: str,
) -> Optional[str]:
    try:
        return generate_text(
            llm_provider,
            prompt,
            temperature=0.2,
            max_output_tokens=600,
        )
    except Exception as exc:
        logger.warning(f"Project summary generation failed: {exc}")
        return None


async def create_project_summary(
    user_id: str,
    project_repo: IProjectRepository,
    task_repo: ITaskRepository,
    memory_repo: IMemoryRepository,
    llm_provider: ILLMProvider,
    member_repo: IProjectMemberRepository,
    input_data: CreateProjectSummaryInput,
) -> dict:
    """Create and save a project summary as ProjectMemory."""
    try:
        project_id = UUID(input_data.project_id)
    except ValueError:
        return {"error": f"Invalid project ID format: {input_data.project_id}"}

    access = await require_project_action(
        user_id,
        project_id,
        project_repo,
        member_repo,
        ProjectAction.PROJECT_READ,
    )
    if isinstance(access, dict):
        return access

    project = await project_repo.get(access.owner_id, project_id)
    if not project:
        return {"error": "Project not found"}

    window = _get_week_window(input_data.week_start, input_data.week_end)
    tasks = await task_repo.list(
        access.owner_id,
        project_id=project_id,
        include_done=True,
        limit=1000,
    )

    status_counts = {
        TaskStatus.TODO.value: 0,
        TaskStatus.IN_PROGRESS.value: 0,
        TaskStatus.WAITING.value: 0,
        TaskStatus.DONE.value: 0,
    }
    completed_this_week = []
    created_this_week = []
    overdue_tasks = []
    upcoming_tasks = []
    now = datetime.now(timezone.utc)

    for task in tasks:
        status_counts[task.status.value] = status_counts.get(task.status.value, 0) + 1
        if task.status == TaskStatus.DONE and _task_in_window(task.updated_at, window):
            completed_this_week.append(task)
        if _task_in_window(task.created_at, window):
            created_this_week.append(task)
        due_date = _ensure_dt(task.due_date)
        if due_date and task.status != TaskStatus.DONE:
            if due_date < now:
                overdue_tasks.append(task)
            elif due_date < now + timedelta(days=7):
                upcoming_tasks.append(task)

    project_with_kpis = await apply_project_kpis(access.owner_id, project, task_repo)

    prompt_parts = [
        "You are summarizing a project's weekly status for the owner.",
        "Write concise bullet points with progress, risks, and next focus.",
        "",
        f"Project: {project.name}",
        f"Period: {window.label}",
    ]
    if project.description:
        prompt_parts.append(f"Description: {project.description}")
    if project.goals:
        prompt_parts.append(f"Goals: {', '.join(project.goals)}")
    if project.key_points:
        prompt_parts.append(f"Key points: {', '.join(project.key_points)}")
    if project.context:
        prompt_parts.append(f"README: {project.context}")
    prompt_parts.extend(
        [
            "",
            "Task counts:",
            f"- TODO: {status_counts.get(TaskStatus.TODO.value, 0)}",
            f"- IN_PROGRESS: {status_counts.get(TaskStatus.IN_PROGRESS.value, 0)}",
            f"- WAITING: {status_counts.get(TaskStatus.WAITING.value, 0)}",
            f"- DONE: {status_counts.get(TaskStatus.DONE.value, 0)}",
        ]
    )

    def _titles(items: list, limit: int = 5) -> str:
        return ", ".join([task.title for task in items[:limit]]) or "None"

    prompt_parts.extend(
        [
            "",
            f"Completed this week: {_titles(completed_this_week)}",
            f"New tasks: {_titles(created_this_week)}",
            f"Overdue tasks: {_titles(overdue_tasks)}",
            f"Upcoming tasks (7 days): {_titles(upcoming_tasks)}",
        ]
    )

    if project_with_kpis.kpi_config:
        prompt_parts.append("")
        prompt_parts.append("KPI status:")
        for metric in project_with_kpis.kpi_config.metrics:
            target = metric.target if metric.target is not None else "-"
            current = metric.current if metric.current is not None else "-"
            unit = f" {metric.unit}" if metric.unit else ""
            prompt_parts.append(
                f"- {metric.label}: {current}{unit} / {target}{unit}"
            )

    if input_data.note:
        prompt_parts.append("")
        prompt_parts.append(f"Note: {input_data.note}")

    prompt_parts.append("")
    prompt_parts.append("Keep it short and actionable. Use 5-10 bullets.")

    prompt = "\n".join(prompt_parts)
    summary_text = await _generate_summary_text(llm_provider, prompt)

    if not summary_text:
        summary_text = "\n".join(
            [
                f"# Weekly Summary ({window.label})",
                f"- Tasks: TODO {status_counts.get(TaskStatus.TODO.value, 0)}, "
                f"IN_PROGRESS {status_counts.get(TaskStatus.IN_PROGRESS.value, 0)}, "
                f"WAITING {status_counts.get(TaskStatus.WAITING.value, 0)}, "
                f"DONE {status_counts.get(TaskStatus.DONE.value, 0)}",
                f"- Completed: {_titles(completed_this_week)}",
                f"- New: {_titles(created_this_week)}",
                f"- Overdue: {_titles(overdue_tasks)}",
                f"- Upcoming: {_titles(upcoming_tasks)}",
            ]
        )

    tags = [
        "summary",
        input_data.summary_type,
        "version:v1",
        f"range:{window.label}",
    ]

    memory = await memory_repo.create(
        user_id,
        MemoryCreate(
            content=summary_text,
            scope=MemoryScope.PROJECT,
            memory_type=MemoryType.FACT,
            project_id=project_id,
            tags=tags,
            source="agent",
        ),
    )

    return {
        "memory": memory.model_dump(mode="json"),
        "summary": summary_text,
        "summary_type": input_data.summary_type,
        "range": window.label,
    }


def create_project_summary_tool(
    project_repo: IProjectRepository,
    task_repo: ITaskRepository,
    memory_repo: IMemoryRepository,
    llm_provider: ILLMProvider,
    member_repo: IProjectMemberRepository,
    user_id: str,
    proposal_repo: Optional[IProposalRepository] = None,
    session_id: Optional[str] = None,
    auto_approve: bool = True,
) -> FunctionTool:
    """Create ADK tool for saving project summaries."""

    async def _tool(input_data: dict) -> dict:
        """create_project_summary: プロジェクトの週次サマリを作成してProjectMemoryに保存します。

        Parameters:
            project_id (str): プロジェクトID（必須）
            summary_type (str, optional): サマリタイプ (weekly)
            week_start (str, optional): 週の開始日 (YYYY-MM-DD)
            week_end (str, optional): 週の終了日 (YYYY-MM-DD)
            note (str, optional): 補足メモ

        Returns:
            dict: 作成されたメモリとサマリ内容
        """
        payload = dict(input_data)
        proposal_desc = payload.pop("proposal_description", "")
        if proposal_repo and session_id and not auto_approve:
            return await create_tool_action_proposal(
                user_id,
                session_id,
                proposal_repo,
                "create_project_summary",
                payload,
                proposal_desc,
            )
        return await create_project_summary(
            user_id,
            project_repo,
            task_repo,
            memory_repo,
            llm_provider,
            member_repo,
            CreateProjectSummaryInput(**payload),
        )

    _tool.__name__ = "create_project_summary"
    return FunctionTool(func=_tool)
