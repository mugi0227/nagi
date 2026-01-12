"""
Models for AI-driven phase and task breakdowns.
"""

from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.enums import EnergyLevel, Priority


class MilestoneSuggestion(BaseModel):
    """Suggested milestone for a phase."""

    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=2000)
    due_date: Optional[str] = Field(None, description="ISO date string if known")


class PhaseSuggestion(BaseModel):
    """Suggested phase with milestones."""

    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=2000)
    milestones: list[MilestoneSuggestion] = Field(default_factory=list)


class PhaseBreakdownRequest(BaseModel):
    """Request to generate phases and milestones for a project."""

    create_phases: bool = Field(False, description="Create phases in the database")
    create_milestones: bool = Field(False, description="Create milestones in the database")
    instruction: Optional[str] = Field(
        None,
        description="User instruction or constraints for planning",
    )


class PhaseBreakdownResponse(BaseModel):
    """Response for phase breakdown."""

    phases: list[PhaseSuggestion]
    created_phase_ids: list[UUID] = Field(default_factory=list)
    created_milestone_ids: list[UUID] = Field(default_factory=list)


class PhaseTaskSuggestion(BaseModel):
    """Suggested task for a phase."""

    title: str = Field(..., min_length=1, max_length=500)
    description: Optional[str] = Field(None, max_length=2000)
    estimated_minutes: Optional[int] = Field(None, ge=5, le=480)
    energy_level: Optional[EnergyLevel] = EnergyLevel.LOW
    importance: Optional[Priority] = Priority.MEDIUM
    urgency: Optional[Priority] = Priority.MEDIUM
    due_date: Optional[str] = Field(None, description="ISO date string if known")


class PhaseTaskBreakdownRequest(BaseModel):
    """Request to generate tasks for a phase."""

    create_tasks: bool = Field(False, description="Create tasks in the database")
    instruction: Optional[str] = Field(
        None,
        description="User instruction or constraints for task breakdown",
    )


class PhaseTaskBreakdownResponse(BaseModel):
    """Response for phase task breakdown."""

    tasks: list[PhaseTaskSuggestion]
    created_task_ids: list[UUID] = Field(default_factory=list)
