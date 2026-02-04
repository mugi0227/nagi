"""
Issue comment model definitions.

Users can comment on issues in the public feedback board.
"""

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class IssueCommentCreate(BaseModel):
    """Schema for creating a comment."""

    content: str = Field(..., min_length=1, max_length=2000, description="コメント内容")


class IssueComment(BaseModel):
    """Complete comment model."""

    id: UUID
    issue_id: UUID
    user_id: str
    display_name: Optional[str] = None
    content: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class IssueCommentListResponse(BaseModel):
    """Response for comment list."""

    comments: list[IssueComment]
    total: int
