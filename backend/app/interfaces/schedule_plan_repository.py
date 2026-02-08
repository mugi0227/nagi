"""
Daily schedule plan repository interface.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import date, datetime
from typing import Optional
from uuid import UUID

from app.models.schedule_plan import (
    DailySchedulePlan,
    DailySchedulePlanCreate,
    ScheduleTimeBlock,
    TaskPlanSnapshot,
)


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

    @abstractmethod
    async def update_time_block(
        self,
        user_id: str,
        plan_date: date,
        task_id: UUID,
        new_start: datetime,
        new_end: datetime,
    ) -> Optional[ScheduleTimeBlock]:
        """Update a single time block's start/end within a day plan."""
        pass

    @abstractmethod
    async def move_time_block_across_days(
        self,
        user_id: str,
        source_date: date,
        target_date: date,
        task_id: UUID,
        new_start: datetime,
        new_end: datetime,
    ) -> Optional[ScheduleTimeBlock]:
        """Move a time block from one day's plan to another."""
        pass

    @abstractmethod
    async def update_task_snapshot_for_group(
        self,
        user_id: str,
        plan_group_id: UUID,
        snapshot: TaskPlanSnapshot,
    ) -> None:
        """Upsert one task snapshot for all plans in the same plan group."""
        pass
