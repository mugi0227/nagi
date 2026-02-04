"""
Recurring task service.

Generates upcoming task instances from recurring task definitions.
"""

from __future__ import annotations

import calendar
from datetime import date, datetime, timedelta
from typing import Optional

from app.core.logger import setup_logger
from app.interfaces.recurring_task_repository import IRecurringTaskRepository
from app.interfaces.task_repository import ITaskRepository
from app.models.enums import CreatedBy, RecurringTaskFrequency
from app.models.recurring_task import RecurringTask, RecurringTaskUpdate
from app.models.task import TaskCreate

logger = setup_logger(__name__)


class RecurringTaskService:
    """Service for generating task instances from recurring definitions."""

    def __init__(
        self,
        recurring_repo: IRecurringTaskRepository,
        task_repo: ITaskRepository,
        lookahead_days: int = 30,
    ):
        self.recurring_repo = recurring_repo
        self.task_repo = task_repo
        self.lookahead_days = lookahead_days

    async def ensure_upcoming_tasks(self, user_id: str) -> dict:
        """Ensure upcoming task instances exist within the lookahead window.

        Generates ALL occurrences within the lookahead period.
        Skips creation if a task already exists for that occurrence (by due_date match).
        """
        now = datetime.now()
        today = now.date()
        upcoming_limit = today + timedelta(days=self.lookahead_days)
        created: list[dict] = []

        definitions = await self.recurring_repo.list(
            user_id, include_inactive=False, limit=200
        )
        for definition in definitions:
            existing_tasks = await self.task_repo.list_by_recurring_task(
                user_id,
                definition.id,
                start_after=now - timedelta(days=1),
                end_before=datetime.combine(upcoming_limit + timedelta(days=1), datetime.min.time()),
            )
            existing_due_dates = {
                task.due_date.date() for task in existing_tasks if task.due_date
            }

            reference_date = today - timedelta(days=1)
            latest_date: Optional[date] = None

            while True:
                next_date = self._next_occurrence_after(definition, reference_date)
                if not next_date or next_date > upcoming_limit:
                    break

                if next_date < today:
                    reference_date = next_date
                    continue

                if next_date in existing_due_dates:
                    reference_date = next_date
                    latest_date = next_date
                    continue

                due_datetime = self._compute_due_date(definition, next_date)
                start_not_before = self._compute_start_not_before(
                    definition, next_date
                )
                task_data = TaskCreate(
                    title=definition.title,
                    description=definition.description,
                    purpose=definition.purpose,
                    project_id=definition.project_id,
                    phase_id=definition.phase_id,
                    importance=definition.importance,
                    urgency=definition.urgency,
                    energy_level=definition.energy_level,
                    estimated_minutes=definition.estimated_minutes,
                    due_date=due_datetime,
                    start_not_before=start_not_before,
                    recurring_task_id=definition.id,
                    created_by=CreatedBy.AGENT,
                )
                task = await self.task_repo.create(user_id, task_data)
                created.append(task.model_dump(mode="json"))

                reference_date = next_date
                latest_date = next_date

            if latest_date:
                await self.recurring_repo.update(
                    user_id,
                    definition.id,
                    RecurringTaskUpdate(last_generated_date=latest_date),
                )

        return {"created_count": len(created), "tasks": created}

    def _next_occurrence_after(
        self, definition: RecurringTask, after_date: date
    ) -> Optional[date]:
        """Calculate the next occurrence date after the given date."""
        freq = definition.frequency

        if freq == RecurringTaskFrequency.DAILY:
            return after_date + timedelta(days=1)

        elif freq == RecurringTaskFrequency.WEEKLY:
            if definition.weekday is None:
                return None
            candidate = self._align_to_weekday(after_date, definition.weekday)
            if candidate <= after_date:
                candidate += timedelta(days=7)
            return candidate

        elif freq == RecurringTaskFrequency.BIWEEKLY:
            if definition.weekday is None:
                return None
            candidate = self._align_to_weekday(after_date, definition.weekday)
            if candidate <= after_date:
                candidate += timedelta(days=7)
            # Align to biweekly rhythm from anchor
            while True:
                weeks_diff = (candidate - definition.anchor_date).days // 7
                if weeks_diff % 2 == 0:
                    return candidate
                candidate += timedelta(days=7)

        elif freq == RecurringTaskFrequency.MONTHLY:
            if definition.day_of_month is None:
                return None
            return self._next_monthly(after_date, definition.day_of_month, interval=1)

        elif freq == RecurringTaskFrequency.BIMONTHLY:
            if definition.day_of_month is None:
                return None
            return self._next_monthly_from_anchor(
                after_date, definition.day_of_month, definition.anchor_date, interval=2
            )

        elif freq == RecurringTaskFrequency.CUSTOM:
            if definition.custom_interval_days is None:
                return None
            days_since = (after_date - definition.anchor_date).days
            if days_since < 0:
                return definition.anchor_date
            intervals = days_since // definition.custom_interval_days + 1
            return definition.anchor_date + timedelta(
                days=intervals * definition.custom_interval_days
            )

        return None

    @staticmethod
    def _align_to_weekday(current: date, target_weekday: int) -> date:
        """Align a date to the target weekday (0=Monday)."""
        delta = (target_weekday - current.weekday()) % 7
        return current + timedelta(days=delta)

    def _compute_due_date(
        self, definition: RecurringTask, occurrence_date: date
    ) -> datetime:
        """Compute due_date for a generated task instance.

        For weekly/biweekly tasks, the due_date is the end of the week (Sunday).
        For all other frequencies, the due_date is the occurrence date itself.
        """
        freq = definition.frequency
        if freq in (
            RecurringTaskFrequency.WEEKLY,
            RecurringTaskFrequency.BIWEEKLY,
        ):
            # Sunday of the week containing the occurrence
            days_to_sunday = 6 - occurrence_date.weekday()
            sunday = occurrence_date + timedelta(days=days_to_sunday)
            return datetime.combine(sunday, datetime.min.time())
        return datetime.combine(occurrence_date, datetime.min.time())

    def _compute_start_not_before(
        self, definition: RecurringTask, occurrence_date: date
    ) -> datetime:
        """Compute start_not_before for a generated task instance.

        DAILY / CUSTOM: same as occurrence date (only actionable that day).
        WEEKLY / BIWEEKLY: Monday of the week containing the occurrence.
        MONTHLY / BIMONTHLY: 1st of the month containing the occurrence.
        """
        freq = definition.frequency
        if freq in (
            RecurringTaskFrequency.WEEKLY,
            RecurringTaskFrequency.BIWEEKLY,
        ):
            monday = occurrence_date - timedelta(days=occurrence_date.weekday())
            return datetime.combine(monday, datetime.min.time())
        if freq in (
            RecurringTaskFrequency.MONTHLY,
            RecurringTaskFrequency.BIMONTHLY,
        ):
            first_of_month = occurrence_date.replace(day=1)
            return datetime.combine(first_of_month, datetime.min.time())
        # DAILY, CUSTOM: actionable only on the occurrence date
        return datetime.combine(occurrence_date, datetime.min.time())

    @staticmethod
    def _next_monthly(after_date: date, day_of_month: int, interval: int) -> date:
        """Find the next monthly occurrence after the given date."""
        year, month = after_date.year, after_date.month
        max_day = min(day_of_month, calendar.monthrange(year, month)[1])
        candidate = date(year, month, max_day)
        if candidate <= after_date:
            # Move to next month(s)
            for _ in range(interval):
                month += 1
                if month > 12:
                    month = 1
                    year += 1
            max_day = min(day_of_month, calendar.monthrange(year, month)[1])
            candidate = date(year, month, max_day)
        return candidate

    @staticmethod
    def _next_monthly_from_anchor(
        after_date: date, day_of_month: int, anchor_date: date, interval: int
    ) -> date:
        """Find the next bimonthly occurrence aligned to the anchor date."""
        anchor_month_index = anchor_date.year * 12 + anchor_date.month - 1
        current_month_index = after_date.year * 12 + after_date.month - 1

        months_diff = current_month_index - anchor_month_index
        if months_diff < 0:
            target_month_index = anchor_month_index
        else:
            # Find next aligned month
            remainder = months_diff % interval
            if remainder == 0:
                # Check if we're past the day in this month
                year = current_month_index // 12
                month = current_month_index % 12 + 1
                max_day = min(day_of_month, calendar.monthrange(year, month)[1])
                if date(year, month, max_day) <= after_date:
                    target_month_index = current_month_index + interval
                else:
                    target_month_index = current_month_index
            else:
                target_month_index = current_month_index + (interval - remainder)

        year = target_month_index // 12
        month = target_month_index % 12 + 1
        max_day = min(day_of_month, calendar.monthrange(year, month)[1])
        return date(year, month, max_day)
