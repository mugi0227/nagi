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
    TaskAssignmentRepo,
    TaskRepo,
)
from app.core.exceptions import LLMValidationError, NotFoundError
from app.models.breakdown import BreakdownRequest, BreakdownResponse
from app.models.collaboration import (
    Blocker,
    BlockerCreate,
    BlockerUpdate,
    TaskAssignment,
    TaskAssignmentCreate,
    TaskAssignmentUpdate,
)
from app.models.schedule import ScheduleResponse, TodayTasksResponse
from app.models.task import Task, TaskCreate, TaskUpdate
from app.services.planner_service import PlannerService
from app.services.scheduler_service import SchedulerService

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


async def _get_task_or_404(user: CurrentUser, repo: TaskRepo, task_id: UUID) -> Task:
    task = await repo.get(user.id, task_id)
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task {task_id} not found",
        )
    return task


@router.post("", response_model=Task, status_code=status.HTTP_201_CREATED)
async def create_task(
    task: TaskCreate,
    user: CurrentUser,
    repo: TaskRepo,
):
    """Create a new task."""
    return await repo.create(user.id, task)


@router.get("", response_model=list[Task])
async def list_tasks(
    user: CurrentUser,
    repo: TaskRepo,
    project_id: Optional[UUID] = Query(None, description="Filter by project ID"),
    status: Optional[str] = Query(None, description="Filter by status"),
    include_done: bool = Query(False, description="Include completed tasks"),
    only_meetings: bool = Query(False, description="会議のみ取得"),
    exclude_meetings: bool = Query(False, description="会議を除外"),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
):
    """List tasks with optional filters."""
    tasks = await repo.list(
        user.id,
        project_id=project_id,
        status=status,
        include_done=include_done,
        limit=limit,
        offset=offset,
    )

    # Apply meeting filters in-memory (simple KISS approach)
    if only_meetings:
        tasks = [t for t in tasks if t.is_fixed_time]
    elif exclude_meetings:
        tasks = [t for t in tasks if not t.is_fixed_time]

    return tasks


@router.get("/schedule", response_model=ScheduleResponse)
async def get_task_schedule(
    user: CurrentUser,
    repo: TaskRepo,
    project_repo: ProjectRepo,
    scheduler_service: SchedulerService = Depends(get_scheduler_service),
    start_date: Optional[date] = Query(None, description="Schedule start date"),
    capacity_hours: Optional[float] = Query(None, description="Daily capacity in hours (default: 8)"),
    buffer_hours: Optional[float] = Query(None, description="Daily buffer hours"),
    capacity_by_weekday: Optional[str] = Query(
        None,
        description="JSON array of 7 daily capacity values (Sun..Sat)",
    ),
    max_days: int = Query(60, ge=1, le=365, description="Maximum days to schedule"),
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
    return scheduler_service.build_schedule(
        tasks,
        project_priorities=project_priorities,
        start_date=start_date,
        capacity_hours=effective_capacity,
        capacity_by_weekday=effective_weekly,
        max_days=max_days,
    )


@router.get("/today", response_model=TodayTasksResponse)
async def get_today_tasks(
    user: CurrentUser,
    repo: TaskRepo,
    project_repo: ProjectRepo,
    scheduler_service: SchedulerService = Depends(get_scheduler_service),
    target_date: Optional[date] = Query(None, description="Target date (default: today)"),
    capacity_hours: Optional[float] = Query(None, description="Daily capacity in hours (default: 8)"),
    buffer_hours: Optional[float] = Query(None, description="Daily buffer hours"),
    capacity_by_weekday: Optional[str] = Query(
        None,
        description="JSON array of 7 daily capacity values (Sun..Sat)",
    ),
    max_days: int = Query(30, ge=1, le=365, description="Maximum days to schedule"),
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
    schedule = scheduler_service.build_schedule(
        tasks,
        project_priorities=project_priorities,
        start_date=target_date,
        capacity_hours=effective_capacity,
        capacity_by_weekday=effective_weekly,
        max_days=max_days,
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
):
    """Get a task by ID."""
    task = await repo.get(user.id, task_id)
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task {task_id} not found",
        )
    return task


@router.patch("/{task_id}", response_model=Task)
async def update_task(
    task_id: UUID,
    update: TaskUpdate,
    user: CurrentUser,
    repo: TaskRepo,
):
    """Update a task."""
    try:
        return await repo.update(user.id, task_id, update)
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
    memory_repo: MemoryRepo,
    llm_provider: LLMProvider,
    request: BreakdownRequest = BreakdownRequest(),
):
    """
    Break down a task into micro-steps.

    Uses the Planner Agent to decompose large tasks into
    manageable 5-15 minute steps for ADHD users.

    Optionally creates subtasks from the breakdown.
    """
    try:
        service = PlannerService(
            llm_provider=llm_provider,
            task_repo=repo,
            memory_repo=memory_repo,
        )
        return await service.breakdown_task(
            user_id=user.id,
            task_id=task_id,
            create_subtasks=request.create_subtasks,
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


@router.get("/{task_id}/assignment", response_model=TaskAssignment)
async def get_task_assignment(
    task_id: UUID,
    user: CurrentUser,
    repo: TaskRepo,
    assignment_repo: TaskAssignmentRepo,
):
    """Get assignment for a task."""
    await _get_task_or_404(user, repo, task_id)
    assignment = await assignment_repo.get_by_task(user.id, task_id)
    if not assignment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Assignment for task {task_id} not found",
        )
    return assignment


@router.post("/{task_id}/assignment", response_model=TaskAssignment, status_code=status.HTTP_201_CREATED)
async def assign_task(
    task_id: UUID,
    assignment: TaskAssignmentCreate,
    user: CurrentUser,
    repo: TaskRepo,
    assignment_repo: TaskAssignmentRepo,
):
    """Assign a task to a member (upsert)."""
    await _get_task_or_404(user, repo, task_id)
    return await assignment_repo.assign(user.id, task_id, assignment)


@router.patch("/assignments/{assignment_id}", response_model=TaskAssignment)
async def update_task_assignment(
    assignment_id: UUID,
    update: TaskAssignmentUpdate,
    user: CurrentUser,
    assignment_repo: TaskAssignmentRepo,
):
    """Update assignment fields."""
    try:
        return await assignment_repo.update(user.id, assignment_id, update)
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
    assignment_repo: TaskAssignmentRepo,
):
    """Remove assignment from a task."""
    await _get_task_or_404(user, repo, task_id)
    deleted = await assignment_repo.delete_by_task(user.id, task_id)
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
    blocker_repo: BlockerRepo,
):
    """List blockers for a task."""
    await _get_task_or_404(user, repo, task_id)
    return await blocker_repo.list_by_task(user.id, task_id)


@router.post("/{task_id}/blockers", response_model=Blocker, status_code=status.HTTP_201_CREATED)
async def create_task_blocker(
    task_id: UUID,
    blocker: BlockerCreate,
    user: CurrentUser,
    repo: TaskRepo,
    blocker_repo: BlockerRepo,
):
    """Create a blocker for a task."""
    await _get_task_or_404(user, repo, task_id)
    return await blocker_repo.create(user.id, task_id, blocker)


@router.patch("/blockers/{blocker_id}", response_model=Blocker)
async def update_task_blocker(
    blocker_id: UUID,
    update: BlockerUpdate,
    user: CurrentUser,
    blocker_repo: BlockerRepo,
):
    """Update a blocker."""
    try:
        return await blocker_repo.update(user.id, blocker_id, update)
    except NotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        )

