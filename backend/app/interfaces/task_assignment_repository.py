"""
Task assignment repository interface.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Optional
from uuid import UUID

from app.models.collaboration import TaskAssignment, TaskAssignmentCreate, TaskAssignmentsCreate, TaskAssignmentUpdate


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

    @abstractmethod
    async def list_by_task(self, user_id: str, task_id: UUID) -> list[TaskAssignment]:
        """List all assignments for a task (supports multiple assignees)."""
        pass

    @abstractmethod
    async def assign_multiple(
        self, user_id: str, task_id: UUID, assignments: TaskAssignmentsCreate
    ) -> list[TaskAssignment]:
        """Assign a task to multiple members. Replaces existing assignments."""
        pass

    @abstractmethod
    async def list_all_for_user(self, user_id: str) -> list[TaskAssignment]:
        """
        List all assignments where user is the project owner.

        Used for schedule filtering by assignee.
        """
        pass

    @abstractmethod
    async def convert_invitation_to_user(
        self, user_id: str, invitation_assignee_id: str, new_user_id: str
    ) -> int:
        """
        Convert all invitation-based assignments to user-based.

        Called when an invited member accepts the invitation and registers.

        Args:
            user_id: Project owner's user ID
            invitation_assignee_id: Current assignee ID (e.g., "inv:xxx-...")
            new_user_id: New user ID to replace with

        Returns:
            Count of updated assignments
        """
        pass
