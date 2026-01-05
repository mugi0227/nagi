"""
OIDC/JWT authentication provider.
"""

from __future__ import annotations

import time
from typing import Any, Optional

import httpx
from jose import JWTError, jwt

from app.core.config import Settings
from app.interfaces.auth_provider import IAuthProvider, User
from app.interfaces.user_repository import IUserRepository
from app.models.user import UserCreate


class OidcAuthProvider(IAuthProvider):
    """OIDC authentication provider with JWKS validation."""

    def __init__(self, settings: Settings, user_repo: IUserRepository, jwks_ttl_seconds: int = 3600):
        self._settings = settings
        self._user_repo = user_repo
        self._jwks_ttl_seconds = jwks_ttl_seconds
        self._jwks_cache: dict[str, Any] | None = None
        self._jwks_cache_expiry: float = 0.0
        if not self._settings.OIDC_ISSUER and not self._settings.OIDC_JWKS_URL:
            raise ValueError("OIDC_ISSUER or OIDC_JWKS_URL must be set for OIDC auth")

    def _resolve_jwks_url(self) -> str:
        if self._settings.OIDC_JWKS_URL:
            return self._settings.OIDC_JWKS_URL
        issuer = self._settings.OIDC_ISSUER.rstrip("/")
        return f"{issuer}/.well-known/jwks.json"

    async def _get_jwks(self) -> dict[str, Any]:
        now = time.time()
        if self._jwks_cache and now < self._jwks_cache_expiry:
            return self._jwks_cache

        jwks_url = self._resolve_jwks_url()
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(jwks_url)
            response.raise_for_status()
            jwks = response.json()

        self._jwks_cache = jwks
        self._jwks_cache_expiry = now + self._jwks_ttl_seconds
        return jwks

    async def _decode_token(self, token: str) -> dict[str, Any]:
        header = jwt.get_unverified_header(token)
        jwks = await self._get_jwks()
        key = None
        for candidate in jwks.get("keys", []):
            if candidate.get("kid") == header.get("kid"):
                key = candidate
                break
        if not key:
            raise JWTError("Signing key not found")

        options = {
            "verify_aud": bool(self._settings.OIDC_AUDIENCE),
            "verify_iss": bool(self._settings.OIDC_ISSUER),
        }
        return jwt.decode(
            token,
            key,
            algorithms=[header.get("alg", "RS256")],
            audience=self._settings.OIDC_AUDIENCE or None,
            issuer=self._settings.OIDC_ISSUER or None,
            options=options,
        )

    async def verify_token(self, token: str) -> User:
        claims = await self._decode_token(token)

        issuer = claims.get("iss") or self._settings.OIDC_ISSUER
        subject = claims.get("sub")
        if not issuer or not subject:
            raise JWTError("Missing issuer or subject")

        email_claim = self._settings.OIDC_EMAIL_CLAIM or "email"
        name_claim = self._settings.OIDC_NAME_CLAIM or "name"
        email = claims.get(email_claim)
        display_name = claims.get(name_claim) or claims.get("preferred_username")

        user = await self._user_repo.get_by_provider(issuer, subject)
        if not user and self._settings.OIDC_ALLOW_EMAIL_LINKING and email:
            existing = await self._user_repo.get_by_email(email)
            if existing:
                user = await self._user_repo.update_provider(existing.id, issuer, subject)

        if not user:
            user = await self._user_repo.create(
                UserCreate(
                    provider_issuer=issuer,
                    provider_sub=subject,
                    email=email,
                    display_name=display_name,
                )
            )

        return User(
            id=str(user.id),
            email=user.email or email,
            display_name=user.display_name or display_name,
        )

    async def get_user(self, user_id: str) -> Optional[User]:
        try:
            from uuid import UUID

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
