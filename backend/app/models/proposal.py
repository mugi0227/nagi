"""Proposal models for AI-suggested actions awaiting user approval."""

from datetime import datetime, timedelta
from enum import Enum
from typing import Optional
from uuid import UUID, uuid4

from pydantic import BaseModel, Field


class ProposalType(str, Enum):
    """Type of action being proposed by AI."""
    CREATE_TASK = "create_task"
    CREATE_PROJECT = "create_project"
    CREATE_SKILL = "create_skill"


class ProposalStatus(str, Enum):
    """Status of a proposal."""
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    EXPIRED = "expired"


class Proposal(BaseModel):
    """A proposal for an action requiring user approval.

    When AI wants to create a task or project, it creates a Proposal
    instead of directly saving to the database. The user can then
    approve or reject the proposal through the UI.
    """
    id: UUID = Field(default_factory=uuid4)
    user_id: UUID
    user_id_raw: Optional[str] = None
    session_id: str  # Chat session ID
    proposal_type: ProposalType
    status: ProposalStatus = ProposalStatus.PENDING
    payload: dict  # CreateTaskInput or CreateProjectInput serialized
    description: str  # AI-generated explanation of the proposal
    created_at: datetime = Field(default_factory=datetime.now)
    expires_at: datetime = Field(
        default_factory=lambda: datetime.now() + timedelta(hours=24)
    )

    class Config:
        json_encoders = {
            UUID: str,
            datetime: lambda v: v.isoformat(),
        }


class ProposalResponse(BaseModel):
    """Response returned when AI creates a proposal."""
    proposal_id: str
    proposal_type: ProposalType
    description: str
    payload: dict


class ApprovalResult(BaseModel):
    """Result of approving a proposal."""
    status: str = "approved"
    task_id: Optional[str] = None
    project_id: Optional[str] = None
    memory_id: Optional[str] = None


class RejectionResult(BaseModel):
    """Result of rejecting a proposal."""
    status: str = "rejected"
