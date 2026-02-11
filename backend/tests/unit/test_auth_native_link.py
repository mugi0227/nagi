"""
Unit tests for native link auth code exchange.
"""

from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest
from fastapi import HTTPException

from app.api.auth import (
    _NATIVE_LINK_CODE_TTL_SECONDS,
    NativeLinkExchangeRequest,
    _clear_native_link_store,
    exchange_native_link,
    start_native_link,
)
from app.interfaces.auth_provider import User


def _make_user() -> User:
    return User(
        id="user-123",
        email="user@example.com",
        display_name="User Example",
    )


@pytest.mark.asyncio
async def test_native_link_start_and_exchange_success() -> None:
    _clear_native_link_store()
    user = _make_user()

    started = await start_native_link(user=user, authorization="Bearer token-abc")
    assert started.code
    assert started.expires_at.tzinfo is not None

    exchanged = await exchange_native_link(NativeLinkExchangeRequest(code=started.code))
    assert exchanged.access_token == "token-abc"
    assert exchanged.user.id == user.id
    assert exchanged.user.email == user.email
    assert exchanged.user.display_name == user.display_name


@pytest.mark.asyncio
async def test_native_link_exchange_is_one_time() -> None:
    _clear_native_link_store()
    user = _make_user()

    started = await start_native_link(user=user, authorization="Bearer token-abc")
    await exchange_native_link(NativeLinkExchangeRequest(code=started.code))

    with pytest.raises(HTTPException) as exc_info:
        await exchange_native_link(NativeLinkExchangeRequest(code=started.code))

    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == "Invalid or expired code"


@pytest.mark.asyncio
async def test_native_link_start_requires_authorization_header() -> None:
    _clear_native_link_store()
    user = _make_user()

    with pytest.raises(HTTPException) as exc_info:
        await start_native_link(user=user, authorization=None)

    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == "Authorization header required"


@pytest.mark.asyncio
async def test_native_link_exchange_rejects_expired_code() -> None:
    _clear_native_link_store()
    user = _make_user()
    now = datetime(2026, 2, 11, 0, 0, tzinfo=timezone.utc)

    with patch("app.api.auth._utcnow", return_value=now):
        started = await start_native_link(user=user, authorization="Bearer token-abc")

    expired = now + timedelta(seconds=_NATIVE_LINK_CODE_TTL_SECONDS + 1)
    with patch("app.api.auth._utcnow", return_value=expired):
        with pytest.raises(HTTPException) as exc_info:
            await exchange_native_link(NativeLinkExchangeRequest(code=started.code))

    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == "Invalid or expired code"
