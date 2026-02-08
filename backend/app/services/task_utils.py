"""
Task utility functions.

Helper functions for task calculations and processing.
"""

from typing import Iterable, Optional
from uuid import UUID

from app.interfaces.task_repository import ITaskRepository
from app.models.task import Task, TaskUpdate


async def renumber_siblings(
    repo: ITaskRepository,
    owner_id: str,
    parent_id: UUID,
    project_id: Optional[UUID] = None,
) -> None:
    """Renumber sibling subtasks to be sequential (1, 2, 3...)."""
    siblings = await repo.get_subtasks(owner_id, parent_id, project_id=project_id)
    siblings.sort(key=lambda s: (s.order_in_parent or 999, s.created_at))
    for index, sibling in enumerate(siblings, start=1):
        if sibling.order_in_parent != index:
            await repo.update(
                owner_id, sibling.id,
                TaskUpdate(order_in_parent=index),
                project_id=project_id,
            )


def get_effective_estimated_minutes(task: Task, all_tasks: Iterable[Task]) -> int:
    """
    Get the effective estimated minutes for a task.

    If the task has subtasks, returns the sum of subtask estimates.
    Otherwise, returns the task's own estimate.

    Args:
        task: The task to get the estimate for
        all_tasks: All tasks (needed to find subtasks)

    Returns:
        Effective estimated minutes (0 if no estimate available)
    """
    # Find all subtasks of this task
    subtasks = [t for t in all_tasks if t.parent_id == task.id]

    if subtasks:
        return sum(st.estimated_minutes or 0 for st in subtasks)
    if task.estimated_minutes:
        return task.estimated_minutes
    steps = getattr(task, "touchpoint_steps", None) or []
    step_minutes = sum(step.estimated_minutes or 0 for step in steps)
    if step_minutes > 0:
        return step_minutes
    return 0


def is_parent_task(task: Task, all_tasks: Iterable[Task]) -> bool:
    """
    Check if a task is a parent task (has subtasks).

    Args:
        task: The task to check
        all_tasks: All tasks (needed to find subtasks)

    Returns:
        True if the task has at least one subtask
    """
    return any(t.parent_id == task.id for t in all_tasks)


def get_remaining_minutes(task: Task, all_tasks: Iterable[Task]) -> int:
    """
    Get the remaining estimated minutes for a task based on progress.

    If progress is 50%, the remaining work is 50% of the total estimate.
    If the task has subtasks, considers each subtask's individual progress.

    Args:
        task: The task to get the remaining estimate for
        all_tasks: All tasks (needed to find subtasks)

    Returns:
        Remaining estimated minutes (0 if no estimate available)
    """
    # Convert to list to allow multiple iterations
    all_tasks_list = list(all_tasks)

    # Find all subtasks of this task
    subtasks = [t for t in all_tasks_list if t.parent_id == task.id]

    if subtasks:
        # If has subtasks: return sum of remaining subtask estimates
        total_remaining = 0
        for st in subtasks:
            estimated = st.estimated_minutes or 0
            progress = st.progress if hasattr(st, 'progress') and st.progress is not None else 0
            remaining = estimated * (100 - progress) // 100
            total_remaining += remaining
        return total_remaining
    estimated = task.estimated_minutes or 0
    if estimated <= 0:
        steps = getattr(task, "touchpoint_steps", None) or []
        estimated = sum(step.estimated_minutes or 0 for step in steps)
    progress = task.progress if hasattr(task, 'progress') and task.progress is not None else 0
    return estimated * (100 - progress) // 100
