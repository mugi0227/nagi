"""
Custom exceptions for the application.
"""

from typing import Any, Optional


class SecretaryError(Exception):
    """Base exception for nagi."""

    def __init__(self, message: str, details: Optional[Any] = None):
        self.message = message
        self.details = details
        super().__init__(message)


class NotFoundError(SecretaryError):
    """Resource not found."""

    pass


class DuplicateError(SecretaryError):
    """Duplicate resource detected."""

    pass


class ValidationError(SecretaryError):
    """Validation error."""

    pass


class LLMError(SecretaryError):
    """LLM-related error."""

    pass


class LLMValidationError(LLMError):
    """LLM output validation failed."""

    def __init__(self, message: str, raw_output: str, attempts: int = 1):
        super().__init__(message, details={"raw_output": raw_output, "attempts": attempts})
        self.raw_output = raw_output
        self.attempts = attempts


class AuthenticationError(SecretaryError):
    """Authentication failed."""

    pass


class AuthorizationError(SecretaryError):
    """Authorization failed."""

    pass


class ForbiddenError(AuthorizationError):
    """Forbidden operation (authorization denied)."""

    pass


class InfrastructureError(SecretaryError):
    """Infrastructure-related error (DB, external services, etc.)."""

    pass


class BusinessLogicError(SecretaryError):
    """Business logic constraint violation."""

    pass
