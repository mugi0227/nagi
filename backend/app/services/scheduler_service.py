"""
Scheduler service for capacity-aware task scheduling.

Handles task scheduling with capacity constraints and dependency resolution.
"""

from datetime import date, datetime, timedelta
from typing import Optional
from uuid import UUID

from app.core.logger import setup_logger
from app.models.enums import EnergyLevel, Priority, TaskStatus
from app.models.schedule import (
    ScheduleDay,
    TaskAllocation,
    TaskScheduleInfo,
    ScheduleResponse,
    TodayTasksResponse,
    TodayTaskAllocation,
    UnscheduledTask,
    ExcludedTask,
)
from app.models.collaboration import TaskAssignment
from app.models.task import Task
from app.services.task_utils import get_effective_estimated_minutes, get_remaining_minutes, is_parent_task

logger = setup_logger(__name__)


class SchedulerService:
    """
    Service for capacity-aware task scheduling.

    Provides:
    - Capacity calculation (daily work hour limits)
    - Overflow detection and suggestions
    - Dependency-aware scheduling
    """

    def __init__(
        self,
        default_capacity_hours: float = 8.0,
        default_task_minutes: int = 60,
        project_priority_weight: float = 0.05,
        energy_high_ratio: float = 0.4,
        energy_low_ratio: float = 0.6,
    ):
        """
        Initialize scheduler service.

        Args:
            default_capacity_hours: Default daily capacity in hours
        """
        self.default_capacity_hours = default_capacity_hours
        self.default_task_minutes = default_task_minutes
        self.project_priority_weight = project_priority_weight
        self.energy_high_ratio = energy_high_ratio
        self.energy_low_ratio = energy_low_ratio

    def check_schedule_feasibility(
        self,
        tasks: list[Task],
        capacity_hours: Optional[float] = None,
    ) -> dict:
        """
        Check if tasks fit within daily capacity.

        Args:
            tasks: List of tasks to schedule
            capacity_hours: Daily capacity in hours (None = use default)

        Returns:
            Dictionary with:
                - feasible: bool
                - total_minutes: int
                - capacity_minutes: int
                - overflow_minutes: int
                - tasks_that_fit: list[Task]
                - overflow_tasks: list[Task]
        """
        capacity = capacity_hours or self.default_capacity_hours
        capacity_minutes = int(capacity * 60)

        # Calculate total estimated time
        total_minutes = 0
        tasks_with_time = []
        tasks_without_time = []

        for task in tasks:
            # Use effective estimated minutes (considers subtasks)
            effective_minutes = get_effective_estimated_minutes(task, tasks)
            if effective_minutes > 0:
                total_minutes += effective_minutes
                tasks_with_time.append(task)
            else:
                tasks_without_time.append(task)

        # Assume 15 minutes for tasks without estimates
        total_minutes += len(tasks_without_time) * self.default_task_minutes

        # Check feasibility
        feasible = total_minutes <= capacity_minutes
        overflow_minutes = max(0, total_minutes - capacity_minutes)

        # Determine which tasks fit
        tasks_that_fit = []
        overflow_tasks = []
        accumulated_minutes = 0

        # Prioritize tasks with estimates first (already scored by caller)
        for task in tasks_with_time:
            # Use effective estimated minutes (considers subtasks)
            task_minutes = get_effective_estimated_minutes(task, tasks)
            if accumulated_minutes + task_minutes <= capacity_minutes:
                tasks_that_fit.append(task)
                accumulated_minutes += task_minutes
            else:
                overflow_tasks.append(task)

        # Add tasks without estimates if space remains
        for task in tasks_without_time:
            if accumulated_minutes + self.default_task_minutes <= capacity_minutes:
                tasks_that_fit.append(task)
                accumulated_minutes += self.default_task_minutes
            else:
                overflow_tasks.append(task)

        result = {
            "feasible": feasible,
            "total_minutes": total_minutes,
            "capacity_minutes": capacity_minutes,
            "overflow_minutes": overflow_minutes,
            "tasks_that_fit": tasks_that_fit,
            "overflow_tasks": overflow_tasks,
            "capacity_usage_percent": (
                min(100, int((total_minutes / capacity_minutes) * 100))
                if capacity_minutes > 0
                else 0
            ),
        }

        logger.info(
            f"Capacity check: {len(tasks_that_fit)}/{len(tasks)} tasks fit "
            f"({total_minutes}/{capacity_minutes} min, "
            f"{result['capacity_usage_percent']}% capacity)"
        )

        return result

    def suggest_overflow_actions(self, overflow_tasks: list[Task]) -> str:
        """
        Generate human-friendly suggestion for overflow tasks.

        Args:
            overflow_tasks: Tasks that don't fit in today's capacity

        Returns:
            Suggestion message
        """
        if not overflow_tasks:
            return ""

        task_count = len(overflow_tasks)
        task_titles = [task.title for task in overflow_tasks[:3]]

        if task_count == 1:
            message = (
                f"タスク「{task_titles[0]}」は今日の時間内に収まりません。"
                f"明日に回しますか？"
            )
        elif task_count <= 3:
            titles = "、".join(task_titles)
            message = (
                f"{task_count}件のタスク（{titles}）が今日の時間内に収まりません。"
                f"明日に回しますか？"
            )
        else:
            titles = "、".join(task_titles)
            remaining = task_count - 3
            message = (
                f"{task_count}件のタスク（{titles}、他{remaining}件）が"
                f"今日の時間内に収まりません。明日に回しますか？"
            )

        return message

    def _get_meetings_for_day(
        self,
        tasks: list[Task],
        target_date: date,
    ) -> tuple[list[Task], int]:
        """
        Get meetings scheduled for a specific day and calculate total duration.

        Handles overlapping meetings by merging time intervals to avoid
        double-counting overlapping periods.

        Args:
            tasks: All tasks
            target_date: Date to check

        Returns:
            (list of meeting tasks, total meeting minutes accounting for overlaps)
        """
        meetings = [
            task for task in tasks
            if task.is_fixed_time
            and task.start_time
            and task.start_time.date() == target_date
        ]

        if not meetings:
            return meetings, 0

        # Create list of time intervals (start_minutes, end_minutes from midnight)
        intervals = []
        for meeting in meetings:
            if meeting.end_time and meeting.start_time:
                # Convert to minutes from midnight for easier calculation
                start_mins = meeting.start_time.hour * 60 + meeting.start_time.minute
                end_mins = meeting.end_time.hour * 60 + meeting.end_time.minute

                # Handle meetings that span midnight (rare but possible)
                if end_mins < start_mins:
                    end_mins = 24 * 60  # Cap at end of day

                intervals.append((start_mins, end_mins))

        # Sort intervals by start time
        intervals.sort()

        # Merge overlapping intervals
        merged = []
        for start, end in intervals:
            if merged and start <= merged[-1][1]:
                # Overlaps with previous interval, merge them
                merged[-1] = (merged[-1][0], max(merged[-1][1], end))
            else:
                # No overlap, add as new interval
                merged.append((start, end))

        # Calculate total minutes from merged intervals
        total_minutes = sum(end - start for start, end in merged)

        return meetings, total_minutes

    def build_schedule(
        self,
        tasks: list[Task],
        project_priorities: dict[UUID, int] | None = None,
        start_date: Optional[date] = None,
        capacity_hours: Optional[float] = None,
        capacity_by_weekday: Optional[list[float]] = None,
        max_days: int = 60,
        current_user_id: Optional[str] = None,
        assignments: Optional[list[TaskAssignment]] = None,
        filter_by_assignee: bool = False,
    ) -> ScheduleResponse:
        """
        Build a capacity-aware schedule across multiple days.

        - Tasks can span multiple days.
        - Dependencies are respected.
        """
        if not tasks:
            start = start_date or date.today()
            return ScheduleResponse(
                start_date=start,
                days=[],
                tasks=[],
                unscheduled_task_ids=[],
                excluded_tasks=[],
            )

        start = start_date or date.today()
        project_priorities = project_priorities or {}
        capacity_by_weekday = capacity_by_weekday if capacity_by_weekday and len(capacity_by_weekday) == 7 else None

        def capacity_minutes_for_day(day: date) -> int:
            if capacity_by_weekday:
                weekday_index = (day.weekday() + 1) % 7
                hours = capacity_by_weekday[weekday_index]
            else:
                hours = capacity_hours or self.default_capacity_hours
            return max(0, int(hours * 60))

        all_task_map = {task.id: task for task in tasks}

        def get_parent_info(task: Task) -> tuple[Optional[UUID], Optional[str]]:
            if not task.parent_id:
                return None, None
            parent = all_task_map.get(task.parent_id)
            return task.parent_id, parent.title if parent else None

        excluded_tasks: list[ExcludedTask] = []
        for task in tasks:
            reason: Optional[str] = None
            if task.status == TaskStatus.WAITING:
                reason = "waiting"
            elif is_parent_task(task, tasks):
                reason = "parent_task"
            if reason:
                parent_id, parent_title = get_parent_info(task)
                excluded_tasks.append(
                    ExcludedTask(
                        task_id=task.id,
                        title=task.title,
                        reason=reason,
                        parent_id=parent_id,
                        parent_title=parent_title,
                    )
                )

        # Filter tasks to schedule (exclude DONE, WAITING, parent tasks, and fixed-time meetings)
        candidate_tasks = [
            task
            for task in tasks
            if task.status != TaskStatus.DONE
            and task.status != TaskStatus.WAITING
            and not is_parent_task(task, tasks)
            and not task.is_fixed_time  # 会議は通常スケジューリング対象外
        ]

        # Filter by assignee if requested
        if filter_by_assignee and current_user_id and assignments is not None:
            assignment_map = {a.task_id: a.assignee_id for a in assignments}

            def is_my_task(task: Task) -> bool:
                # Personal tasks (no project_id) are always included
                if not task.project_id:
                    return True
                # Project tasks: check assignment
                assignee = assignment_map.get(task.id)
                if not assignee:
                    return True  # Unassigned tasks included by default
                return assignee == current_user_id

            candidate_tasks = [t for t in candidate_tasks if is_my_task(t)]

        candidate_ids = {task.id for task in candidate_tasks}

        blocked_task_ids: set[UUID] = set()
        unscheduled_reasons: dict[UUID, str] = {}
        for task in candidate_tasks:
            if not task.dependency_ids:
                continue
            reason: Optional[str] = None
            for dep_id in task.dependency_ids:
                dep_task = all_task_map.get(dep_id)
                if dep_task is None:
                    reason = "dependency_missing"
                    break
                if dep_task.status != TaskStatus.DONE and dep_id not in candidate_ids:
                    reason = "dependency_unresolved"
                    break
            if reason:
                blocked_task_ids.add(task.id)
                unscheduled_reasons[task.id] = reason

        scheduled_tasks = [task for task in candidate_tasks if task.id not in blocked_task_ids]

        if not scheduled_tasks:
            tasks_info = [
                TaskScheduleInfo(
                    task_id=task.id,
                    title=task.title,
                    project_id=task.project_id,
                    parent_id=get_parent_info(task)[0],
                    parent_title=get_parent_info(task)[1],
                    order_in_parent=task.order_in_parent,
                    due_date=task.due_date,
                    planned_start=None,
                    planned_end=None,
                    total_minutes=get_effective_estimated_minutes(task, tasks) or self.default_task_minutes,
                    priority_score=self._calculate_task_score(task, project_priorities, start),
                )
                for task in candidate_tasks
            ]
            unscheduled_items = [
                UnscheduledTask(task_id=task_id, reason=unscheduled_reasons.get(task_id, "dependency_unresolved"))
                for task_id in blocked_task_ids
            ]
            return ScheduleResponse(
                start_date=start,
                days=[],
                tasks=tasks_info,
                unscheduled_task_ids=unscheduled_items,
                excluded_tasks=excluded_tasks,
            )

        task_map = {task.id: task for task in scheduled_tasks}
        remaining_minutes: dict[UUID, int] = {}
        base_scores: dict[UUID, float] = {}

        for task in candidate_tasks:
            base_scores[task.id] = self._calculate_base_score(task, project_priorities)

        for task in scheduled_tasks:
            # Use remaining minutes (considering progress)
            minutes = get_remaining_minutes(task, tasks)
            if minutes <= 0:
                # If no remaining time based on progress, use effective estimate
                minutes = get_effective_estimated_minutes(task, tasks)
            remaining_minutes[task.id] = minutes if minutes > 0 else self.default_task_minutes

        # Build dependency graph within scheduled tasks
        task_ids = set(task_map.keys())
        dependents: dict[UUID, list[UUID]] = {task_id: [] for task_id in task_ids}
        indegree: dict[UUID, int] = {task_id: 0 for task_id in task_ids}

        for task in scheduled_tasks:
            relevant_deps = [dep_id for dep_id in task.dependency_ids if dep_id in task_ids]
            for dep_id in relevant_deps:
                dependents[dep_id].append(task.id)
                indegree[task.id] += 1

        ready = [task_id for task_id, count in indegree.items() if count == 0]
        in_progress: list[UUID] = []

        task_start: dict[UUID, date] = {}
        task_end: dict[UUID, date] = {}

        days: list[ScheduleDay] = []
        day_cursor = start
        remaining_task_ids = set(task_ids)
        safety_limit = max_days

        ended_due_to_limit = False
        ended_due_to_cycle = False

        while remaining_task_ids and safety_limit > 0:
            # Get meetings for this day and reduce capacity
            day_meetings, meeting_minutes = self._get_meetings_for_day(tasks, day_cursor)

            capacity_minutes_today = capacity_minutes_for_day(day_cursor)
            capacity_remaining = max(0, capacity_minutes_today - meeting_minutes)

            # Pre-allocate meetings (they're fixed and take priority)
            allocations: list[TaskAllocation] = []
            allocated_minutes = 0
            overflow_minutes = 0

            for meeting in day_meetings:
                duration = int((meeting.end_time - meeting.start_time).total_seconds() / 60)
                allocations.append(TaskAllocation(task_id=meeting.id, minutes=duration))
                allocated_minutes += duration

                # Record the fixed date so meeting titles appear in schedule info.
                task_start[meeting.id] = day_cursor
                task_end[meeting.id] = day_cursor
                if meeting.id in remaining_task_ids:
                    remaining_task_ids.remove(meeting.id)
                    remaining_minutes[meeting.id] = 0  # Meeting is fully allocated on its fixed day

            # Check if meetings exceed capacity
            if meeting_minutes > capacity_minutes_today:
                overflow_minutes = meeting_minutes - capacity_minutes_today

            energy_minutes = {EnergyLevel.HIGH: 0, EnergyLevel.LOW: 0}
            # Count meeting energy levels
            for meeting in day_meetings:
                duration = int((meeting.end_time - meeting.start_time).total_seconds() / 60)
                energy_minutes[meeting.energy_level] += duration
            day_scores = {
                task_id: base_scores[task_id] + self._calculate_due_bonus(task_map[task_id], day_cursor)
                for task_id in task_map
            }

            forced_today = [
                task_id
                for task_id in ready + in_progress
                if task_map[task_id].due_date
                and task_map[task_id].due_date.date() <= day_cursor
            ]

            if forced_today:
                for task_id in self._sort_task_ids(forced_today, day_scores, task_map):
                    minutes = remaining_minutes.get(task_id, 0)
                    if minutes <= 0:
                        continue
                    if task_id not in task_start:
                        task_start[task_id] = day_cursor
                    allocations.append(TaskAllocation(task_id=task_id, minutes=minutes))
                    allocated_minutes += minutes
                    capacity_remaining -= minutes
                    remaining_minutes[task_id] = 0
                    task_end[task_id] = day_cursor
                    energy_minutes[task_map[task_id].energy_level] += minutes
                    if task_id in in_progress:
                        in_progress.remove(task_id)
                    if task_id in ready:
                        ready.remove(task_id)
                    remaining_task_ids.discard(task_id)
                    self._release_dependents(task_id, indegree, dependents, ready)

                if capacity_remaining < 0:
                    overflow_minutes = abs(capacity_remaining)
                if capacity_remaining <= 0:
                    days.append(
                        ScheduleDay(
                            date=day_cursor,
                            capacity_minutes=capacity_minutes_today,
                            allocated_minutes=allocated_minutes,
                            overflow_minutes=overflow_minutes,
                            task_allocations=allocations,
                            meeting_minutes=meeting_minutes,
                            available_minutes=0 if overflow_minutes > 0 else capacity_remaining,
                        )
                    )
                    day_cursor += timedelta(days=1)
                    safety_limit -= 1
                    continue

            # Normal scheduling within remaining capacity
            while capacity_remaining > 0 and (ready or in_progress):
                candidate_pool = in_progress if in_progress else ready
                next_id = self._pick_next_task(candidate_pool, day_scores, task_map, energy_minutes)
                minutes_left = remaining_minutes.get(next_id, 0)
                if minutes_left <= 0:
                    if next_id in in_progress:
                        in_progress.remove(next_id)
                    if next_id in ready:
                        ready.remove(next_id)
                    continue

                allocation = min(capacity_remaining, minutes_left)
                if next_id not in task_start:
                    task_start[next_id] = day_cursor

                allocations.append(TaskAllocation(task_id=next_id, minutes=allocation))
                allocated_minutes += allocation
                remaining_minutes[next_id] = minutes_left - allocation
                capacity_remaining -= allocation
                energy_minutes[task_map[next_id].energy_level] += allocation

                if remaining_minutes[next_id] == 0:
                    task_end[next_id] = day_cursor
                    remaining_task_ids.discard(next_id)
                    if next_id in in_progress:
                        in_progress.remove(next_id)
                    if next_id in ready:
                        ready.remove(next_id)
                    self._release_dependents(next_id, indegree, dependents, ready)
                else:
                    if next_id in ready:
                        ready.remove(next_id)
                    if next_id not in in_progress:
                        in_progress.append(next_id)

            days.append(
                ScheduleDay(
                    date=day_cursor,
                    capacity_minutes=capacity_minutes_today,
                    allocated_minutes=allocated_minutes,
                    overflow_minutes=overflow_minutes,
                    task_allocations=allocations,
                    meeting_minutes=meeting_minutes,
                    available_minutes=capacity_remaining,
                )
            )
            day_cursor += timedelta(days=1)
            safety_limit -= 1

            if not ready and not in_progress and remaining_task_ids:
                ended_due_to_cycle = True
                break

        if remaining_task_ids and safety_limit <= 0:
            ended_due_to_limit = True

        # Collect all meeting tasks that were scheduled
        all_meetings = [task for task in tasks if task.is_fixed_time and task.id in task_start]

        tasks_info: list[TaskScheduleInfo] = []
        tasks_for_info = scheduled_tasks + [task for task in candidate_tasks if task.id in blocked_task_ids] + all_meetings
        for task in tasks_for_info:
            if task.is_fixed_time and task.start_time and task.end_time:
                total_minutes = int((task.end_time - task.start_time).total_seconds() / 60)
                total_minutes = max(0, total_minutes)
            else:
                total_minutes = get_effective_estimated_minutes(task, tasks) or self.default_task_minutes
            if task.id in remaining_task_ids:
                total_minutes = remaining_minutes.get(task.id, total_minutes)
            tasks_info.append(
                TaskScheduleInfo(
                    task_id=task.id,
                    title=task.title,
                    project_id=task.project_id,
                    parent_id=get_parent_info(task)[0],
                    parent_title=get_parent_info(task)[1],
                    order_in_parent=task.order_in_parent,
                    due_date=task.due_date,
                    planned_start=task_start.get(task.id),
                    planned_end=task_end.get(task.id),
                    total_minutes=total_minutes,
                    priority_score=self._calculate_task_score(
                        task,
                        project_priorities,
                        task_start.get(task.id, start),
                    ),
                )
            )

        for task_id in remaining_task_ids:
            if task_id in unscheduled_reasons:
                continue
            if ended_due_to_limit:
                unscheduled_reasons[task_id] = "max_days_exceeded"
            elif ended_due_to_cycle:
                unscheduled_reasons[task_id] = "dependency_cycle"
            else:
                unscheduled_reasons[task_id] = "unscheduled"

        unscheduled_task_ids = [
            UnscheduledTask(task_id=task_id, reason=unscheduled_reasons.get(task_id, "unscheduled"))
            for task_id in sorted(unscheduled_reasons.keys())
        ]
        return ScheduleResponse(
            start_date=start,
            days=days,
            tasks=tasks_info,
            unscheduled_task_ids=unscheduled_task_ids,
            excluded_tasks=excluded_tasks,
        )

    def get_today_tasks(
        self,
        schedule: ScheduleResponse,
        tasks: list[Task],
        project_priorities: dict[UUID, int] | None = None,
        today: Optional[date] = None,
    ) -> TodayTasksResponse:
        """Extract today's tasks and top3 from schedule."""
        today_date = today or date.today()
        task_map = {task.id: task for task in tasks}
        project_priorities = project_priorities or {}

        today_day = next((day for day in schedule.days if day.date == today_date), None)
        today_task_ids: list[UUID] = []
        allocated_minutes = 0
        overflow_minutes = 0
        capacity_minutes = 0
        allocation_minutes_by_task: dict[UUID, int] = {}

        if today_day:
            seen: set[UUID] = set()
            for alloc in today_day.task_allocations:
                task = task_map.get(alloc.task_id)
                if task and task.is_fixed_time:
                    continue
                allocation_minutes_by_task[alloc.task_id] = (
                    allocation_minutes_by_task.get(alloc.task_id, 0) + alloc.minutes
                )
                if alloc.task_id in seen:
                    continue
                seen.add(alloc.task_id)
                today_task_ids.append(alloc.task_id)
            allocated_minutes = sum(allocation_minutes_by_task.values())
            overflow_minutes = today_day.overflow_minutes
            capacity_minutes = today_day.capacity_minutes

        today_tasks = [task_map[task_id] for task_id in today_task_ids if task_id in task_map]
        today_allocations: list[TodayTaskAllocation] = []
        for task_id in today_task_ids:
            task = task_map.get(task_id)
            if not task:
                continue
            # Use remaining minutes (considering progress) for allocation calculation
            remaining_mins = get_remaining_minutes(task, tasks)
            total_minutes = get_effective_estimated_minutes(task, tasks)
            if total_minutes <= 0:
                total_minutes = self.default_task_minutes
            if remaining_mins <= 0:
                remaining_mins = total_minutes

            allocated_for_day = allocation_minutes_by_task.get(task_id, 0)
            # ratio is based on remaining work, not total
            ratio = allocated_for_day / remaining_mins if remaining_mins > 0 else 0.0
            today_allocations.append(
                TodayTaskAllocation(
                    task_id=task_id,
                    allocated_minutes=allocated_for_day,
                    total_minutes=remaining_mins,  # Use remaining as "total" for today's planning
                    ratio=min(1.0, max(0.0, ratio)),
                )
            )
        # Calculate scores for all today's tasks
        task_scores = {
            task.id: self._calculate_task_score(task, project_priorities, today_date)
            for task in today_tasks
        }

        # Sort by score (descending), then by due date, then by creation time
        today_tasks_sorted = sorted(
            today_tasks,
            key=lambda t: (
                -task_scores[t.id],
                t.due_date or datetime.max,
                t.created_at
            )
        )

        # Filter out tasks blocked by dependencies for Top3 selection
        # A task is blocked if any of its dependencies are not DONE
        unblocked_tasks = []
        for task in today_tasks_sorted:
            if not task.dependency_ids:
                unblocked_tasks.append(task)
                continue
            # Check if all dependencies are completed
            all_deps_done = True
            for dep_id in task.dependency_ids:
                dep_task = task_map.get(dep_id)
                if dep_task is None or dep_task.status != TaskStatus.DONE:
                    all_deps_done = False
                    break
            if all_deps_done:
                unblocked_tasks.append(task)

        # Top 3 are the most important UNBLOCKED tasks based on score
        top3_ids = [task.id for task in unblocked_tasks[:3]]

        return TodayTasksResponse(
            today=today_date,
            today_tasks=today_tasks_sorted,
            today_allocations=today_allocations,
            top3_ids=top3_ids,
            total_estimated_minutes=allocated_minutes,
            capacity_minutes=capacity_minutes,
            overflow_minutes=overflow_minutes,
            overflow=overflow_minutes > 0,
        )

    def _calculate_task_score(
        self,
        task: Task,
        project_priorities: dict[UUID, int],
        reference_date: date,
    ) -> float:
        """Calculate a scheduling score for a task at a given date."""
        base_score = self._calculate_base_score(task, project_priorities)
        return base_score + self._calculate_due_bonus(task, reference_date)

    def _calculate_base_score(self, task: Task, project_priorities: dict[UUID, int]) -> float:
        """Calculate stable base score for a task (no due-date contribution)."""
        importance_weights = {
            Priority.HIGH: 3.0,
            Priority.MEDIUM: 2.0,
            Priority.LOW: 1.0,
        }
        urgency_weights = {
            Priority.HIGH: 3.0,
            Priority.MEDIUM: 2.0,
            Priority.LOW: 1.0,
        }

        score = 0.0
        score += importance_weights.get(task.importance, 1.0) * 10
        score += urgency_weights.get(task.urgency, 1.0) * 8

        if task.status == TaskStatus.IN_PROGRESS:
            score += 2

        if task.energy_level == EnergyLevel.LOW:
            score += 1

        project_priority = 5
        if task.project_id and task.project_id in project_priorities:
            project_priority = project_priorities[task.project_id]
        score *= 1 + (project_priority * self.project_priority_weight)
        return score

    @staticmethod
    def _calculate_due_bonus(task: Task, reference_date: date) -> float:
        """Calculate due-date bonus that increases toward the due date."""
        if not task.due_date:
            return 0.0

        due_date = task.due_date.date()
        days_until = (due_date - reference_date).days
        max_bonus = 30.0
        horizon_days = 14

        if days_until <= 0:
            return max_bonus
        if days_until >= horizon_days:
            return 0.0

        step = max_bonus / horizon_days
        return max(0.0, max_bonus - (days_until * step))

    @staticmethod
    def _sort_task_ids(
        task_ids: list[UUID],
        scores: dict[UUID, float],
        task_map: dict[UUID, Task],
    ) -> list[UUID]:
        return sorted(
            task_ids,
            key=lambda task_id: (
                -scores.get(task_id, 0.0),
                task_map[task_id].due_date or datetime.max,
                task_map[task_id].created_at,
            ),
        )

    def _pick_next_task(
        self,
        task_ids: list[UUID],
        scores: dict[UUID, float],
        task_map: dict[UUID, Task],
        energy_minutes: dict[EnergyLevel, int],
    ) -> UUID:
        if not task_ids:
            raise ValueError("No task IDs available for scheduling")

        total_minutes = energy_minutes[EnergyLevel.HIGH] + energy_minutes[EnergyLevel.LOW]
        preferred_energy: Optional[EnergyLevel] = None

        if total_minutes > 0:
            high_ratio = energy_minutes[EnergyLevel.HIGH] / total_minutes
            low_ratio = energy_minutes[EnergyLevel.LOW] / total_minutes
            if high_ratio > self.energy_high_ratio:
                preferred_energy = EnergyLevel.LOW
            elif low_ratio > self.energy_low_ratio:
                preferred_energy = EnergyLevel.HIGH

        if preferred_energy:
            preferred_ids = [
                task_id
                for task_id in task_ids
                if task_map[task_id].energy_level == preferred_energy
            ]
            if preferred_ids:
                task_ids = preferred_ids

        return self._sort_task_ids(task_ids, scores, task_map)[0]

    @staticmethod
    def _release_dependents(
        task_id: UUID,
        indegree: dict[UUID, int],
        dependents: dict[UUID, list[UUID]],
        ready: list[UUID],
    ) -> None:
        for dependent_id in dependents.get(task_id, []):
            indegree[dependent_id] -= 1
            if indegree[dependent_id] <= 0 and dependent_id not in ready:
                ready.append(dependent_id)
