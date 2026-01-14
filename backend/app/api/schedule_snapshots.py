"""
Schedule snapshots API endpoints.

Provides endpoints for managing schedule baseline snapshots.
"""

from __future__ import annotations

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import (
    CurrentUser,
    PhaseRepo,
    TaskRepo,
    ProjectMemberRepo,
    TaskAssignmentRepo,
)
from app.interfaces.schedule_snapshot_repository import IScheduleSnapshotRepository
from app.models.schedule_snapshot import (
    ScheduleDiff,
    ScheduleSnapshot,
    ScheduleSnapshotCreate,
    ScheduleSnapshotSummary,
)
from app.services.ccpm_service import CCPMService
from app.services.schedule_diff_service import ScheduleDiffService
from app.services.scheduler_service import SchedulerService

router = APIRouter()


def get_schedule_snapshot_repository() -> IScheduleSnapshotRepository:
    """Get schedule snapshot repository instance."""
    from app.core.config import get_settings
    settings = get_settings()
    if settings.is_gcp:
        raise NotImplementedError("Schedule snapshot repository not implemented for GCP")
    from app.infrastructure.local.schedule_snapshot_repository import SqliteScheduleSnapshotRepository
    return SqliteScheduleSnapshotRepository()


SnapshotRepo = IScheduleSnapshotRepository


@router.post(
    "/projects/{project_id}/schedule-snapshots",
    response_model=ScheduleSnapshot,
    status_code=status.HTTP_201_CREATED,
)
async def create_snapshot(
    project_id: UUID,
    snapshot_data: ScheduleSnapshotCreate,
    current_user: CurrentUser,
    task_repo: TaskRepo,
    phase_repo: PhaseRepo,
    member_repo: ProjectMemberRepo,
    assignment_repo: TaskAssignmentRepo,
    snapshot_repo: IScheduleSnapshotRepository = Depends(get_schedule_snapshot_repository),
):
    """
    Create a new schedule snapshot (baseline).

    Generates a schedule from current tasks and saves it as a baseline.
    The new snapshot is automatically activated.
    """
    # Get all tasks for the project
    tasks = await task_repo.list(
        user_id=current_user.id,
        project_id=project_id,
        include_done=False,
    )

    if not tasks:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No tasks found for this project",
        )

    # Get phases for buffer calculation
    phases = await phase_repo.list_by_project(current_user.id, project_id)
    phase_dicts = [{"id": p.id, "name": p.name} for p in phases]

    # Get members and assignments for capacity calculation
    members = await member_repo.list(current_user.id, project_id)
    assignments = await assignment_repo.list_by_project(current_user.id, project_id)

    # Build schedule
    scheduler = SchedulerService()
    schedule = scheduler.build_schedule(
        tasks=tasks,
        start_date=None,  # Use today
        capacity_hours=snapshot_data.capacity_hours,
        capacity_by_weekday=snapshot_data.capacity_by_weekday,
        max_days=snapshot_data.max_days,
        members=members,
        assignments=assignments,
    )

    # Calculate CCPM buffers
    ccpm = CCPMService(default_buffer_ratio=snapshot_data.buffer_ratio)
    phase_buffers = ccpm.calculate_phase_buffers(tasks, phase_dicts, snapshot_data.buffer_ratio)

    # Calculate total buffer
    total_buffer = sum(pb.total_buffer_minutes for pb in phase_buffers)

    # Create task lookup for phase_id and dependency_ids
    task_lookup = {task.id: task for task in tasks}

    # Convert TaskScheduleInfo to SnapshotTaskScheduleInfo format
    from app.models.schedule_snapshot import SnapshotTaskScheduleInfo, SnapshotDayAllocation
    snapshot_tasks = [
        SnapshotTaskScheduleInfo(
            task_id=t.task_id,
            title=t.title,
            project_id=t.project_id,
            phase_id=task_lookup[t.task_id].phase_id if t.task_id in task_lookup else None,
            parent_id=t.parent_id,
            planned_start=t.planned_start,
            planned_end=t.planned_end,
            total_minutes=t.total_minutes,
            dependency_ids=task_lookup[t.task_id].dependency_ids if t.task_id in task_lookup else [],
        )
        for t in schedule.tasks
    ]

    # Convert ScheduleDay to SnapshotDayAllocation format
    snapshot_days = [
        SnapshotDayAllocation(
            date=d.date,
            capacity_minutes=d.capacity_minutes,
            allocated_minutes=d.allocated_minutes,
            task_allocations=[
                {"task_id": str(a.task_id), "minutes": a.minutes}
                for a in d.task_allocations
            ],
        )
        for d in schedule.days
    ]

    # Prepare schedule data
    schedule_data = {
        "start_date": schedule.start_date,
        "tasks": snapshot_tasks,
        "days": snapshot_days,
        "phase_buffers": phase_buffers,
        "total_buffer_minutes": total_buffer,
    }

    # Create snapshot
    snapshot = await snapshot_repo.create(
        user_id=current_user.id,
        project_id=project_id,
        snapshot=snapshot_data,
        schedule_data=schedule_data,
    )

    return snapshot


@router.get(
    "/projects/{project_id}/schedule-snapshots",
    response_model=list[ScheduleSnapshotSummary],
)
async def list_snapshots(
    project_id: UUID,
    current_user: CurrentUser,
    limit: int = 20,
    offset: int = 0,
    snapshot_repo: IScheduleSnapshotRepository = Depends(get_schedule_snapshot_repository),
):
    """List all snapshots for a project."""
    return await snapshot_repo.list_by_project(
        user_id=current_user.id,
        project_id=project_id,
        limit=limit,
        offset=offset,
    )


