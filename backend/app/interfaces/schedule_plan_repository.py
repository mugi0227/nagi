"""
Daily schedule plan repository interface.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import date
from typing import Optional

from app.models.schedule_plan import DailySchedulePlan, DailySchedulePlanCreate


class IDailySchedulePlanRepository(ABC):
    @abstractmethod
    async def upsert_many(
        self,
        user_id: str,
        plans: list[DailySchedulePlanCreate],
    ) -> list[DailySchedulePlan]:
        pass

    @abstractmethod
    async def get_by_date(
        self,
        user_id: str,
        plan_date: date,
    ) -> Optional[DailySchedulePlan]:
        pass

    @abstractmethod
    async def list_by_range(
        self,
        user_id: str,
        start_date: date,
        end_date: date,
    ) -> list[DailySchedulePlan]:
        pass
