"""
CCPM (Critical Chain Project Management) service for buffer calculation.

This module provides functionality to:
- Find critical chain (longest path) in task dependency DAG
- Calculate phase-level buffers based on critical chain length
- Filter tasks for CCPM calculation (estimated tasks only)
"""

from __future__ import annotations

from collections import defaultdict
from typing import Literal, Optional
from uuid import UUID

from app.models.schedule_snapshot import PhaseBufferInfo
from app.models.task import Task


class CCPMService:
    """Service for CCPM buffer calculation."""

    def __init__(self, default_buffer_ratio: float = 0.5):
        """
        Initialize CCPM service.

        Args:
            default_buffer_ratio: Default buffer ratio (0.5 = 50%)
        """
        self.default_buffer_ratio = default_buffer_ratio

    def filter_for_ccpm(
        self,
        tasks: list[Task],
    ) -> tuple[list[Task], list[Task]]:
        """
        Filter tasks for CCPM calculation.

        Only tasks with estimated_minutes are included in CCPM calculations.
        Subtasks (tasks with parent_id) are excluded as they're covered by parents.

        Args:
            tasks: All tasks

        Returns:
            Tuple of (estimated_tasks, unestimated_tasks)
        """
        estimated = []
        unestimated = []

        for task in tasks:
            # Skip subtasks - they're aggregated in parent
            if task.parent_id is not None:
                continue
            # Skip completed tasks
            if task.status == "DONE":
                continue

            if task.estimated_minutes and task.estimated_minutes > 0:
                estimated.append(task)
            else:
                unestimated.append(task)

        return estimated, unestimated

    def _build_dag(
        self,
        tasks: list[Task],
    ) -> tuple[dict[UUID, list[UUID]], dict[UUID, list[UUID]], dict[UUID, int]]:
        """
        Build dependency DAG from tasks.

        Returns:
            Tuple of (adjacency list, reverse adjacency, task duration map)
        """
        task_ids = {t.id for t in tasks}
        adjacency: dict[UUID, list[UUID]] = defaultdict(list)
        reverse_adj: dict[UUID, list[UUID]] = defaultdict(list)
        duration: dict[UUID, int] = {}

        for task in tasks:
            duration[task.id] = task.estimated_minutes or 0
            # Build edges: dependency -> task (dependency must finish before task)
            for dep_id in (task.dependency_ids or []):
                if dep_id in task_ids:
                    adjacency[dep_id].append(task.id)
                    reverse_adj[task.id].append(dep_id)

        return adjacency, reverse_adj, duration

    def _find_critical_chain(
        self,
        tasks: list[Task],
    ) -> tuple[int, list[UUID]]:
        """
        Find the critical chain (longest path) in the task DAG.

        Uses dynamic programming for DAG longest path.

        Args:
            tasks: List of tasks to analyze

        Returns:
            Tuple of (total_duration_minutes, list of task IDs in critical chain)
        """
        if not tasks:
            return 0, []

        adjacency, reverse_adj, duration = self._build_dag(tasks)
        task_ids = {t.id for t in tasks}

        # dist[v] = longest path ending at v
        dist: dict[UUID, int] = {}
        parent: dict[UUID, Optional[UUID]] = {}

        # Topological sort using Kahn's algorithm
        in_degree: dict[UUID, int] = defaultdict(int)
        for task_id in task_ids:
            for dep_id in reverse_adj[task_id]:
                in_degree[task_id] += 1

        # Start with nodes that have no dependencies
        queue = [tid for tid in task_ids if in_degree[tid] == 0]
        topo_order = []

        while queue:
            current = queue.pop(0)
            topo_order.append(current)
            for neighbor in adjacency[current]:
                in_degree[neighbor] -= 1
                if in_degree[neighbor] == 0:
                    queue.append(neighbor)

        # Initialize distances
        for task_id in task_ids:
            dist[task_id] = duration.get(task_id, 0)
            parent[task_id] = None

        # Compute longest path
        for task_id in topo_order:
            for neighbor in adjacency[task_id]:
                new_dist = dist[task_id] + duration.get(neighbor, 0)
                if new_dist > dist[neighbor]:
                    dist[neighbor] = new_dist
                    parent[neighbor] = task_id

        # Find the end of the critical chain
        if not dist:
            return 0, []

        end_task = max(dist.keys(), key=lambda x: dist[x])
        max_duration = dist[end_task]

        # Reconstruct path
        path = []
        current: Optional[UUID] = end_task
        while current is not None:
            path.append(current)
            current = parent.get(current)
        path.reverse()

        return max_duration, path

    def calculate_phase_buffers(
        self,
        tasks: list[Task],
        phases: list[dict],  # [{id, name}]
        buffer_ratio: Optional[float] = None,
    ) -> list[PhaseBufferInfo]:
        """
        Calculate buffer for each phase based on critical chain.

        Args:
            tasks: All tasks (will be filtered for CCPM)
            phases: List of phase info dicts with 'id' and 'name'
            buffer_ratio: Buffer ratio to use (defaults to self.default_buffer_ratio)

        Returns:
            List of PhaseBufferInfo for each phase
        """
        ratio = buffer_ratio if buffer_ratio is not None else self.default_buffer_ratio
        estimated_tasks, _ = self.filter_for_ccpm(tasks)

        result = []

        for phase in phases:
            phase_id = phase["id"]
            phase_name = phase["name"]

            # Filter tasks for this phase
            phase_tasks = [t for t in estimated_tasks if str(t.phase_id) == str(phase_id)]

            if not phase_tasks:
                # No tasks in phase
                result.append(PhaseBufferInfo(
                    phase_id=phase_id if isinstance(phase_id, UUID) else UUID(phase_id),
                    phase_name=phase_name,
                    total_buffer_minutes=0,
                    consumed_buffer_minutes=0,
                    buffer_percentage=100.0,
                    critical_chain_length_minutes=0,
                    status="healthy",
                ))
                continue

            # Find critical chain for this phase
            cc_length, _ = self._find_critical_chain(phase_tasks)

            # Calculate buffer
            total_buffer = int(cc_length * ratio)

            result.append(PhaseBufferInfo(
                phase_id=phase_id if isinstance(phase_id, UUID) else UUID(phase_id),
                phase_name=phase_name,
                total_buffer_minutes=total_buffer,
                consumed_buffer_minutes=0,
                buffer_percentage=100.0,
                critical_chain_length_minutes=cc_length,
                status="healthy",
            ))

        return result

    def get_buffer_status(
        self,
        total_buffer: int,
        consumed_buffer: int,
    ) -> Literal["healthy", "warning", "critical"]:
        """
        Determine buffer status based on consumption.

        Args:
            total_buffer: Total buffer minutes
            consumed_buffer: Consumed buffer minutes

        Returns:
            Status: healthy (<33%), warning (<67%), critical (>=67%)
        """
        if total_buffer <= 0:
            return "healthy"

        consumption_pct = (consumed_buffer / total_buffer) * 100

        if consumption_pct < 33:
            return "healthy"
        elif consumption_pct < 67:
            return "warning"
        else:
            return "critical"

    def update_buffer_consumption(
        self,
        phase_buffer: PhaseBufferInfo,
        consumed_minutes: int,
    ) -> PhaseBufferInfo:
        """
        Update buffer consumption for a phase.

        Args:
            phase_buffer: Current phase buffer info
            consumed_minutes: New consumed buffer value

        Returns:
            Updated PhaseBufferInfo
        """
        total = phase_buffer.total_buffer_minutes
        remaining_pct = (
            ((total - consumed_minutes) / total * 100)
            if total > 0
            else 100.0
        )
        status = self.get_buffer_status(total, consumed_minutes)

        return PhaseBufferInfo(
            phase_id=phase_buffer.phase_id,
            phase_name=phase_buffer.phase_name,
            total_buffer_minutes=total,
            consumed_buffer_minutes=consumed_minutes,
            buffer_percentage=max(0, remaining_pct),
            critical_chain_length_minutes=phase_buffer.critical_chain_length_minutes,
            status=status,
        )
