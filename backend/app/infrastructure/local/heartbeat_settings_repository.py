from __future__ import annotations

from typing import Optional

from sqlalchemy import select

from app.infrastructure.local.database import HeartbeatSettingsORM, get_session_factory
from app.interfaces.heartbeat_settings_repository import IHeartbeatSettingsRepository
from app.models.heartbeat import HeartbeatSettings, HeartbeatSettingsUpdate
from app.utils.datetime_utils import now_utc


class SqliteHeartbeatSettingsRepository(IHeartbeatSettingsRepository):
    def _orm_to_model(self, orm: HeartbeatSettingsORM) -> HeartbeatSettings:
        return HeartbeatSettings(
            user_id=orm.user_id,
            enabled=bool(orm.enabled),
            notification_limit_per_day=orm.notification_limit_per_day,
            notification_window_start=orm.notification_window_start,
            notification_window_end=orm.notification_window_end,
            heartbeat_intensity=orm.heartbeat_intensity,
            daily_capacity_per_task_minutes=orm.daily_capacity_per_task_minutes,
            cooldown_hours_per_task=orm.cooldown_hours_per_task,
            created_at=orm.created_at,
            updated_at=orm.updated_at,
        )

    async def get(self, user_id: str) -> Optional[HeartbeatSettings]:
        session_factory = get_session_factory()
        async with session_factory() as session:
            result = await session.execute(
                select(HeartbeatSettingsORM).where(HeartbeatSettingsORM.user_id == user_id)
            )
            orm = result.scalar_one_or_none()
            return self._orm_to_model(orm) if orm else None

    async def upsert(self, user_id: str, update: HeartbeatSettingsUpdate) -> HeartbeatSettings:
        session_factory = get_session_factory()
        async with session_factory() as session:
            result = await session.execute(
                select(HeartbeatSettingsORM).where(HeartbeatSettingsORM.user_id == user_id)
            )
            orm = result.scalar_one_or_none()
            now = now_utc()
            if orm:
                if update.enabled is not None:
                    orm.enabled = update.enabled
                if update.notification_limit_per_day is not None:
                    orm.notification_limit_per_day = update.notification_limit_per_day
                if update.notification_window_start is not None:
                    orm.notification_window_start = update.notification_window_start
                if update.notification_window_end is not None:
                    orm.notification_window_end = update.notification_window_end
                if update.heartbeat_intensity is not None:
                    orm.heartbeat_intensity = update.heartbeat_intensity.value
                if update.daily_capacity_per_task_minutes is not None:
                    orm.daily_capacity_per_task_minutes = update.daily_capacity_per_task_minutes
                if update.cooldown_hours_per_task is not None:
                    orm.cooldown_hours_per_task = update.cooldown_hours_per_task
                orm.updated_at = now
            else:
                orm = HeartbeatSettingsORM(
                    user_id=user_id,
                    enabled=update.enabled if update.enabled is not None else True,
                    notification_limit_per_day=(
                        update.notification_limit_per_day
                        if update.notification_limit_per_day is not None
                        else 2
                    ),
                    notification_window_start=(
                        update.notification_window_start
                        if update.notification_window_start is not None
                        else "09:00"
                    ),
                    notification_window_end=(
                        update.notification_window_end
                        if update.notification_window_end is not None
                        else "21:00"
                    ),
                    heartbeat_intensity=(
                        update.heartbeat_intensity.value
                        if update.heartbeat_intensity is not None
                        else "standard"
                    ),
                    daily_capacity_per_task_minutes=(
                        update.daily_capacity_per_task_minutes
                        if update.daily_capacity_per_task_minutes is not None
                        else 60
                    ),
                    cooldown_hours_per_task=(
                        update.cooldown_hours_per_task
                        if update.cooldown_hours_per_task is not None
                        else 24
                    ),
                    created_at=now,
                    updated_at=now,
                )
                session.add(orm)
            await session.commit()
            await session.refresh(orm)
            return self._orm_to_model(orm)
