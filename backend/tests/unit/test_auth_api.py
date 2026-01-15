"""
Unit tests for authentication API.
"""

import pytest
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from fastapi import HTTPException

from app.api.auth import (
    _check_email_whitelist,
    _get_whitelist_emails,
    _normalize_email,
    register,
    RegisterRequest,
)
from app.core.config import Settings
from app.models.user import UserAccount


class TestEmailNormalization:
    """Tests for email normalization."""

    def test_normalize_email_lowercase(self):
        assert _normalize_email("Test@Example.COM") == "test@example.com"

    def test_normalize_email_strips_whitespace(self):
        assert _normalize_email("  test@example.com  ") == "test@example.com"

    def test_normalize_email_combined(self):
        assert _normalize_email("  TEST@EXAMPLE.COM  ") == "test@example.com"


class TestWhitelistParsing:
    """Tests for whitelist email parsing."""

    def test_empty_whitelist(self):
        settings = MagicMock()
        settings.REGISTRATION_WHITELIST_EMAILS = ""
        assert _get_whitelist_emails(settings) == set()

    def test_single_email(self):
        settings = MagicMock()
        settings.REGISTRATION_WHITELIST_EMAILS = "user@example.com"
        assert _get_whitelist_emails(settings) == {"user@example.com"}

    def test_multiple_emails(self):
        settings = MagicMock()
        settings.REGISTRATION_WHITELIST_EMAILS = "user1@example.com,user2@example.com"
        assert _get_whitelist_emails(settings) == {"user1@example.com", "user2@example.com"}

    def test_whitespace_handling(self):
        settings = MagicMock()
        settings.REGISTRATION_WHITELIST_EMAILS = "  user1@example.com , user2@example.com  "
        assert _get_whitelist_emails(settings) == {"user1@example.com", "user2@example.com"}

    def test_case_normalization(self):
        settings = MagicMock()
        settings.REGISTRATION_WHITELIST_EMAILS = "User@EXAMPLE.com"
        assert _get_whitelist_emails(settings) == {"user@example.com"}

    def test_empty_entries_ignored(self):
        settings = MagicMock()
        settings.REGISTRATION_WHITELIST_EMAILS = "user1@example.com,,user2@example.com,"
        assert _get_whitelist_emails(settings) == {"user1@example.com", "user2@example.com"}


class TestWhitelistCheck:
    """Tests for whitelist email check."""

    def test_no_whitelist_allows_all(self):
        settings = MagicMock()
        settings.REGISTRATION_WHITELIST_EMAILS = ""
        # Should not raise
        _check_email_whitelist("anyone@anywhere.com", settings)

    def test_whitelist_allows_listed_email(self):
        settings = MagicMock()
        settings.REGISTRATION_WHITELIST_EMAILS = "allowed@example.com"
        # Should not raise
        _check_email_whitelist("allowed@example.com", settings)

    def test_whitelist_allows_listed_email_case_insensitive(self):
        settings = MagicMock()
        settings.REGISTRATION_WHITELIST_EMAILS = "allowed@example.com"
        # Should not raise
        _check_email_whitelist("ALLOWED@EXAMPLE.COM", settings)

    def test_whitelist_rejects_unlisted_email(self):
        settings = MagicMock()
        settings.REGISTRATION_WHITELIST_EMAILS = "allowed@example.com"
        with pytest.raises(HTTPException) as exc_info:
            _check_email_whitelist("notallowed@example.com", settings)
        assert exc_info.value.status_code == 403
        assert "not allowed to register" in exc_info.value.detail

    def test_whitelist_multiple_emails_allows_any_listed(self):
        settings = MagicMock()
        settings.REGISTRATION_WHITELIST_EMAILS = "user1@example.com,user2@example.com"
        # Both should be allowed
        _check_email_whitelist("user1@example.com", settings)
        _check_email_whitelist("user2@example.com", settings)


