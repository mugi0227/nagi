"""
User account models for authentication mapping.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class UserCreate(BaseModel):
    """Create a user account."""

    provider_issuer: str = Field(..., min_length=1, max_length=500)
    provider_sub: str = Field(..., min_length=1, max_length=255)
    email: Optional[str] = Field(None, max_length=255)
    display_name: Optional[str] = Field(None, max_length=255)


class UserAccount(BaseModel):
    """User account stored in the database."""

    id: UUID
    provider_issuer: str
    provider_sub: str
    email: Optional[str] = None
    display_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
