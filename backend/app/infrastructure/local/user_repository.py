"""
SQLite implementation of user repository.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4

from sqlalchemy import select, and_

from app.infrastructure.local.database import UserORM, get_session_factory
from app.interfaces.user_repository import IUserRepository
from app.models.user import UserAccount, UserCreate


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

    async def create(self, data: UserCreate) -> UserAccount:
        async with self._session_factory() as session:
            orm = UserORM(
                id=str(uuid4()),
                provider_issuer=data.provider_issuer,
                provider_sub=data.provider_sub,
                email=data.email,
                display_name=data.display_name,
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
            orm.updated_at = datetime.utcnow()
            await session.commit()
            await session.refresh(orm)
            return self._orm_to_model(orm)
