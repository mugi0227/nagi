"""
Recurring task repository interface.

Defines contract for recurring task persistence operations.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Optional
from uuid import UUID

from app.models.recurring_task import RecurringTask, RecurringTaskCreate, RecurringTaskUpdate


class IRecurringTaskRepository(ABC):
    """Abstract interface for recurring task persistence."""

    @abstractmethod
    async def create(self, user_id: str, data: RecurringTaskCreate) -> RecurringTask:
        """Create a new recurring task definition."""
        pass

    @abstractmethod
    async def get(
        self, user_id: str, recurring_task_id: UUID, project_id: UUID | None = None
    ) -> Optional[RecurringTask]:
        """Get a recurring task by ID. If project_id is given, uses project-based access."""
        pass

    @abstractmethod
    async def list(
        self,
        user_id: str,
        project_id: Optional[UUID] = None,
        include_inactive: bool = False,
        limit: int = 100,
        offset: int = 0,
    ) -> list[RecurringTask]:
        """List recurring task definitions."""
        pass

    @abstractmethod
    async def update(
        self,
        user_id: str,
        recurring_task_id: UUID,
        update: RecurringTaskUpdate,
        project_id: UUID | None = None,
    ) -> RecurringTask:
        """Update a recurring task definition."""
        pass

    @abstractmethod
    async def delete(
        self, user_id: str, recurring_task_id: UUID, project_id: UUID | None = None
    ) -> bool:
        """Delete a recurring task definition."""
        pass
