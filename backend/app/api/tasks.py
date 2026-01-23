"""
Tasks API endpoints.

CRUD operations for tasks and task breakdown.
"""

from datetime import date
import json
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.api.deps import (
    BlockerRepo,
    CurrentUser,
    LLMProvider,
    MemoryRepo,
    ProjectRepo,
    ScheduleSnapshotRepo,
    TaskAssignmentRepo,
    TaskRepo,
)
from app.core.exceptions import BusinessLogicError, LLMValidationError, NotFoundError
from app.models.breakdown import BreakdownRequest, BreakdownResponse
from app.models.collaboration import (
    Blocker,
    BlockerCreate,
    BlockerUpdate,
    TaskAssignment,
    TaskAssignmentCreate,
    TaskAssignmentsCreate,
    TaskAssignmentUpdate,
)
from app.models.schedule import ScheduleResponse, TodayTasksResponse
from app.models.task import Task, TaskCreate, TaskUpdate
from app.models.enums import CreatedBy
from app.services.planner_service import PlannerService
from app.services.scheduler_service import SchedulerService
from app.utils.dependency_validator import DependencyValidator

router = APIRouter()


def get_scheduler_service() -> SchedulerService:
    """Get SchedulerService instance."""
    return SchedulerService()


def parse_capacity_by_weekday(
    capacity_by_weekday: Optional[str],
) -> Optional[list[float]]:
    """Parse capacity_by_weekday query param."""
    if capacity_by_weekday is None:
        return None
    try:
        parsed = json.loads(capacity_by_weekday)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="capacity_by_weekday must be a JSON array of 7 numbers",
        ) from exc
    if not isinstance(parsed, list) or len(parsed) != 7:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="capacity_by_weekday must be a JSON array of 7 numbers",
        )
    result: list[float] = []
    for entry in parsed:
        try:
            value = float(entry)
        except (TypeError, ValueError) as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="capacity_by_weekday must be a JSON array of 7 numbers",
            ) from exc
        if value < 0 or value > 24:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="capacity_by_weekday values must be between 0 and 24",
            )
        result.append(value)
    return result


async def load_plan_windows(
    user: CurrentUser,
    tasks: list[Task],
    project_repo: ProjectRepo,
    snapshot_repo: ScheduleSnapshotRepo,
) -> dict[UUID, tuple[Optional[date], Optional[date]]]:
    if not tasks:
        return {}
    task_ids = {task.id for task in tasks}
    projects = await project_repo.list(user.id, limit=1000)
    planned_windows: dict[UUID, tuple[Optional[date], Optional[date]]] = {}
    for project in projects:
        snapshot = await snapshot_repo.get_active(user.id, project.id)
        if not snapshot:
            continue
        for snapshot_task in snapshot.tasks:
            if snapshot_task.task_id not in task_ids:
                continue
            if snapshot_task.planned_start or snapshot_task.planned_end:
                planned_windows[snapshot_task.task_id] = (
                    snapshot_task.planned_start,
                    snapshot_task.planned_end,
                )
    return planned_windows


def apply_capacity_buffer(
    scheduler_service: SchedulerService,
    capacity_hours: Optional[float],
    buffer_hours: Optional[float],
    capacity_by_weekday: Optional[list[float]] = None,
) -> tuple[Optional[float], Optional[list[float]]]:
    """Apply buffer hours to capacity hours."""
    if buffer_hours is None:
        return capacity_hours, capacity_by_weekday
    base_hours = capacity_hours if capacity_hours is not None else scheduler_service.default_capacity_hours
    adjusted_weekday = None
    if capacity_by_weekday:
        adjusted_weekday = [max(0.0, hours - buffer_hours) for hours in capacity_by_weekday]
    return max(0.0, base_hours - buffer_hours), adjusted_weekday


async def load_project_priorities(project_repo: ProjectRepo, user_id: str) -> dict[UUID, int]:
    """Load project priorities for scheduling."""
    projects = await project_repo.list(user_id, limit=1000)
    return {project.id: project.priority for project in projects}


