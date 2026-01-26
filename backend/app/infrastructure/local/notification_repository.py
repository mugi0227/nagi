"""
SQLite implementation of notification repository.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4

from sqlalchemy import select, desc, func, update

from app.infrastructure.local.database import NotificationORM, get_session_factory
from app.interfaces.notification_repository import INotificationRepository
from app.models.notification import Notification, NotificationCreate, NotificationType
from app.utils.datetime_utils import now_utc


class SqliteNotificationRepository(INotificationRepository):
    """SQLite implementation of notification repository."""

    def __init__(self, session_factory=None):
        self._session_factory = session_factory or get_session_factory()

    def _orm_to_model(self, orm: NotificationORM) -> Notification:
        return Notification(
            id=UUID(orm.id),
            user_id=orm.user_id,
            type=NotificationType(orm.type),
            title=orm.title,
            message=orm.message,
            link_type=orm.link_type,
            link_id=orm.link_id,
            project_id=UUID(orm.project_id) if orm.project_id else None,
            project_name=orm.project_name,
            is_read=orm.is_read,
            read_at=orm.read_at,
            created_at=orm.created_at,
            updated_at=orm.updated_at,
        )

    async def create(self, notification: NotificationCreate) -> Notification:
        async with self._session_factory() as session:
            now = now_utc()
            orm = NotificationORM(
                id=str(uuid4()),
                user_id=notification.user_id,
                type=notification.type.value,
                title=notification.title,
                message=notification.message,
                link_type=notification.link_type,
                link_id=notification.link_id,
                project_id=str(notification.project_id) if notification.project_id else None,
                project_name=notification.project_name,
                is_read=False,
                read_at=None,
                created_at=now,
                updated_at=now,
            )
            session.add(orm)
            await session.commit()
            await session.refresh(orm)
            return self._orm_to_model(orm)

    async def create_bulk(self, notifications: list[NotificationCreate]) -> list[Notification]:
        async with self._session_factory() as session:
            now = now_utc()
            orms = []
            for notification in notifications:
                orm = NotificationORM(
                    id=str(uuid4()),
                    user_id=notification.user_id,
                    type=notification.type.value,
                    title=notification.title,
                    message=notification.message,
                    link_type=notification.link_type,
                    link_id=notification.link_id,
                    project_id=str(notification.project_id) if notification.project_id else None,
                    project_name=notification.project_name,
                    is_read=False,
                    read_at=None,
                    created_at=now,
                    updated_at=now,
                )
                session.add(orm)
                orms.append(orm)
            await session.commit()
            for orm in orms:
                await session.refresh(orm)
            return [self._orm_to_model(orm) for orm in orms]

    async def get(self, user_id: str, notification_id: UUID) -> Optional[Notification]:
        async with self._session_factory() as session:
            result = await session.execute(
                select(NotificationORM).where(
                    NotificationORM.id == str(notification_id),
                    NotificationORM.user_id == user_id,
                )
            )
            orm = result.scalar_one_or_none()
            return self._orm_to_model(orm) if orm else None

    async def list(
        self,
        user_id: str,
        unread_only: bool = False,
        limit: int = 50,
        offset: int = 0,
    ) -> list[Notification]:
        async with self._session_factory() as session:
            query = select(NotificationORM).where(NotificationORM.user_id == user_id)

            if unread_only:
                query = query.where(NotificationORM.is_read == False)

            query = query.order_by(desc(NotificationORM.created_at))
            query = query.offset(offset).limit(limit)

            result = await session.execute(query)
            return [self._orm_to_model(orm) for orm in result.scalars().all()]

    async def mark_as_read(self, user_id: str, notification_id: UUID) -> Optional[Notification]:
        async with self._session_factory() as session:
            result = await session.execute(
                select(NotificationORM).where(
                    NotificationORM.id == str(notification_id),
                    NotificationORM.user_id == user_id,
                )
            )
            orm = result.scalar_one_or_none()
            if not orm:
                return None

            if not orm.is_read:
                orm.is_read = True
                orm.read_at = now_utc()
                orm.updated_at = now_utc()
                await session.commit()
                await session.refresh(orm)

            return self._orm_to_model(orm)

    async def mark_all_as_read(self, user_id: str) -> int:
        async with self._session_factory() as session:
            now = now_utc()
            result = await session.execute(
                update(NotificationORM)
                .where(
                    NotificationORM.user_id == user_id,
                    NotificationORM.is_read == False,
                )
                .values(is_read=True, read_at=now, updated_at=now)
            )
            await session.commit()
            return result.rowcount

    async def get_unread_count(self, user_id: str) -> int:
        async with self._session_factory() as session:
            result = await session.execute(
                select(func.count(NotificationORM.id)).where(
                    NotificationORM.user_id == user_id,
                    NotificationORM.is_read == False,
                )
            )
            return result.scalar() or 0

    async def delete(self, user_id: str, notification_id: UUID) -> bool:
        async with self._session_factory() as session:
            result = await session.execute(
                select(NotificationORM).where(
                    NotificationORM.id == str(notification_id),
                    NotificationORM.user_id == user_id,
                )
            )
            orm = result.scalar_one_or_none()
            if not orm:
                return False
            await session.delete(orm)
            await session.commit()
            return True
