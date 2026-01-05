"""
Task assignment repository interface.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Optional
from uuid import UUID

from app.models.collaboration import TaskAssignment, TaskAssignmentCreate, TaskAssignmentUpdate


class ITaskAssignmentRepository(ABC):
    """Abstract interface for task assignment persistence."""

    @abstractmethod
    async def assign(
        self, user_id: str, task_id: UUID, assignment: TaskAssignmentCreate
    ) -> TaskAssignment:
        """Assign a task to a member (upsert)."""
        pass

    @abstractmethod
    async def get_by_task(self, user_id: str, task_id: UUID) -> Optional[TaskAssignment]:
        """Get assignment by task."""
        pass

    @abstractmethod
    async def list_by_project(self, user_id: str, project_id: UUID) -> list[TaskAssignment]:
        """List assignments for tasks in a project."""
        pass

    @abstractmethod
    async def update(
        self, user_id: str, assignment_id: UUID, update: TaskAssignmentUpdate
    ) -> TaskAssignment:
        """Update assignment fields."""
        pass

    @abstractmethod
    async def delete_by_task(self, user_id: str, task_id: UUID) -> bool:
        """Delete assignment for a task."""
        pass