async def _get_task_or_404(
    user: CurrentUser, repo: TaskRepo, task_id: UUID, project_repo: ProjectRepo = None
) -> tuple[Task, str]:
    """
    Get task by ID with permission check.
    Returns (task, owner_user_id) where owner_user_id is the project owner's ID.
    For personal tasks, owner_user_id is the user's own ID.
    """
    # First try personal access (Inbox tasks)
    task = await repo.get(user.id, task_id)
    if task:
        return task, user.id

    # If not found and project_repo is provided, try project-based access
    if project_repo:
        projects = await project_repo.list(user.id, limit=1000)
        for project in projects:
            task = await repo.get(user.id, task_id, project_id=project.id)
            if task:
                return task, project.user_id  # Return project owner's user_id

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Task {task_id} not found",
    )


@router.post("", response_model=Task, status_code=status.HTTP_201_CREATED)
async def create_task(
    task: TaskCreate,
    user: CurrentUser,
    repo: TaskRepo,
):
    """Create a new task."""
    # Validate dependencies before creating
    if task.dependency_ids or task.parent_id:
        validator = DependencyValidator(repo)

        # For new tasks, use a temporary UUID for validation
        from uuid import uuid4
        temp_task_id = uuid4()

        try:
            if task.dependency_ids:
                await validator.validate_dependencies(
                    temp_task_id,
                    task.dependency_ids,
                    user.id,
                    task.parent_id,
                )

            if task.parent_id:
                await validator.validate_parent_child_consistency(
                    temp_task_id,
                    task.parent_id,
                    user.id,
                )
        except BusinessLogicError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(e),
            )

    return await repo.create(user.id, task)


@router.get("", response_model=list[Task])
async def list_tasks(
    user: CurrentUser,
    repo: TaskRepo,
    project_repo: ProjectRepo,
    assignment_repo: TaskAssignmentRepo,
    project_id: Optional[UUID] = Query(None, description="Filter by project ID"),
    status: Optional[str] = Query(None, description="Filter by status"),
    include_done: bool = Query(False, description="Include completed tasks"),
    only_meetings: bool = Query(False, description="会議のみ取得"),
    exclude_meetings: bool = Query(False, description="会議を除外"),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
):
    """List tasks with optional filters."""
    # If project_id is specified, check membership and use project owner's user_id
    if project_id:
        project = await project_repo.get(user.id, project_id)
        if project:
            query_user_id = project.user_id  # Use project owner's ID
            tasks = await repo.list(
                query_user_id,
                project_id=project_id,
                status=status,
                include_done=include_done,
                limit=limit,
                offset=offset,
            )
        else:
            tasks = await repo.list(
                user.id,
                project_id=project_id,
                status=status,
                include_done=include_done,
                limit=limit,
                offset=offset,
            )
        # Apply meeting filters for project-scoped queries
        if only_meetings:
            tasks = [t for t in tasks if t.is_fixed_time]
        elif exclude_meetings:
            tasks = [t for t in tasks if not t.is_fixed_time]
    else:
        # Special case: only_meetings - fetch all user's meetings across all projects
        if only_meetings:
            all_tasks = await repo.list(
                user.id,
                project_id=None,
                status=status,
                include_done=include_done,
                limit=limit,
                offset=offset,
            )
            tasks = [t for t in all_tasks if t.is_fixed_time]
        else:
            # My Tasks mode (No project_id) - Show Assigned + Personal
            # 1. Assigned
            assignments = await assignment_repo.list_for_assignee(user.id)
            assigned_ids = [a.task_id for a in assignments]
            assigned_tasks = await repo.get_many(assigned_ids)

            # 2. Personal (Inbox)
            # Fetching more than limit to ensure we have enough after merge/filter
            personal_tasks = await repo.list_personal_tasks(
                user.id, status=status, limit=limit + 100, offset=0
            )

            # Merge
            all_tasks_map = {t.id: t for t in personal_tasks}
            for t in assigned_tasks:
                # Apply filters to assigned tasks manually if needed?
                if status and t.status.value != status:
                    continue
                if not include_done and t.status.value == "done": # assuming "done" value
                    continue
                all_tasks_map[t.id] = t

            tasks = list(all_tasks_map.values())

            # Sort by created_at desc (default) or whatever
            tasks.sort(key=lambda t: t.created_at, reverse=True)

            # Manual pagination
            tasks = tasks[offset : offset + limit]

            # Apply exclude_meetings filter
            if exclude_meetings:
                tasks = [t for t in tasks if not t.is_fixed_time]

    return tasks


