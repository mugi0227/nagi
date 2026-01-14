"""
Recurring meeting service.

Generates upcoming meeting tasks from recurring meeting definitions.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional

from app.interfaces.checkin_repository import ICheckinRepository
from app.interfaces.recurring_meeting_repository import IRecurringMeetingRepository
from app.interfaces.task_repository import ITaskRepository
from app.models.collaboration import Checkin
from app.models.enums import CheckinType
from app.models.recurring_meeting import RecurrenceFrequency, RecurringMeeting, RecurringMeetingUpdate
from app.tools.task_tools import CreateMeetingInput, create_meeting


class RecurringMeetingService:
    """Service for generating meeting tasks from recurring definitions."""

    def __init__(
        self,
        recurring_repo: IRecurringMeetingRepository,
        task_repo: ITaskRepository,
        checkin_repo: ICheckinRepository,
        lookahead_days: int = 30,
    ):
        self.recurring_repo = recurring_repo
        self.task_repo = task_repo
        self.checkin_repo = checkin_repo
        self.lookahead_days = lookahead_days

    async def ensure_upcoming_meetings(self, user_id: str) -> dict:
        """Ensure upcoming meeting tasks exist within the lookahead window."""
        now = datetime.now()
        upcoming_limit = now + timedelta(days=self.lookahead_days)
        created: list[dict] = []

        meetings = await self.recurring_repo.list(user_id, include_inactive=False, limit=200)
        for meeting in meetings:
            reference = meeting.last_occurrence if meeting.last_occurrence and meeting.last_occurrence > now else now
            next_start = self._next_occurrence_after(meeting, reference)
            if not next_start:
                continue
            if next_start > upcoming_limit:
                continue

            description = await self._build_agenda(user_id, meeting, next_start.date())
            duration = timedelta(minutes=meeting.duration_minutes)
            end_time = next_start + duration

            created_task = await create_meeting(
                user_id,
                self.task_repo,
                CreateMeetingInput(
                    title=meeting.title,
                    start_time=next_start.isoformat(timespec="minutes"),
                    end_time=end_time.isoformat(timespec="minutes"),
                    location=meeting.location,
                    attendees=meeting.attendees,
                    description=description,
                    project_id=str(meeting.project_id) if meeting.project_id else None,
                    recurring_meeting_id=str(meeting.id),
                ),
            )
            created.append(created_task)

            # Update last occurrence to the scheduled time
            await self.recurring_repo.update(
                user_id,
                meeting.id,
                RecurringMeetingUpdate(last_occurrence=next_start),
            )

        return {"created_count": len(created), "meetings": created}

    def _next_occurrence_after(self, meeting: RecurringMeeting, after_dt: datetime) -> Optional[datetime]:
        interval_weeks = 1 if meeting.frequency == RecurrenceFrequency.WEEKLY else 2
        candidate_date = self._align_to_weekday(after_dt.date(), meeting.weekday)
        candidate_dt = datetime.combine(candidate_date, meeting.start_time)

        if candidate_dt <= after_dt:
            candidate_date += timedelta(days=7)

        if candidate_date < meeting.anchor_date:
            candidate_date = meeting.anchor_date

        while True:
            weeks_diff = (candidate_date - meeting.anchor_date).days // 7
            if weeks_diff % interval_weeks == 0:
                return datetime.combine(candidate_date, meeting.start_time)
            candidate_date += timedelta(days=7)

    @staticmethod
    def _align_to_weekday(current, target_weekday: int):
        delta = (target_weekday - current.weekday()) % 7
        return current + timedelta(days=delta)

    async def _build_agenda(
        self,
        user_id: str,
        meeting: RecurringMeeting,
        meeting_date,
    ) -> str:
        if not meeting.project_id:
            return "## Agenda\n\n- No project linked."

        start_date = meeting_date - timedelta(days=meeting.agenda_window_days)
        checkins = await self.checkin_repo.list(
            user_id,
            meeting.project_id,
            start_date=start_date,
            end_date=meeting_date,
        )
        if not checkins:
            return "## Agenda\n\n- No check-ins yet."

        weekly_items = self._format_checkins([c for c in checkins if c.checkin_type == CheckinType.WEEKLY])
        issue_items = self._format_checkins([c for c in checkins if c.checkin_type == CheckinType.ISSUE])
        other_items = self._format_checkins([c for c in checkins if c.checkin_type == CheckinType.GENERAL])

        lines = ["## 定例アジェンダ", ""]
        if weekly_items:
            lines.extend(["### 週次サマリー", *weekly_items, ""])
        if issue_items:
            lines.extend(["### 困りごと・論点", *issue_items, ""])
        if other_items:
            lines.extend(["### その他", *other_items, ""])

        lines.extend(["### 次までにやること", "- [ ] ", ""])
        return "\n".join(lines).strip()

    @staticmethod
    def _format_checkins(checkins: list[Checkin]) -> list[str]:
        items: list[str] = []
        for checkin in checkins[:10]:
            text = checkin.summary_text or checkin.raw_text
            text = " ".join(text.strip().split())
            if len(text) > 200:
                text = f"{text[:197]}..."
            items.append(f"- {checkin.member_user_id}: {text}")
        return items
