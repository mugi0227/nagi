"""
Schedule settings API endpoints.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import CurrentUser, ScheduleSettingsRepo
from app.models.schedule_plan import ScheduleSettings, ScheduleSettingsUpdate

router = APIRouter()


@router.get("/schedule-settings", response_model=ScheduleSettings)
async def get_schedule_settings(
    user: CurrentUser,
    repo: ScheduleSettingsRepo,
):
    settings = await repo.get(user.id)
    if settings:
        return settings
    return await repo.upsert(user.id, ScheduleSettingsUpdate())


@router.put("/schedule-settings", response_model=ScheduleSettings)
async def update_schedule_settings(
    payload: ScheduleSettingsUpdate,
    user: CurrentUser,
    repo: ScheduleSettingsRepo,
):
    return await repo.upsert(user.id, payload)