@router.get("/schedule", response_model=ScheduleResponse)
async def get_task_schedule(
    user: CurrentUser,
    repo: TaskRepo,
    project_repo: ProjectRepo,
    assignment_repo: TaskAssignmentRepo,
    snapshot_repo: ScheduleSnapshotRepo,
    scheduler_service: SchedulerService = Depends(get_scheduler_service),
    start_date: Optional[date] = Query(None, description="Schedule start date"),
    capacity_hours: Optional[float] = Query(None, description="Daily capacity in hours (default: 8)"),
    buffer_hours: Optional[float] = Query(None, description="Daily buffer hours"),
    capacity_by_weekday: Optional[str] = Query(
        None,
        description="JSON array of 7 daily capacity values (Sun..Sat)",
    ),
    max_days: int = Query(60, ge=1, le=365, description="Maximum days to schedule"),
    filter_by_assignee: bool = Query(False, description="Only show tasks assigned to me"),
    apply_plan_constraints: bool = Query(True, description="Apply project plan windows"),
):
    """Build a multi-day schedule for tasks."""
    tasks = await repo.list(user.id, include_done=True, limit=1000)
    project_priorities = await load_project_priorities(project_repo, user.id)
    parsed_weekly = parse_capacity_by_weekday(capacity_by_weekday)
    effective_capacity, effective_weekly = apply_capacity_buffer(
        scheduler_service,
        capacity_hours,
        buffer_hours,
        parsed_weekly,
    )

    # Load assignments if filtering by assignee
    assignments = None
    if filter_by_assignee:
        assignments = await assignment_repo.list_all_for_user(user.id)

    planned_window_by_task = None
    if apply_plan_constraints:
        planned_window_by_task = await load_plan_windows(user, tasks, project_repo, snapshot_repo)

    return scheduler_service.build_schedule(
        tasks,
        project_priorities=project_priorities,
        start_date=start_date,
        capacity_hours=effective_capacity,
        capacity_by_weekday=effective_weekly,
        max_days=max_days,
        current_user_id=user.id,
        assignments=assignments,
        filter_by_assignee=filter_by_assignee,
        planned_window_by_task=planned_window_by_task,
    )


@router.get("/today", response_model=TodayTasksResponse)
async def get_today_tasks(
    user: CurrentUser,
    repo: TaskRepo,
    project_repo: ProjectRepo,
    assignment_repo: TaskAssignmentRepo,
    snapshot_repo: ScheduleSnapshotRepo,
    scheduler_service: SchedulerService = Depends(get_scheduler_service),
    target_date: Optional[date] = Query(None, description="Target date (default: today)"),
    capacity_hours: Optional[float] = Query(None, description="Daily capacity in hours (default: 8)"),
    buffer_hours: Optional[float] = Query(None, description="Daily buffer hours"),
    capacity_by_weekday: Optional[str] = Query(
        None,
        description="JSON array of 7 daily capacity values (Sun..Sat)",
    ),
    max_days: int = Query(30, ge=1, le=365, description="Maximum days to schedule"),
    filter_by_assignee: bool = Query(False, description="Only show tasks assigned to me"),
    apply_plan_constraints: bool = Query(True, description="Apply project plan windows"),
):
    """Get today's tasks derived from the schedule."""
    tasks = await repo.list(user.id, include_done=True, limit=1000)
    project_priorities = await load_project_priorities(project_repo, user.id)
    parsed_weekly = parse_capacity_by_weekday(capacity_by_weekday)
    effective_capacity, effective_weekly = apply_capacity_buffer(
        scheduler_service,
        capacity_hours,
        buffer_hours,
        parsed_weekly,
    )

    # Load assignments if filtering by assignee
    assignments = None
    if filter_by_assignee:
        assignments = await assignment_repo.list_all_for_user(user.id)

    planned_window_by_task = None
    if apply_plan_constraints:
        planned_window_by_task = await load_plan_windows(user, tasks, project_repo, snapshot_repo)

    schedule = scheduler_service.build_schedule(
        tasks,
        project_priorities=project_priorities,
        start_date=target_date,
        capacity_hours=effective_capacity,
        capacity_by_weekday=effective_weekly,
        max_days=max_days,
        current_user_id=user.id,
        assignments=assignments,
        filter_by_assignee=filter_by_assignee,
        planned_window_by_task=planned_window_by_task,
    )
    return scheduler_service.get_today_tasks(
        schedule,
        tasks,
        project_priorities=project_priorities,
        today=target_date or date.today(),
    )


