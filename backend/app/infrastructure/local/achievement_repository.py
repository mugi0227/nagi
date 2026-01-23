"""
SQLite implementation of Achievement repository.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.interfaces.achievement_repository import IAchievementRepository
from app.models.achievement import Achievement, SkillAnalysis, SkillExperience
from app.models.enums import GenerationType
from app.infrastructure.local.database import AchievementORM, get_session_factory


class SqliteAchievementRepository(IAchievementRepository):
    """SQLite implementation of achievement repository."""

    def __init__(self, session_factory=None):
        """
        Initialize repository.

        Args:
            session_factory: Optional session factory (for testing)
        """
        self._session_factory = session_factory or get_session_factory()

    def _orm_to_model(self, orm: AchievementORM) -> Achievement:
        """Convert ORM object to Pydantic model."""
        # Parse skill_analysis from JSON
        skill_analysis_data = orm.skill_analysis or {}
        skill_analysis = SkillAnalysis(
            domain_skills=[
                SkillExperience(**s) for s in skill_analysis_data.get("domain_skills", [])
            ],
            soft_skills=[
                SkillExperience(**s) for s in skill_analysis_data.get("soft_skills", [])
            ],
            work_types=[
                SkillExperience(**s) for s in skill_analysis_data.get("work_types", [])
            ],
            strengths=skill_analysis_data.get("strengths", []),
            growth_areas=skill_analysis_data.get("growth_areas", []),
        )

        return Achievement(
            id=UUID(orm.id),
            user_id=orm.user_id,
            period_start=orm.period_start,
            period_end=orm.period_end,
            period_label=orm.period_label,
            summary=orm.summary,
            growth_points=orm.growth_points or [],
            skill_analysis=skill_analysis,
            next_suggestions=orm.next_suggestions or [],
            task_count=orm.task_count or 0,
            project_ids=[UUID(pid) for pid in (orm.project_ids or [])],
            generation_type=GenerationType(orm.generation_type) if orm.generation_type else GenerationType.MANUAL,
            created_at=orm.created_at,
            updated_at=orm.updated_at,
        )

    def _model_to_orm_data(self, achievement: Achievement) -> dict:
        """Convert Achievement model to ORM field dictionary."""
        return {
            "user_id": achievement.user_id,
            "period_start": achievement.period_start,
            "period_end": achievement.period_end,
            "period_label": achievement.period_label,
            "summary": achievement.summary,
            "growth_points": achievement.growth_points,
            "skill_analysis": {
                "domain_skills": [s.model_dump() for s in achievement.skill_analysis.domain_skills],
                "soft_skills": [s.model_dump() for s in achievement.skill_analysis.soft_skills],
                "work_types": [s.model_dump() for s in achievement.skill_analysis.work_types],
                "strengths": achievement.skill_analysis.strengths,
                "growth_areas": achievement.skill_analysis.growth_areas,
            },
            "next_suggestions": achievement.next_suggestions,
            "task_count": achievement.task_count,
            "project_ids": [str(pid) for pid in achievement.project_ids],
            "generation_type": achievement.generation_type.value,
        }

    async def create(self, user_id: str, achievement: Achievement) -> Achievement:
        """Create a new achievement."""
        async with self._session_factory() as session:
            orm = AchievementORM(
                id=str(achievement.id) if achievement.id else str(uuid4()),
                **self._model_to_orm_data(achievement),
            )
            session.add(orm)
            await session.commit()
            await session.refresh(orm)
            return self._orm_to_model(orm)

    async def get(self, user_id: str, achievement_id: UUID) -> Optional[Achievement]:
        """Get an achievement by ID."""
        async with self._session_factory() as session:
            result = await session.execute(
                select(AchievementORM).where(
                    and_(
                        AchievementORM.id == str(achievement_id),
                        AchievementORM.user_id == user_id,
                    )
                )
            )
            orm = result.scalar_one_or_none()
            return self._orm_to_model(orm) if orm else None

    async def list(
        self,
        user_id: str,
        period_start: Optional[datetime] = None,
        period_end: Optional[datetime] = None,
        limit: int = 20,
        offset: int = 0,
    ) -> list[Achievement]:
        """List achievements for a user."""
        async with self._session_factory() as session:
            conditions = [AchievementORM.user_id == user_id]

            if period_start:
                conditions.append(AchievementORM.period_end >= period_start)
            if period_end:
                conditions.append(AchievementORM.period_start <= period_end)

            query = select(AchievementORM).where(and_(*conditions))
            query = query.order_by(AchievementORM.created_at.desc())
            query = query.limit(limit).offset(offset)

            result = await session.execute(query)
            return [self._orm_to_model(orm) for orm in result.scalars().all()]

    async def get_latest(self, user_id: str) -> Optional[Achievement]:
        """Get the most recently created achievement for a user."""
        async with self._session_factory() as session:
            result = await session.execute(
                select(AchievementORM)
                .where(AchievementORM.user_id == user_id)
                .order_by(AchievementORM.created_at.desc())
                .limit(1)
            )
            orm = result.scalar_one_or_none()
            return self._orm_to_model(orm) if orm else None

    async def delete(self, user_id: str, achievement_id: UUID) -> bool:
        """Delete an achievement."""
        async with self._session_factory() as session:
            result = await session.execute(
                select(AchievementORM).where(
                    and_(
                        AchievementORM.id == str(achievement_id),
                        AchievementORM.user_id == user_id,
                    )
                )
            )
            orm = result.scalar_one_or_none()

            if not orm:
                return False

            await session.delete(orm)
            await session.commit()
            return True

    async def update(
        self,
        user_id: str,
        achievement_id: UUID,
        summary: Optional[str] = None,
        growth_points: Optional[list[str]] = None,
        next_suggestions: Optional[list[str]] = None,
    ) -> Achievement:
        """Update an achievement (partial update)."""
        async with self._session_factory() as session:
            result = await session.execute(
                select(AchievementORM).where(
                    and_(
                        AchievementORM.id == str(achievement_id),
                        AchievementORM.user_id == user_id,
                    )
                )
            )
            orm = result.scalar_one_or_none()

            if not orm:
                raise NotFoundError(f"Achievement {achievement_id} not found")

            if summary is not None:
                orm.summary = summary
            if growth_points is not None:
                orm.growth_points = growth_points
            if next_suggestions is not None:
                orm.next_suggestions = next_suggestions

            orm.updated_at = datetime.utcnow()

            await session.commit()
            await session.refresh(orm)
            return self._orm_to_model(orm)
