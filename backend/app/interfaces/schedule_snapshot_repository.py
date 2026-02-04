"""
Schedule snapshot repository interface.

Defines the contract for schedule snapshot persistence operations.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Optional
from uuid import UUID

from app.models.schedule_snapshot import (
    ScheduleSnapshot,
    ScheduleSnapshotCreate,
    ScheduleSnapshotSummary,
)


class IScheduleSnapshotRepository(ABC):
    """Abstract interface for schedule snapshot persistence."""

    @abstractmethod
    async def create(
        self,
        user_id: str,
        project_id: UUID,
        snapshot: ScheduleSnapshotCreate,
        schedule_data: dict,
    ) -> ScheduleSnapshot:
        """
        Create a new schedule snapshot.

        Args:
            user_id: Owner user ID
            project_id: Project ID
            snapshot: Snapshot creation parameters
            schedule_data: Full schedule data (tasks, days, buffers)

        Returns:
            Created snapshot with generated ID and timestamps
        """
        pass

    @abstractmethod
    async def get(self, user_id: str, snapshot_id: UUID) -> Optional[ScheduleSnapshot]:
        """
        Get a snapshot by ID.

        Args:
            user_id: Owner user ID
            snapshot_id: Snapshot ID

        Returns:
            Snapshot if found, None otherwise
        """
        pass

    @abstractmethod
    async def list_by_project(
        self,
        user_id: str,
        project_id: UUID,
        limit: int = 20,
        offset: int = 0,
    ) -> list[ScheduleSnapshotSummary]:
        """
        List snapshots for a project.

        Args:
            user_id: Owner user ID
            project_id: Project ID
            limit: Maximum number of results
            offset: Pagination offset

        Returns:
            List of snapshot summaries
        """
        pass

    @abstractmethod
    async def get_active(self, user_id: str, project_id: UUID) -> Optional[ScheduleSnapshot]:
        """
        Get the currently active snapshot for a project.

        Args:
            user_id: Owner user ID
            project_id: Project ID

        Returns:
            Active snapshot if exists, None otherwise
        """
        pass

    @abstractmethod
    async def activate(self, user_id: str, snapshot_id: UUID) -> ScheduleSnapshot:
        """
        Activate a snapshot (deactivates any previously active one).

        Args:
            user_id: Owner user ID
            snapshot_id: Snapshot ID to activate

        Returns:
            Activated snapshot

        Raises:
            NotFoundError: If snapshot not found
        """
        pass

    @abstractmethod
    async def delete(self, user_id: str, snapshot_id: UUID) -> bool:
        """
        Delete a snapshot.

        Args:
            user_id: Owner user ID
            snapshot_id: Snapshot ID to delete

        Returns:
            True if deleted, False if not found
        """
        pass

    @abstractmethod
    async def update_consumed_buffer(
        self,
        user_id: str,
        snapshot_id: UUID,
        consumed_buffer_minutes: int,
    ) -> ScheduleSnapshot:
        """
        Update the consumed buffer for a snapshot.

        Args:
            user_id: Owner user ID
            snapshot_id: Snapshot ID
            consumed_buffer_minutes: New consumed buffer value

        Returns:
            Updated snapshot

        Raises:
            NotFoundError: If snapshot not found
        """
        pass