@router.get("/{task_id}", response_model=Task)
async def get_task(
    task_id: UUID,
    user: CurrentUser,
    repo: TaskRepo,
    project_repo: ProjectRepo,
):
    """Get a task by ID."""
    # First try personal access (Inbox tasks)
    task = await repo.get(user.id, task_id)
    if task:
        return task
    
    # If not found, try to find via projects user has access to
    projects = await project_repo.list(user.id, limit=1000)
    for project in projects:
        task = await repo.get(user.id, task_id, project_id=project.id)
        if task:
            return task
    
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Task {task_id} not found",
    )


@router.patch("/{task_id}", response_model=Task)
async def update_task(
    task_id: UUID,
    update: TaskUpdate,
    user: CurrentUser,
    repo: TaskRepo,
    project_repo: ProjectRepo,
):
    """Update a task."""
    # Find task - try personal access first, then project-based
    current_task = await repo.get(user.id, task_id)
    task_project_id = None
    
    if not current_task:
        # Try to find via projects user has access to
        projects = await project_repo.list(user.id, limit=1000)
        for project in projects:
            current_task = await repo.get(user.id, task_id, project_id=project.id)
            if current_task:
                task_project_id = project.id
                break
    else:
        task_project_id = current_task.project_id
    
    if not current_task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task {task_id} not found",
        )

    # Validate dependencies before updating
    if update.dependency_ids is not None or update.parent_id is not None:
        validator = DependencyValidator(repo)

        try:
            new_dependency_ids = (
                update.dependency_ids
                if update.dependency_ids is not None
                else current_task.dependency_ids
            )
            new_parent_id = (
                update.parent_id
                if update.parent_id is not None
                else current_task.parent_id
            )

            if new_dependency_ids:
                await validator.validate_dependencies(
                    task_id,
                    new_dependency_ids,
                    user.id,
                    new_parent_id,
                    project_id=task_project_id,
                )

            if update.parent_id is not None:
                await validator.validate_parent_child_consistency(
                    task_id,
                    update.parent_id,
                    user.id,
                )

        except BusinessLogicError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(e),
            )

    try:
        return await repo.update(user.id, task_id, update, project_id=task_project_id)
    except NotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(
    task_id: UUID,
    user: CurrentUser,
    repo: TaskRepo,
):
    """Delete a task."""
    deleted = await repo.delete(user.id, task_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task {task_id} not found",
        )


