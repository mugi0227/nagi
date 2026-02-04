"""
SQLite implementation of user repository.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4

from sqlalchemy import select, and_, or_

from app.infrastructure.local.database import UserORM, get_session_factory
from app.interfaces.user_repository import IUserRepository
from app.models.user import UserAccount, UserCreate, UserUpdate
from app.utils.datetime_utils import now_utc


class SqliteUserRepository(IUserRepository):
    """SQLite implementation of user repository."""

    def __init__(self, session_factory=None):
        self._session_factory = session_factory or get_session_factory()

    def _orm_to_model(self, orm: UserORM) -> UserAccount:
        return UserAccount(
            id=UUID(orm.id),
            provider_issuer=orm.provider_issuer,
            provider_sub=orm.provider_sub,
            email=orm.email,
            display_name=orm.display_name,
            first_name=orm.first_name,
            last_name=orm.last_name,
            username=orm.username,
            password_hash=orm.password_hash,
            timezone=orm.timezone,
            enable_weekly_meeting_reminder=orm.enable_weekly_meeting_reminder,
            created_at=orm.created_at,
            updated_at=orm.updated_at,
        )

    async def get(self, user_id: UUID) -> Optional[UserAccount]:
        async with self._session_factory() as session:
            result = await session.execute(
                select(UserORM).where(UserORM.id == str(user_id))
            )
            orm = result.scalar_one_or_none()
            return self._orm_to_model(orm) if orm else None

    async def get_by_provider(self, issuer: str, sub: str) -> Optional[UserAccount]:
        async with self._session_factory() as session:
            result = await session.execute(
                select(UserORM).where(
                    and_(UserORM.provider_issuer == issuer, UserORM.provider_sub == sub)
                )
            )
            orm = result.scalar_one_or_none()
            return self._orm_to_model(orm) if orm else None

    async def get_by_email(self, email: str) -> Optional[UserAccount]:
        async with self._session_factory() as session:
            result = await session.execute(
                select(UserORM).where(UserORM.email == email)
            )
            orm = result.scalar_one_or_none()
            return self._orm_to_model(orm) if orm else None

    async def get_by_username(self, username: str) -> Optional[UserAccount]:
        async with self._session_factory() as session:
            result = await session.execute(
                select(UserORM).where(UserORM.username == username)
            )
            orm = result.scalar_one_or_none()
            return self._orm_to_model(orm) if orm else None

    async def create(self, data: UserCreate) -> UserAccount:
        async with self._session_factory() as session:
            orm = UserORM(
                id=str(uuid4()),
                provider_issuer=data.provider_issuer,
                provider_sub=data.provider_sub,
                email=data.email,
                display_name=data.display_name,
                first_name=data.first_name,
                last_name=data.last_name,
                username=data.username,
                password_hash=data.password_hash,
                timezone=data.timezone,
                enable_weekly_meeting_reminder=data.enable_weekly_meeting_reminder,
            )
            session.add(orm)
            await session.commit()
            await session.refresh(orm)
            return self._orm_to_model(orm)

    async def update_provider(self, user_id: UUID, issuer: str, sub: str) -> UserAccount:
        async with self._session_factory() as session:
            result = await session.execute(
                select(UserORM).where(UserORM.id == str(user_id))
            )
            orm = result.scalar_one_or_none()
            if not orm:
                raise ValueError(f"User {user_id} not found")
            orm.provider_issuer = issuer
            orm.provider_sub = sub
            orm.updated_at = now_utc()
            await session.commit()
            await session.refresh(orm)
            return self._orm_to_model(orm)

    async def update(self, user_id: UUID, update: UserUpdate) -> UserAccount:
        async with self._session_factory() as session:
            result = await session.execute(
                select(UserORM).where(UserORM.id == str(user_id))
            )
            orm = result.scalar_one_or_none()
            if not orm:
                raise ValueError(f"User {user_id} not found")

            if update.provider_sub is not None:
                orm.provider_sub = update.provider_sub
            if update.email is not None:
                orm.email = update.email
            if update.display_name is not None:
                orm.display_name = update.display_name
            if update.first_name is not None:
                orm.first_name = update.first_name
            if update.last_name is not None:
                orm.last_name = update.last_name
            if update.username is not None:
                orm.username = update.username
            if update.password_hash is not None:
                orm.password_hash = update.password_hash
            if update.timezone is not None:
                orm.timezone = update.timezone
            if update.enable_weekly_meeting_reminder is not None:
                orm.enable_weekly_meeting_reminder = update.enable_weekly_meeting_reminder

            orm.updated_at = now_utc()
            await session.commit()
            await session.refresh(orm)
            return self._orm_to_model(orm)

    async def search(self, query: str, limit: int = 10) -> list[UserAccount]:
        """Search users by username or email (partial match)."""
        async with self._session_factory() as session:
            pattern = f"%{query}%"
            result = await session.execute(
                select(UserORM)
                .where(
                    or_(
                        UserORM.username.ilike(pattern),
                        UserORM.email.ilike(pattern),
                        UserORM.display_name.ilike(pattern),
                        UserORM.first_name.ilike(pattern),
                        UserORM.last_name.ilike(pattern),
                    )
                )
                .limit(limit)
            )
            return [self._orm_to_model(orm) for orm in result.scalars().all()]

    async def list_all(self) -> list[UserAccount]:
        """List all users."""
        async with self._session_factory() as session:
            result = await session.execute(select(UserORM))
            return [self._orm_to_model(orm) for orm in result.scalars().all()]
