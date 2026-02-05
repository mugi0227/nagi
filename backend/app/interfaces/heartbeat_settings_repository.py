from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Optional

from app.models.heartbeat import HeartbeatSettings, HeartbeatSettingsUpdate


class IHeartbeatSettingsRepository(ABC):
    @abstractmethod
    async def get(self, user_id: str) -> Optional[HeartbeatSettings]:
        pass

    @abstractmethod
    async def upsert(self, user_id: str, update: HeartbeatSettingsUpdate) -> HeartbeatSettings:
        pass
