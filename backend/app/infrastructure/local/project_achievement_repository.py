"""
SQLite implementation of project achievement repository.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from sqlalchemy import select, desc

from app.infrastructure.local.database import ProjectAchievementORM, get_session_factory
from app.interfaces.project_achievement_repository import IProjectAchievementRepository
from app.models.achievement import (
    ProjectAchievement,
    MemberContribution,
)
from app.models.enums import GenerationType


class SqliteProjectAchievementRepository(IProjectAchievementRepository):
    """SQLite implementation of project achievement repository."""

    def __init__(self, session_factory=None):
        self._session_factory = session_factory or get_session_factory()

    def _orm_to_model(self, orm: ProjectAchievementORM) -> ProjectAchievement:
        # Parse member contributions from JSON
        member_contributions = []
        if orm.member_contributions:
            for mc in orm.member_contributions:
                member_contributions.append(MemberContribution(
                    user_id=mc.get("user_id", ""),
                    display_name=mc.get("display_name", ""),
                    task_count=mc.get("task_count", 0),
                    main_areas=mc.get("main_areas", []),
                    task_titles=mc.get("task_titles", []),
                ))

        return ProjectAchievement(
            id=UUID(orm.id),
            project_id=UUID(orm.project_id),
            period_start=orm.period_start,
            period_end=orm.period_end,
            period_label=orm.period_label,
            summary=orm.summary,
            team_highlights=orm.team_highlights or [],
            challenges=orm.challenges or [],
            learnings=orm.learnings or [],
            member_contributions=member_contributions,
            total_task_count=orm.total_task_count,
            remaining_tasks_count=orm.remaining_tasks_count,
            open_issues=orm.open_issues or [],
            generation_type=GenerationType(orm.generation_type),
            created_at=orm.created_at,
            updated_at=orm.updated_at,
        )

    async def create(self, project_id: UUID, achievement: ProjectAchievement) -> ProjectAchievement:
        async with self._session_factory() as session:
            # Serialize member contributions to JSON
            member_contributions_json = [
                {
                    "user_id": mc.user_id,
                    "display_name": mc.display_name,
                    "task_count": mc.task_count,
                    "main_areas": mc.main_areas,
                    "task_titles": mc.task_titles,
                }
                for mc in achievement.member_contributions
            ]

            orm = ProjectAchievementORM(
                id=str(achievement.id),
                project_id=str(project_id),
                period_start=achievement.period_start,
                period_end=achievement.period_end,
                period_label=achievement.period_label,
                summary=achievement.summary,
                team_highlights=achievement.team_highlights,
                challenges=achievement.challenges,
                learnings=achievement.learnings,
                member_contributions=member_contributions_json,
                total_task_count=achievement.total_task_count,
                remaining_tasks_count=achievement.remaining_tasks_count,
                open_issues=achievement.open_issues,
                generation_type=achievement.generation_type.value,
                created_at=achievement.created_at,
                updated_at=achievement.updated_at,
            )
            session.add(orm)
            await session.commit()
            await session.refresh(orm)
            return self._orm_to_model(orm)

    async def get(self, project_id: UUID, achievement_id: UUID) -> Optional[ProjectAchievement]:
        async with self._session_factory() as session:
            result = await session.execute(
                select(ProjectAchievementORM).where(
                    ProjectAchievementORM.id == str(achievement_id),
                    ProjectAchievementORM.project_id == str(project_id),
                )
            )
            orm = result.scalar_one_or_none()
            return self._orm_to_model(orm) if orm else None

    async def get_latest(self, project_id: UUID) -> Optional[ProjectAchievement]:
        async with self._session_factory() as session:
            result = await session.execute(
                select(ProjectAchievementORM)
                .where(ProjectAchievementORM.project_id == str(project_id))
                .order_by(desc(ProjectAchievementORM.created_at))
                .limit(1)
            )
            orm = result.scalar_one_or_none()
            return self._orm_to_model(orm) if orm else None

    async def list(
        self,
        project_id: UUID,
        period_start: Optional[datetime] = None,
        period_end: Optional[datetime] = None,
        limit: int = 20,
        offset: int = 0,
    ) -> list[ProjectAchievement]:
        async with self._session_factory() as session:
            query = select(ProjectAchievementORM).where(
                ProjectAchievementORM.project_id == str(project_id)
            )

            if period_start:
                query = query.where(ProjectAchievementORM.period_start >= period_start)
            if period_end:
                query = query.where(ProjectAchievementORM.period_end <= period_end)

            query = query.order_by(desc(ProjectAchievementORM.created_at))
            query = query.offset(offset).limit(limit)

            result = await session.execute(query)
            return [self._orm_to_model(orm) for orm in result.scalars().all()]

    async def delete(self, project_id: UUID, achievement_id: UUID) -> bool:
        async with self._session_factory() as session:
            result = await session.execute(
                select(ProjectAchievementORM).where(
                    ProjectAchievementORM.id == str(achievement_id),
                    ProjectAchievementORM.project_id == str(project_id),
                )
            )
            orm = result.scalar_one_or_none()
            if not orm:
                return False
            await session.delete(orm)
            await session.commit()
            return True
