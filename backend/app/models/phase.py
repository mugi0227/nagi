"""
Phase model definitions.

Phases represent intermediate grouping between projects and tasks.
Projects can be broken down into phases, phases into tasks, and tasks into subtasks.
"""

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.enums import PhaseStatus


class PhaseBase(BaseModel):
    """Base phase fields."""

    name: str = Field(..., min_length=1, max_length=200, description="フェーズ名")
    description: Optional[str] = Field(None, max_length=2000, description="フェーズの説明")
    project_id: UUID = Field(..., description="所属プロジェクトID")
    order_in_project: int = Field(default=1, ge=1, description="プロジェクト内での順序（1から始まる連番）")
    start_date: Optional[datetime] = Field(None, description="フェーズ開始予定日")
    end_date: Optional[datetime] = Field(None, description="フェーズ終了予定日")


class PhaseCreate(PhaseBase):
    """Schema for creating a new phase."""

    pass


class PhaseUpdate(BaseModel):
    """Schema for updating an existing phase."""

    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=2000)
    status: Optional[PhaseStatus] = None
    order_in_project: Optional[int] = Field(None, ge=1)
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None


class Phase(PhaseBase):
    """Complete phase model."""

    id: UUID
    user_id: str = Field(..., description="所有者ユーザーID")
    status: PhaseStatus = Field(PhaseStatus.ACTIVE)
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class PhaseWithTaskCount(Phase):
    """Phase with task statistics."""

    total_tasks: int = 0
    completed_tasks: int = 0
    in_progress_tasks: int = 0
