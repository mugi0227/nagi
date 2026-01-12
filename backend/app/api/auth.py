"""
Local authentication endpoints (register/login).
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app.api.deps import UserRepo
from app.core.config import Settings, get_settings
from app.core.security import create_access_token, hash_password, verify_password
from app.models.user import UserCreate

router = APIRouter()


class RegisterRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    email: str = Field(..., min_length=3, max_length=255)
    password: str = Field(..., min_length=8, max_length=128)


class LoginRequest(BaseModel):
    identifier: str = Field(..., min_length=3, max_length=255)
    password: str = Field(..., min_length=8, max_length=128)


class AuthUser(BaseModel):
    id: str
    email: Optional[str] = None
    display_name: Optional[str] = None
    username: Optional[str] = None


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: AuthUser


def _normalize_email(value: str) -> str:
    return value.strip().lower()


def _ensure_local_auth(settings: Settings) -> None:
    if settings.AUTH_PROVIDER != "local":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Local auth is not enabled",
        )
    if not settings.LOCAL_JWT_SECRET:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="LOCAL_JWT_SECRET is not configured",
        )


@router.post("/register", response_model=AuthResponse)
async def register(
    data: RegisterRequest,
    user_repo: UserRepo,
) -> AuthResponse:
    settings = get_settings()
    _ensure_local_auth(settings)

    username = data.username.strip()
    if not username:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username is required",
        )
    email = _normalize_email(data.email)
    if not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email is required",
        )
    existing_username = await user_repo.get_by_username(username)
    if existing_username:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username already exists",
        )

    existing_email = await user_repo.get_by_email(email)
    if existing_email:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already exists",
        )

    password_hash = hash_password(data.password)
    user = await user_repo.create(
        UserCreate(
            provider_issuer="local",
            provider_sub=username,
            email=email,
            display_name=username,
            username=username,
            password_hash=password_hash,
        )
    )
    token = create_access_token(str(user.id), settings)
    return AuthResponse(
        access_token=token,
        user=AuthUser(
            id=str(user.id),
            email=user.email,
            display_name=user.display_name,
            username=user.username,
        ),
    )


@router.post("/login", response_model=AuthResponse)
async def login(
    data: LoginRequest,
    user_repo: UserRepo,
) -> AuthResponse:
    settings = get_settings()
    _ensure_local_auth(settings)

    identifier = data.identifier.strip()
    if not identifier:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Identifier is required",
        )
    user = None
    if "@" in identifier:
        user = await user_repo.get_by_email(_normalize_email(identifier))
    if not user:
        user = await user_repo.get_by_username(identifier)

    if not user or not user.password_hash or user.provider_issuer != "local":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )
    if not verify_password(data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    token = create_access_token(str(user.id), settings)
    return AuthResponse(
        access_token=token,
        user=AuthUser(
            id=str(user.id),
            email=user.email,
            display_name=user.display_name,
            username=user.username,
        ),
    )
