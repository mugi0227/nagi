"""
Local password authentication provider.
"""

from __future__ import annotations

from typing import Optional
from uuid import UUID

from jose import JWTError, jwt

from app.core.config import Settings
from app.interfaces.auth_provider import IAuthProvider, User
from app.interfaces.user_repository import IUserRepository


class LocalAuthProvider(IAuthProvider):
    """Local auth provider with HMAC JWT validation."""

    def __init__(self, settings: Settings, user_repo: IUserRepository):
        if not settings.LOCAL_JWT_SECRET:
            raise ValueError("LOCAL_JWT_SECRET must be set for local auth")
        self._settings = settings
        self._user_repo = user_repo

    def _decode_token(self, token: str) -> dict[str, object]:
        options = {"verify_iss": bool(self._settings.LOCAL_JWT_ISSUER)}
        return jwt.decode(
            token,
            self._settings.LOCAL_JWT_SECRET,
            algorithms=["HS256"],
            issuer=self._settings.LOCAL_JWT_ISSUER or None,
            options=options,
        )

    async def verify_token(self, token: str) -> User:
        claims = self._decode_token(token)
        subject = claims.get("sub")
        if not subject:
            raise JWTError("Missing subject")
        try:
            user = await self._user_repo.get(UUID(subject))
        except Exception as exc:
            raise JWTError("Invalid subject") from exc
        if not user:
            raise JWTError("User not found")
        return User(
            id=str(user.id),
            email=user.email,
            display_name=user.display_name,
        )

    async def get_user(self, user_id: str) -> Optional[User]:
        try:
            user = await self._user_repo.get(UUID(user_id))
        except Exception:
            return None
        if not user:
            return None
        return User(
            id=str(user.id),
            email=user.email,
            display_name=user.display_name,
        )

    def is_enabled(self) -> bool:
        return True