@router.post("/{task_id}/breakdown", response_model=BreakdownResponse)
async def breakdown_task(
    task_id: UUID,
    user: CurrentUser,
    repo: TaskRepo,
    project_repo: ProjectRepo,
    memory_repo: MemoryRepo,
    assignment_repo: TaskAssignmentRepo,
    llm_provider: LLMProvider,
    request: BreakdownRequest = BreakdownRequest(),
):
    """
    Break down a task into micro-steps.

    Uses the Planner Agent to decompose large tasks into
    manageable 5-15 minute steps for ADHD users.

    Optionally creates subtasks from the breakdown.
    Subtasks inherit the parent task's assignees.
    """
    try:
        # Check permissions (Owner or Project Member)
        task = await repo.get(user.id, task_id)
        if not task:
            # Not owner, check if member of project
            tasks = await repo.get_many([task_id])
            if tasks:
                t = tasks[0]
                if t.project_id:
                    # Check project access
                    project = await project_repo.get(user.id, t.project_id)
                    if project:
                        task = t

        if not task:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Task {task_id} not found",
            )

        service = PlannerService(
            llm_provider=llm_provider,
            task_repo=repo,
            memory_repo=memory_repo,
            project_repo=project_repo,
            assignment_repo=assignment_repo,
        )
        return await service.breakdown_task(
            user_id=user.id,
            task_id=task_id,
            create_subtasks=request.create_subtasks,
            instruction=request.instruction,
            task_obj=task,
        )
    except NotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )
    except LLMValidationError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Failed to parse LLM output: {e.message}",
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Breakdown failed: {str(e)}",
        )


@router.get("/{task_id}/subtasks", response_model=list[Task])
async def get_subtasks(
    task_id: UUID,
    user: CurrentUser,
    repo: TaskRepo,
):
    """Get all subtasks of a parent task."""
    return await repo.get_subtasks(user.id, task_id)


def _extract_action_items(text: str) -> list[str]:
    items: list[str] = []
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        for prefix in ("- [ ]", "* [ ]", "- TODO", "* TODO", "TODO:"):
            if line.startswith(prefix):
                line = line[len(prefix):].strip()
                break
        else:
            continue
        if line and line not in items:
            items.append(line)
    return items


@router.post("/{task_id}/action-items", response_model=list[Task], status_code=status.HTTP_201_CREATED)
async def create_action_items(
    task_id: UUID,
    user: CurrentUser,
    repo: TaskRepo,
    project_repo: ProjectRepo,
):
    """Create action item subtasks from meeting notes."""
    task, _ = await _get_task_or_404(user, repo, task_id, project_repo)
    if not task.meeting_notes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="meeting_notes is empty",
        )
    action_items = _extract_action_items(task.meeting_notes)
    if not action_items:
        return []

    existing_subtasks = await repo.get_subtasks(user.id, task_id)
    existing_titles = {subtask.title for subtask in existing_subtasks}
    max_order = max([subtask.order_in_parent or 0 for subtask in existing_subtasks] + [0])

    created_subtasks: list[Task] = []
    for index, title in enumerate(action_items, start=1):
        if title in existing_titles:
            continue
        created = await repo.create(
            user.id,
            TaskCreate(
                title=title,
                project_id=task.project_id,
                phase_id=task.phase_id,
                parent_id=task.id,
                order_in_parent=max_order + index,
                created_by=CreatedBy.AGENT,
            ),
        )
        created_subtasks.append(created)

    return created_subtasks


@router.get("/{task_id}/assignment", response_model=TaskAssignment)
async def get_task_assignment(
    task_id: UUID,
    user: CurrentUser,
    repo: TaskRepo,
    project_repo: ProjectRepo,
    assignment_repo: TaskAssignmentRepo,
):
    """Get assignment for a task (returns first assignee)."""
    _, owner_user_id = await _get_task_or_404(user, repo, task_id, project_repo)
    assignment = await assignment_repo.get_by_task(owner_user_id, task_id)
    if not assignment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Assignment for task {task_id} not found",
        )
    return assignment


@router.get("/{task_id}/assignments", response_model=list[TaskAssignment])
async def list_task_assignments(
    task_id: UUID,
    user: CurrentUser,
    repo: TaskRepo,
    project_repo: ProjectRepo,
    assignment_repo: TaskAssignmentRepo,
):
    """List all assignments for a task (multiple assignees)."""
    _, owner_user_id = await _get_task_or_404(user, repo, task_id, project_repo)
    return await assignment_repo.list_by_task(owner_user_id, task_id)


