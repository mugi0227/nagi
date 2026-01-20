"""
Timezone-aware datetime utilities.

This module provides utilities for working with timezone-aware datetimes,
ensuring consistent handling across the application.
"""

from datetime import datetime, date, timezone
from zoneinfo import ZoneInfo
from typing import Optional

# UTC timezone constant
UTC = timezone.utc


def now_utc() -> datetime:
    """
    Get current UTC datetime (timezone-aware).

    Replaces datetime.utcnow() which is deprecated in Python 3.12+.

    Returns:
        datetime: Current UTC time with tzinfo set to UTC
    """
    return datetime.now(UTC)


def get_user_today(user_timezone: str) -> date:
    """
    Get today's date in the user's timezone.

    Args:
        user_timezone: IANA timezone name (e.g., "Asia/Tokyo", "America/New_York")

    Returns:
        date: Today's date in the user's timezone

    Example:
        >>> get_user_today("Asia/Tokyo")  # When UTC is 2024-01-19 23:00
        date(2024, 1, 20)  # JST is 2024-01-20 08:00
    """
    tz = ZoneInfo(user_timezone)
    return datetime.now(UTC).astimezone(tz).date()


def parse_iso_to_utc(iso_string: str) -> datetime:
    """
    Parse ISO datetime string to UTC timezone-aware datetime.

    Handles:
    - ISO strings with 'Z' suffix (UTC): "2024-01-20T09:00:00Z"
    - ISO strings with timezone offset: "2024-01-20T09:00:00+09:00"
    - Naive ISO strings (assumes UTC): "2024-01-20T09:00:00"

    Args:
        iso_string: ISO 8601 formatted datetime string

    Returns:
        datetime: Timezone-aware datetime in UTC

    Raises:
        ValueError: If the string cannot be parsed
    """
    # Replace 'Z' with '+00:00' for fromisoformat compatibility
    normalized = iso_string.replace("Z", "+00:00")

    dt = datetime.fromisoformat(normalized)

    # If naive (no timezone info), assume UTC
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)

    # Convert to UTC
    return dt.astimezone(UTC)


def ensure_utc(dt: Optional[datetime]) -> Optional[datetime]:
    """
    Ensure datetime is timezone-aware and in UTC.

    Args:
        dt: datetime to convert (can be None, naive, or timezone-aware)

    Returns:
        Optional[datetime]: UTC timezone-aware datetime, or None if input is None
    """
    if dt is None:
        return None

    if dt.tzinfo is None:
        # Naive datetime - assume UTC
        return dt.replace(tzinfo=UTC)

    # Already timezone-aware - convert to UTC
    return dt.astimezone(UTC)


def user_datetime_to_utc(dt: datetime, user_timezone: str) -> datetime:
    """
    Convert a naive datetime from user's timezone to UTC.

    Use this when the user specifies a datetime in their local timezone
    and you need to store it as UTC.

    Args:
        dt: Naive datetime in user's timezone
        user_timezone: IANA timezone name

    Returns:
        datetime: Timezone-aware datetime in UTC

    Example:
        >>> dt = datetime(2024, 1, 20, 9, 0)  # User says "9:00 AM"
        >>> user_datetime_to_utc(dt, "Asia/Tokyo")
        datetime(2024, 1, 20, 0, 0, 0, tzinfo=timezone.utc)  # UTC 00:00
    """
    tz = ZoneInfo(user_timezone)
    localized = dt.replace(tzinfo=tz)
    return localized.astimezone(UTC)
