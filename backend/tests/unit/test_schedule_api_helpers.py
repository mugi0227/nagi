"""
Unit tests for schedule capacity helpers.
"""

from app.services.daily_schedule_plan_service import _apply_capacity_buffer


def test_apply_capacity_buffer_uses_default():
    capacity_by_weekday = [8.0] * 7
    adjusted = _apply_capacity_buffer(capacity_by_weekday, 1.0)
    assert adjusted == [7.0] * 7


def test_apply_capacity_buffer_with_explicit_capacity():
    capacity_by_weekday = [6.0, 7.5, 4.0, 2.0, 0.5, 8.0, 9.0]
    adjusted = _apply_capacity_buffer(capacity_by_weekday, 1.5)
    assert adjusted == [4.5, 6.0, 2.5, 0.5, 0.0, 6.5, 7.5]