class TestUsernameUniqueness:
    """Tests for username uniqueness check."""

    @pytest.mark.asyncio
    async def test_register_rejects_duplicate_username(self):
        """Test that register rejects duplicate username."""
        # Mock the user repository
        mock_repo = AsyncMock()
        mock_repo.get_by_username.return_value = MagicMock()  # User exists

        # Mock settings
        with patch("app.api.auth.get_settings") as mock_get_settings:
            mock_settings = MagicMock()
            mock_settings.AUTH_PROVIDER = "local"
            mock_settings.LOCAL_JWT_SECRET = "test-secret"
            mock_settings.REGISTRATION_WHITELIST_EMAILS = ""
            mock_get_settings.return_value = mock_settings

            request = RegisterRequest(
                username="existing_user",
                email="new@example.com",
                password="password123",
            )

            with pytest.raises(HTTPException) as exc_info:
                await register(request, mock_repo)

            assert exc_info.value.status_code == 409
            assert "Username already exists" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_register_rejects_duplicate_email(self):
        """Test that register rejects duplicate email."""
        mock_repo = AsyncMock()
        mock_repo.get_by_username.return_value = None  # No existing username
        mock_repo.get_by_email.return_value = MagicMock()  # Email exists

        with patch("app.api.auth.get_settings") as mock_get_settings:
            mock_settings = MagicMock()
            mock_settings.AUTH_PROVIDER = "local"
            mock_settings.LOCAL_JWT_SECRET = "test-secret"
            mock_settings.REGISTRATION_WHITELIST_EMAILS = ""
            mock_get_settings.return_value = mock_settings

            request = RegisterRequest(
                username="new_user",
                email="existing@example.com",
                password="password123",
            )

            with pytest.raises(HTTPException) as exc_info:
                await register(request, mock_repo)

            assert exc_info.value.status_code == 409
            assert "Email already exists" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_register_success_with_unique_credentials(self):
        """Test successful registration with unique username and email."""
        mock_repo = AsyncMock()
        mock_repo.get_by_username.return_value = None
        mock_repo.get_by_email.return_value = None

        # Mock created user
        now = datetime.utcnow()
        created_user = UserAccount(
            id=uuid4(),
            provider_issuer="local",
            provider_sub="newuser",
            email="new@example.com",
            display_name="newuser",
            username="newuser",
            created_at=now,
            updated_at=now,
        )
        mock_repo.create.return_value = created_user

        with patch("app.api.auth.get_settings") as mock_get_settings:
            mock_settings = MagicMock()
            mock_settings.AUTH_PROVIDER = "local"
            mock_settings.LOCAL_JWT_SECRET = "test-secret"
            mock_settings.LOCAL_JWT_ISSUER = "test"
            mock_settings.LOCAL_JWT_EXPIRE_MINUTES = 60
            mock_settings.REGISTRATION_WHITELIST_EMAILS = ""
            mock_get_settings.return_value = mock_settings

            request = RegisterRequest(
                username="newuser",
                email="new@example.com",
                password="password123",
            )

            result = await register(request, mock_repo)

            assert result.user.username == "newuser"
            assert result.user.email == "new@example.com"
            assert result.access_token is not None


class TestWhitelistIntegration:
    """Integration tests for whitelist with registration."""

    @pytest.mark.asyncio
    async def test_register_blocked_by_whitelist(self):
        """Test that registration is blocked when email not in whitelist."""
        mock_repo = AsyncMock()

        with patch("app.api.auth.get_settings") as mock_get_settings:
            mock_settings = MagicMock()
            mock_settings.AUTH_PROVIDER = "local"
            mock_settings.LOCAL_JWT_SECRET = "test-secret"
            mock_settings.REGISTRATION_WHITELIST_EMAILS = "allowed@example.com"
            mock_get_settings.return_value = mock_settings

            request = RegisterRequest(
                username="newuser",
                email="notallowed@example.com",
                password="password123",
            )

            with pytest.raises(HTTPException) as exc_info:
                await register(request, mock_repo)

            assert exc_info.value.status_code == 403
            assert "not allowed to register" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_register_allowed_by_whitelist(self):
        """Test that registration succeeds when email is in whitelist."""
        mock_repo = AsyncMock()
        mock_repo.get_by_username.return_value = None
        mock_repo.get_by_email.return_value = None

        now = datetime.utcnow()
        created_user = UserAccount(
            id=uuid4(),
            provider_issuer="local",
            provider_sub="alloweduser",
            email="allowed@example.com",
            display_name="alloweduser",
            username="alloweduser",
            created_at=now,
            updated_at=now,
        )
        mock_repo.create.return_value = created_user

        with patch("app.api.auth.get_settings") as mock_get_settings:
            mock_settings = MagicMock()
            mock_settings.AUTH_PROVIDER = "local"
            mock_settings.LOCAL_JWT_SECRET = "test-secret"
            mock_settings.LOCAL_JWT_ISSUER = "test"
            mock_settings.LOCAL_JWT_EXPIRE_MINUTES = 60
            mock_settings.REGISTRATION_WHITELIST_EMAILS = "allowed@example.com"
            mock_get_settings.return_value = mock_settings

            request = RegisterRequest(
                username="alloweduser",
                email="allowed@example.com",
                password="password123",
            )

            result = await register(request, mock_repo)

            assert result.user.email == "allowed@example.com"
