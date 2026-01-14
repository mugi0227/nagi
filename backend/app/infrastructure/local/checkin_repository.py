"""
SQLite implementation of check-in repository.
"""

from __future__ import annotations

from datetime import date
from uuid import UUID, uuid4

from sqlalchemy import select, and_

from app.infrastructure.local.database import CheckinORM, get_session_factory
from app.interfaces.checkin_repository import ICheckinRepository
from app.models.collaboration import Checkin, CheckinCreate


class SqliteCheckinRepository(ICheckinRepository):
    """SQLite implementation of check-in repository."""

    def __init__(self, session_factory=None):
        self._session_factory = session_factory or get_session_factory()

    def _orm_to_model(self, orm: CheckinORM) -> Checkin:
        return Checkin(
            id=UUID(orm.id),
            user_id=orm.user_id,
            project_id=UUID(orm.project_id),
            member_user_id=orm.member_user_id,
            checkin_date=orm.checkin_date,
            checkin_type=orm.checkin_type or "weekly",
            summary_text=orm.summary_text,
            raw_text=orm.raw_text,
            created_at=orm.created_at,
        )

    async def create(
        self, user_id: str, project_id: UUID, checkin: CheckinCreate
    ) -> Checkin:
        async with self._session_factory() as session:
            orm = CheckinORM(
                id=str(uuid4()),
                user_id=user_id,
                project_id=str(project_id),
                member_user_id=checkin.member_user_id,
                checkin_date=checkin.checkin_date,
                checkin_type=checkin.checkin_type,
                summary_text=checkin.summary_text,
                raw_text=checkin.raw_text,
            )
            session.add(orm)
            await session.commit()
            await session.refresh(orm)
            return self._orm_to_model(orm)

    async def list(
        self,
        user_id: str,
        project_id: UUID,
        member_user_id: str | None = None,
        start_date: date | None = None,
        end_date: date | None = None,
    ) -> list[Checkin]:
        """List check-ins for a project (project-based access)."""
        async with self._session_factory() as session:
            # Project-based access: filter by project_id only
            conditions = [CheckinORM.project_id == str(project_id)]
            if member_user_id:
                conditions.append(CheckinORM.member_user_id == member_user_id)
            if start_date:
                conditions.append(CheckinORM.checkin_date >= start_date)
            if end_date:
                conditions.append(CheckinORM.checkin_date <= end_date)

            result = await session.execute(
                select(CheckinORM).where(and_(*conditions)).order_by(CheckinORM.checkin_date.desc())
            )
            return [self._orm_to_model(orm) for orm in result.scalars().all()]
