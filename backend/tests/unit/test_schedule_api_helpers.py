"""
Unit tests for schedule API helpers.
"""

from app.api.tasks import apply_capacity_buffer, get_scheduler_service


def test_apply_capacity_buffer_uses_default():
    scheduler_service = get_scheduler_service()
    capacity_hours, capacity_by_weekday = apply_capacity_buffer(scheduler_service, None, 1.0)
    assert capacity_hours == scheduler_service.default_capacity_hours - 1.0
    assert capacity_by_weekday is None


def test_apply_capacity_buffer_with_explicit_capacity():
    scheduler_service = get_scheduler_service()
    capacity_hours, capacity_by_weekday = apply_capacity_buffer(scheduler_service, 6.0, 1.5)
    assert capacity_hours == 4.5
    assert capacity_by_weekday is None