@router.get(
    "/projects/{project_id}/schedule-snapshots/active",
    response_model=Optional[ScheduleSnapshot],
)
async def get_active_snapshot(
    project_id: UUID,
    current_user: CurrentUser,
    snapshot_repo: IScheduleSnapshotRepository = Depends(get_schedule_snapshot_repository),
):
    """Get the currently active snapshot for a project."""
    return await snapshot_repo.get_active(
        user_id=current_user.id,
        project_id=project_id,
    )


# NOTE: This route MUST be before /{snapshot_id} to avoid "diff" being parsed as UUID
@router.get(
    "/projects/{project_id}/schedule-snapshots/diff",
    response_model=ScheduleDiff,
)
async def get_snapshot_diff(
    project_id: UUID,
    current_user: CurrentUser,
    task_repo: TaskRepo,
    phase_repo: PhaseRepo,
    member_repo: ProjectMemberRepo,
    assignment_repo: TaskAssignmentRepo,
    snapshot_id: Optional[UUID] = None,
    snapshot_repo: IScheduleSnapshotRepository = Depends(get_schedule_snapshot_repository),
):
    """
    Get the difference between a baseline snapshot and current schedule.

    If snapshot_id is not provided, uses the active snapshot.
    """
    # Get the snapshot to compare against
    if snapshot_id:
        snapshot = await snapshot_repo.get(
            user_id=current_user.id,
            snapshot_id=snapshot_id,
        )
    else:
        snapshot = await snapshot_repo.get_active(
            user_id=current_user.id,
            project_id=project_id,
        )

    if not snapshot:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No baseline snapshot found",
        )

    # Get current tasks and schedule
    tasks = await task_repo.list(
        user_id=current_user.id,
        project_id=project_id,
        include_done=True,
    )

    # Get members and assignments for capacity calculation
    members = await member_repo.list(current_user.id, project_id)
    assignments = await assignment_repo.list_by_project(current_user.id, project_id)

    scheduler = SchedulerService()
    current_schedule = scheduler.build_schedule(
        tasks=[t for t in tasks if t.status != "DONE"],
        start_date=None,
        capacity_hours=snapshot.capacity_hours,
        capacity_by_weekday=snapshot.capacity_by_weekday,
        max_days=snapshot.max_days,
        members=members,
        assignments=assignments,
    )

    # Get completed task IDs
    completed_task_ids = {t.id for t in tasks if t.status == "DONE"}

    # Get phases
    phases = await phase_repo.list_by_project(current_user.id, project_id)
    phase_dicts = [{"id": p.id, "name": p.name} for p in phases]

    # Calculate diff
    diff_service = ScheduleDiffService()
    diff = diff_service.calculate_diff(
        snapshot=snapshot,
        current_schedule=current_schedule,
        completed_task_ids=completed_task_ids,
        phases=phase_dicts,
    )

    # Update snapshot's consumed buffer based on phase delays
    total_consumed = sum(
        max(0, pd.delay_days * 8 * 60)  # Convert delay days to minutes
        for pd in diff.phase_diffs
    )

    if total_consumed != snapshot.consumed_buffer_minutes:
        await snapshot_repo.update_consumed_buffer(
            user_id=current_user.id,
            snapshot_id=snapshot.id,
            consumed_buffer_minutes=total_consumed,
        )

    return diff


@router.get(
    "/projects/{project_id}/schedule-snapshots/{snapshot_id}",
    response_model=ScheduleSnapshot,
)
async def get_snapshot(
    project_id: UUID,
    snapshot_id: UUID,
    current_user: CurrentUser,
    snapshot_repo: IScheduleSnapshotRepository = Depends(get_schedule_snapshot_repository),
):
    """Get a specific snapshot by ID."""
    snapshot = await snapshot_repo.get(
        user_id=current_user.id,
        snapshot_id=snapshot_id,
    )
    if not snapshot:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Snapshot not found",
        )
    if snapshot.project_id != project_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Snapshot not found in this project",
        )
    return snapshot


@router.post(
    "/projects/{project_id}/schedule-snapshots/{snapshot_id}/activate",
    response_model=ScheduleSnapshot,
)
async def activate_snapshot(
    project_id: UUID,
    snapshot_id: UUID,
    current_user: CurrentUser,
    snapshot_repo: IScheduleSnapshotRepository = Depends(get_schedule_snapshot_repository),
):
    """Activate a snapshot as the current baseline."""
    try:
        snapshot = await snapshot_repo.activate(
            user_id=current_user.id,
            snapshot_id=snapshot_id,
        )
        if snapshot.project_id != project_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Snapshot not found in this project",
            )
        return snapshot
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )


@router.delete(
    "/projects/{project_id}/schedule-snapshots/{snapshot_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_snapshot(
    project_id: UUID,
    snapshot_id: UUID,
    current_user: CurrentUser,
    snapshot_repo: IScheduleSnapshotRepository = Depends(get_schedule_snapshot_repository),
):
    """Delete a snapshot."""
    # First verify it belongs to this project
    snapshot = await snapshot_repo.get(
        user_id=current_user.id,
        snapshot_id=snapshot_id,
    )
    if not snapshot:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Snapshot not found",
        )
    if snapshot.project_id != project_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Snapshot not found in this project",
        )

    await snapshot_repo.delete(
        user_id=current_user.id,
        snapshot_id=snapshot_id,
    )