@router.post("/{task_id}/assignment", response_model=TaskAssignment, status_code=status.HTTP_201_CREATED)
async def assign_task(
    task_id: UUID,
    assignment: TaskAssignmentCreate,
    user: CurrentUser,
    repo: TaskRepo,
    project_repo: ProjectRepo,
    assignment_repo: TaskAssignmentRepo,
):
    """Assign a task to a member (upsert)."""
    _, owner_user_id = await _get_task_or_404(user, repo, task_id, project_repo)
    return await assignment_repo.assign(owner_user_id, task_id, assignment)


@router.put("/{task_id}/assignments", response_model=list[TaskAssignment])
async def assign_task_multiple(
    task_id: UUID,
    assignments: TaskAssignmentsCreate,
    user: CurrentUser,
    repo: TaskRepo,
    project_repo: ProjectRepo,
    assignment_repo: TaskAssignmentRepo,
):
    """Assign a task to multiple members. Replaces existing assignments."""
    _, owner_user_id = await _get_task_or_404(user, repo, task_id, project_repo)
    return await assignment_repo.assign_multiple(owner_user_id, task_id, assignments)


@router.patch("/assignments/{assignment_id}", response_model=TaskAssignment)
async def update_task_assignment(
    assignment_id: UUID,
    update: TaskAssignmentUpdate,
    user: CurrentUser,
    repo: TaskRepo,
    project_repo: ProjectRepo,
    assignment_repo: TaskAssignmentRepo,
):
    """Update assignment fields."""
    # First get the assignment to find the task_id
    assignment = await assignment_repo.get_by_id(assignment_id)
    if not assignment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Assignment {assignment_id} not found",
        )

    # Verify project access and get owner_user_id
    _, owner_user_id = await _get_task_or_404(user, repo, assignment.task_id, project_repo)

    try:
        return await assignment_repo.update(owner_user_id, assignment_id, update)
    except NotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        )


@router.delete("/{task_id}/assignment", status_code=status.HTTP_204_NO_CONTENT)
async def unassign_task(
    task_id: UUID,
    user: CurrentUser,
    repo: TaskRepo,
    project_repo: ProjectRepo,
    assignment_repo: TaskAssignmentRepo,
):
    """Remove assignment from a task."""
    _, owner_user_id = await _get_task_or_404(user, repo, task_id, project_repo)
    deleted = await assignment_repo.delete_by_task(owner_user_id, task_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Assignment for task {task_id} not found",
        )


@router.get("/{task_id}/blockers", response_model=list[Blocker])
async def list_task_blockers(
    task_id: UUID,
    user: CurrentUser,
    repo: TaskRepo,
    project_repo: ProjectRepo,
    blocker_repo: BlockerRepo,
):
    """List blockers for a task."""
    _, owner_user_id = await _get_task_or_404(user, repo, task_id, project_repo)
    return await blocker_repo.list_by_task(owner_user_id, task_id)


@router.post("/{task_id}/blockers", response_model=Blocker, status_code=status.HTTP_201_CREATED)
async def create_task_blocker(
    task_id: UUID,
    blocker: BlockerCreate,
    user: CurrentUser,
    repo: TaskRepo,
    project_repo: ProjectRepo,
    blocker_repo: BlockerRepo,
):
    """Create a blocker for a task."""
    _, owner_user_id = await _get_task_or_404(user, repo, task_id, project_repo)
    return await blocker_repo.create(owner_user_id, task_id, blocker)


@router.patch("/blockers/{blocker_id}", response_model=Blocker)
async def update_task_blocker(
    blocker_id: UUID,
    update: BlockerUpdate,
    user: CurrentUser,
    repo: TaskRepo,
    project_repo: ProjectRepo,
    blocker_repo: BlockerRepo,
):
    """Update a blocker."""
    # First get the blocker to find the task_id
    blocker = await blocker_repo.get_by_id(blocker_id)
    if not blocker:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Blocker {blocker_id} not found",
        )

    # Verify project access and get owner_user_id
    _, owner_user_id = await _get_task_or_404(user, repo, blocker.task_id, project_repo)

    try:
        return await blocker_repo.update(owner_user_id, blocker_id, update)
    except NotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        )

