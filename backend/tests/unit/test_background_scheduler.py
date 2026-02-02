"""
Unit tests for BackgroundScheduler period calculations.
"""

from datetime import datetime

from app.services.background_scheduler import BackgroundScheduler


class TestCalculateLastFriday:
    """Tests for _calculate_last_friday static method."""

    def test_on_friday_after_1am_returns_same_friday(self):
        """Friday 02:00 UTC should return that same Friday 00:00."""
        now = datetime(2026, 1, 30, 2, 0, 0)  # Friday 02:00
        result = BackgroundScheduler._calculate_last_friday(now)
        assert result == datetime(2026, 1, 30, 0, 0, 0)

    def test_on_friday_before_1am_returns_previous_friday(self):
        """Friday 00:30 UTC should return the *previous* Friday 00:00."""
        now = datetime(2026, 1, 30, 0, 30, 0)  # Friday 00:30
        result = BackgroundScheduler._calculate_last_friday(now)
        assert result == datetime(2026, 1, 23, 0, 0, 0)

    def test_on_friday_exactly_midnight_returns_previous_friday(self):
        """Friday 00:00:00 should return previous Friday (before 01:00 guard)."""
        now = datetime(2026, 1, 30, 0, 0, 0)  # Friday 00:00:00
        result = BackgroundScheduler._calculate_last_friday(now)
        assert result == datetime(2026, 1, 23, 0, 0, 0)

    def test_on_saturday_returns_yesterday_friday(self):
        """Saturday should return the previous day (Friday) 00:00."""
        now = datetime(2026, 1, 31, 14, 30, 0)  # Saturday 14:30
        result = BackgroundScheduler._calculate_last_friday(now)
        assert result == datetime(2026, 1, 30, 0, 0, 0)

    def test_on_sunday_returns_friday(self):
        """Sunday should return the most recent Friday 00:00."""
        now = datetime(2026, 2, 1, 10, 0, 0)  # Sunday 10:00
        result = BackgroundScheduler._calculate_last_friday(now)
        assert result == datetime(2026, 1, 30, 0, 0, 0)

    def test_on_monday_returns_last_friday(self):
        """Monday should return the most recent Friday 00:00."""
        now = datetime(2026, 2, 2, 9, 0, 0)  # Monday 09:00
        result = BackgroundScheduler._calculate_last_friday(now)
        assert result == datetime(2026, 1, 30, 0, 0, 0)

    def test_on_tuesday_returns_last_friday(self):
        """Tuesday should return the most recent Friday 00:00."""
        now = datetime(2026, 2, 3, 14, 30, 0)  # Tuesday 14:30
        result = BackgroundScheduler._calculate_last_friday(now)
        assert result == datetime(2026, 1, 30, 0, 0, 0)

    def test_on_wednesday_returns_last_friday(self):
        """Wednesday should return the most recent Friday 00:00."""
        now = datetime(2026, 2, 4, 8, 0, 0)  # Wednesday
        result = BackgroundScheduler._calculate_last_friday(now)
        assert result == datetime(2026, 1, 30, 0, 0, 0)

    def test_on_thursday_returns_last_friday(self):
        """Thursday should return the Friday from 6 days ago."""
        now = datetime(2026, 2, 5, 10, 0, 0)  # Thursday 10:00
        result = BackgroundScheduler._calculate_last_friday(now)
        assert result == datetime(2026, 1, 30, 0, 0, 0)

    def test_result_has_zero_time_components(self):
        """Result should always be at exactly 00:00:00.000000."""
        now = datetime(2026, 2, 3, 14, 30, 45, 123456)
        result = BackgroundScheduler._calculate_last_friday(now)
        assert result.hour == 0
        assert result.minute == 0
        assert result.second == 0
        assert result.microsecond == 0

    def test_defaults_to_utcnow_when_no_arg(self):
        """Should not raise when called without arguments."""
        result = BackgroundScheduler._calculate_last_friday()
        assert result.weekday() == 4  # Always a Friday
        assert result.hour == 0
        assert result.minute == 0
