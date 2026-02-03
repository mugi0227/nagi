"""
Issue model definitions.

Issues are shared across all users as a public feedback board.
Users can post feature requests, bug reports, and improvements.
"""

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.enums import IssueCategory, IssueStatus


class IssueBase(BaseModel):
    """Base issue fields."""

    title: str = Field(..., min_length=1, max_length=200, description="要望タイトル")
    content: str = Field(..., min_length=1, max_length=5000, description="要望の詳細")
    category: IssueCategory = Field(..., description="カテゴリ")


class IssueCreate(IssueBase):
    """Schema for creating a new issue."""

    pass


class IssueUpdate(BaseModel):
    """Schema for updating an existing issue (by author)."""

    title: Optional[str] = Field(None, min_length=1, max_length=200)
    content: Optional[str] = Field(None, min_length=1, max_length=5000)
    category: Optional[IssueCategory] = None


class IssueStatusUpdate(BaseModel):
    """Schema for updating issue status (by admin)."""

    status: IssueStatus
    admin_response: Optional[str] = Field(None, max_length=2000, description="管理者からの回答")


class Issue(IssueBase):
    """Complete issue model."""

    id: UUID
    user_id: str = Field(..., description="投稿者のユーザーID")
    display_name: Optional[str] = Field(None, description="投稿者の表示名")
    status: IssueStatus = Field(default=IssueStatus.OPEN)
    like_count: int = Field(default=0)
    liked_by_me: bool = Field(default=False, description="現在のユーザーがいいねしているか")
    admin_response: Optional[str] = Field(None, description="管理者からの回答")
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class IssueLike(BaseModel):
    """Issue like model."""

    id: UUID
    issue_id: UUID
    user_id: str
    created_at: datetime

    class Config:
        from_attributes = True


class IssueListResponse(BaseModel):
    """Response for issue list."""

    items: list[Issue]
    total: int


class IssueCommentCreate(BaseModel):
    """Schema for creating a new issue comment."""

    content: str = Field(..., min_length=1, max_length=2000, description="コメント内容")


class IssueComment(BaseModel):
    """Complete issue comment model."""

    id: UUID
    issue_id: UUID
    user_id: str
    display_name: Optional[str] = None
    content: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
