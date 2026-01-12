"""
User profile and credential endpoints.
"""

from __future__ import annotations

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app.api.deps import CurrentUser, UserRepo
from app.core.config import get_settings
from app.core.security import hash_password, verify_password
from app.models.user import UserUpdate

router = APIRouter()


class UserProfile(BaseModel):
    id: str
    email: Optional[str] = None
    display_name: Optional[str] = None
    username: Optional[str] = None


class UpdateCredentialsRequest(BaseModel):
    current_password: str = Field(..., min_length=8, max_length=128)
    username: Optional[str] = Field(None, min_length=3, max_length=50)
    email: Optional[str] = Field(None, min_length=3, max_length=255)
    new_password: Optional[str] = Field(None, min_length=8, max_length=128)


@router.get("/me", response_model=UserProfile)
async def get_current_user_profile(
    user: CurrentUser,
    user_repo: UserRepo,
) -> UserProfile:
    profile = UserProfile(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        username=None,
    )
    try:
        user_uuid = UUID(user.id)
    except Exception:
        return profile

    record = await user_repo.get(user_uuid)
    if not record:
        return profile

    return UserProfile(
        id=str(record.id),
        email=record.email or user.email,
        display_name=record.display_name or user.display_name,
        username=record.username,
    )


@router.patch("/me/credentials", response_model=UserProfile)
async def update_credentials(
    data: UpdateCredentialsRequest,
    user: CurrentUser,
    user_repo: UserRepo,
) -> UserProfile:
    settings = get_settings()
    if settings.AUTH_PROVIDER != "local":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Credential updates are only available for local auth",
        )

    try:
        user_uuid = UUID(user.id)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid user id",
        )

    record = await user_repo.get(user_uuid)
    if not record or not record.password_hash:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    if not verify_password(data.current_password, record.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid current password",
        )

    update_fields = UserUpdate()

    if data.username:
        username = data.username.strip()
        if username and username != record.username:
            existing = await user_repo.get_by_username(username)
            if existing and existing.id != record.id:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Username already exists",
                )
            update_fields.username = username
            update_fields.provider_sub = username
            update_fields.display_name = username

    if data.email:
        email = data.email.strip().lower()
        if email and email != (record.email or ""):
            existing = await user_repo.get_by_email(email)
            if existing and existing.id != record.id:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Email already exists",
                )
            update_fields.email = email

    if data.new_password:
        update_fields.password_hash = hash_password(data.new_password)

    if not any(
        value is not None
        for value in (
            update_fields.username,
            update_fields.email,
            update_fields.password_hash,
        )
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No changes provided",
        )

    updated = await user_repo.update(user_uuid, update_fields)
    return UserProfile(
        id=str(updated.id),
        email=updated.email,
        display_name=updated.display_name,
        username=updated.username,
    )
