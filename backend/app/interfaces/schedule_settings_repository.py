"""
Schedule settings repository interface.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Optional

from app.models.schedule_plan import ScheduleSettings, ScheduleSettingsUpdate


class IScheduleSettingsRepository(ABC):
    @abstractmethod
    async def get(self, user_id: str) -> Optional[ScheduleSettings]:
        pass

    @abstractmethod
    async def upsert(self, user_id: str, update: ScheduleSettingsUpdate) -> ScheduleSettings:
        pass
