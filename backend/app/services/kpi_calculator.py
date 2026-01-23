"""
KPI calculation utilities.

Compute project KPI current values based on task data.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Iterable, TypeVar
from uuid import UUID

from app.interfaces.task_repository import ITaskRepository
from app.models.enums import TaskStatus
from app.models.project import Project, ProjectWithTaskCount
from app.models.project_kpi import ProjectKpiConfig, ProjectKpiMetric
from app.models.task import Task
from app.services.kpi_templates import get_kpi_templates


TProject = TypeVar("TProject", Project, ProjectWithTaskCount)


def _normalize_dt(value: datetime) -> datetime:
    """Normalize datetime to naive UTC for comparisons."""
    if value.tzinfo is not None:
        return value.astimezone(timezone.utc).replace(tzinfo=None)
    return value


def _round(value: float) -> float:
    return round(value, 2)


def _normalized_progress(task: Task) -> int:
    if task.status == TaskStatus.DONE:
        return 100
    progress = task.progress if task.progress is not None else 0
    return max(0, min(progress, 100))


def _build_task_index(task_list: list[Task]) -> tuple[dict[UUID, Task], dict[UUID, list[Task]], list[Task]]:
    tasks_by_id = {task.id: task for task in task_list}
    tasks_by_parent: dict[UUID, list[Task]] = {}
    for task in task_list:
        if task.parent_id:
            tasks_by_parent.setdefault(task.parent_id, []).append(task)
    top_level = [task for task in task_list if not task.parent_id or task.parent_id not in tasks_by_id]
    return tasks_by_id, tasks_by_parent, top_level


def _total_estimated_minutes_for_task(task: Task, tasks_by_parent: dict[UUID, list[Task]]) -> int:
    children = tasks_by_parent.get(task.id, [])
    if children:
        return sum(_total_estimated_minutes_for_task(child, tasks_by_parent) for child in children)
    return task.estimated_minutes or 0


def _remaining_minutes_for_task(task: Task, tasks_by_parent: dict[UUID, list[Task]]) -> int:
    if task.status == TaskStatus.DONE:
        return 0
    children = tasks_by_parent.get(task.id, [])
    if children:
        return sum(_remaining_minutes_for_task(child, tasks_by_parent) for child in children)
    estimated = task.estimated_minutes or 0
    progress = _normalized_progress(task)
    return int(estimated * (100 - progress) / 100)


def _compute_total_estimated_minutes(task_list: list[Task]) -> int:
    _, tasks_by_parent, top_level = _build_task_index(task_list)
    return sum(_total_estimated_minutes_for_task(task, tasks_by_parent) for task in top_level)


def _compute_task_kpis(tasks: Iterable[Task]) -> dict[str, float | int]:
    task_list = list(tasks)

    now = datetime.utcnow()
    week_cutoff = now - timedelta(days=7)

    overdue_count = 0
    weekly_throughput = 0
    wip_count = 0
    backlog_count = 0

    task_by_id, tasks_by_parent, top_level = _build_task_index(task_list)
    done_ids = {task.id for task in task_list if task.status == TaskStatus.DONE}

    # For completion rate: exclude parent tasks that have subtasks (count only leaf tasks)
    # Leaf tasks = subtasks + tasks without children
    parent_ids_with_children = set(tasks_by_parent.keys())
    leaf_tasks = [task for task in task_list if task.id not in parent_ids_with_children]
    total_leaf_tasks = len(leaf_tasks)
    done_leaf_tasks = [task for task in leaf_tasks if task.status == TaskStatus.DONE]
    done_leaf_count = len(done_leaf_tasks)

    for task in task_list:
        if task.status == TaskStatus.IN_PROGRESS:
            wip_count += 1

        if task.status != TaskStatus.DONE:
            backlog_count += 1

        if task.due_date and task.status != TaskStatus.DONE:
            due = _normalize_dt(task.due_date)
            if due < now:
                overdue_count += 1

        if task.status == TaskStatus.DONE and task.updated_at:
            updated = _normalize_dt(task.updated_at)
            if updated >= week_cutoff:
                weekly_throughput += 1

    blocked_tasks = 0
    for task in task_list:
        if task.status == TaskStatus.DONE:
            continue
        if task.status == TaskStatus.WAITING:
            blocked_tasks += 1
            continue
        if task.dependency_ids:
            for dep_id in task.dependency_ids:
                dep_task = task_by_id.get(dep_id)
                if dep_task is None or dep_task.id not in done_ids:
                    blocked_tasks += 1
                    break

    completion_rate = _round((done_leaf_count / total_leaf_tasks) * 100) if total_leaf_tasks else 0.0
    remaining_minutes = sum(_remaining_minutes_for_task(task, tasks_by_parent) for task in top_level)
    remaining_hours = _round(remaining_minutes / 60) if remaining_minutes else 0.0

    return {
        "completion_rate": completion_rate,
        "overdue_tasks": overdue_count,
        "remaining_hours": remaining_hours,
        "weekly_throughput": weekly_throughput,
        "wip_count": wip_count,
        "blocked_tasks": blocked_tasks,
        "backlog_count": backlog_count,
    }


def _apply_kpi_results(
    config: ProjectKpiConfig,
    computed: dict[str, float | int],
) -> ProjectKpiConfig:
    updated_metrics: list[ProjectKpiMetric] = []
    for metric in config.metrics:
        use_auto = metric.source == "tasks" or metric.source is None
        if use_auto and metric.key in computed:
            updated_metrics.append(metric.model_copy(update={"current": computed[metric.key]}))
        else:
            updated_metrics.append(metric.model_copy())

    return config.model_copy(update={"metrics": updated_metrics})


def _apply_template_targets(config: ProjectKpiConfig) -> ProjectKpiConfig:
    return _apply_template_targets_with_baseline(config, None)


def _apply_template_targets_with_baseline(
    config: ProjectKpiConfig,
    remaining_hours_target: float | None,
) -> ProjectKpiConfig:
    if config.strategy != "template" or not config.template_id:
        return config

    template = next(
        (item for item in get_kpi_templates() if item.id == config.template_id),
        None,
    )
    if not template:
        return config

    template_targets = {
        metric.key: metric.target
        for metric in template.metrics
        if metric.target is not None
    }
    if not template_targets:
        return config

    updated_metrics: list[ProjectKpiMetric] = []
    for metric in config.metrics:
        if (
            metric.key == "remaining_hours"
            and remaining_hours_target
            and remaining_hours_target > 0
            and (metric.target is None or metric.target <= 0)
        ):
            updated_metrics.append(
                metric.model_copy(update={"target": remaining_hours_target})
            )
            continue
        if metric.target is None and metric.key in template_targets:
            updated_metrics.append(
                metric.model_copy(update={"target": template_targets[metric.key]})
            )
        else:
            updated_metrics.append(metric.model_copy())

    return config.model_copy(update={"metrics": updated_metrics})


async def _fetch_all_tasks(
    task_repo: ITaskRepository,
    user_id: str,
    project_id: UUID,
    limit: int = 200,
) -> list[Task]:
    tasks: list[Task] = []
    offset = 0
    while True:
        batch = await task_repo.list(
            user_id,
            project_id=project_id,
            include_done=True,
            limit=limit,
            offset=offset,
        )
        tasks.extend(batch)
        if len(batch) < limit:
            break
        offset += limit
    return tasks


async def apply_project_kpis(
    user_id: str,
    project: TProject,
    task_repo: ITaskRepository,
) -> TProject:
    if not project.kpi_config or not project.kpi_config.metrics:
        return project

    tasks = await _fetch_all_tasks(task_repo, user_id, project.id)
    computed = _compute_task_kpis(tasks)
    remaining_baseline_minutes = _compute_total_estimated_minutes(tasks)
    remaining_hours_target = _round(remaining_baseline_minutes / 60) if remaining_baseline_minutes else None
    updated_config = _apply_kpi_results(project.kpi_config, computed)
    updated_config = _apply_template_targets_with_baseline(updated_config, remaining_hours_target)
    return project.model_copy(update={"kpi_config": updated_config})
