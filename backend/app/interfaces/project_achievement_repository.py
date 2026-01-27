"""
Project Achievement repository interface.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import datetime
from typing import Optional
from uuid import UUID

from app.models.achievement import ProjectAchievement


class IProjectAchievementRepository(ABC):
    """Abstract interface for project achievement persistence."""

    @abstractmethod
    async def create(self, project_id: UUID, achievement: ProjectAchievement) -> ProjectAchievement:
        """Create a new project achievement."""
        pass

    @abstractmethod
    async def get(self, project_id: UUID, achievement_id: UUID) -> Optional[ProjectAchievement]:
        """Get a project achievement by ID."""
        pass

    @abstractmethod
    async def get_latest(self, project_id: UUID) -> Optional[ProjectAchievement]:
        """Get the most recent project achievement."""
        pass

    @abstractmethod
    async def list(
        self,
        project_id: UUID,
        period_start: Optional[datetime] = None,
        period_end: Optional[datetime] = None,
        limit: int = 20,
        offset: int = 0,
    ) -> list[ProjectAchievement]:
        """List project achievements with optional period filter."""
        pass

    @abstractmethod
    async def delete(self, project_id: UUID, achievement_id: UUID) -> bool:
        """Delete a project achievement. Returns True if deleted."""
        pass

    @abstractmethod
    async def update(
        self,
        project_id: UUID,
        achievement_id: UUID,
        summary: Optional[str] = None,
        team_highlights: Optional[list[str]] = None,
        challenges: Optional[list[str]] = None,
        learnings: Optional[list[str]] = None,
        open_issues: Optional[list[str]] = None,
        append_note: Optional[str] = None,
    ) -> ProjectAchievement:
        """Update a project achievement (partial update)."""
        pass
