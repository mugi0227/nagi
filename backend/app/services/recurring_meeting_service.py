"""
Recurring meeting service.

Generates upcoming meeting tasks from recurring meeting definitions.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional

from app.interfaces.checkin_repository import ICheckinRepository
from app.interfaces.project_member_repository import IProjectMemberRepository
from app.interfaces.project_repository import IProjectRepository
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
        project_repo: Optional[IProjectRepository] = None,
        member_repo: Optional[IProjectMemberRepository] = None,
    ):
        self.recurring_repo = recurring_repo
        self.task_repo = task_repo
        self.checkin_repo = checkin_repo
        self.lookahead_days = lookahead_days
        self.project_repo = project_repo
        self.member_repo = member_repo

    async def ensure_upcoming_meetings(self, user_id: str) -> dict:
        """Ensure upcoming meeting tasks exist within the lookahead window.

        Generates ALL occurrences within the lookahead period, not just the next one.
        Skips creation if a task already exists for that occurrence (by start_time match).
        """
        now = datetime.now()
        upcoming_limit = now + timedelta(days=self.lookahead_days)
        created: list[dict] = []

        meetings = await self.recurring_repo.list(user_id, include_inactive=False, limit=200)
        for meeting in meetings:
            # Get all existing tasks for this recurring meeting within the lookahead window
            existing_tasks = await self.task_repo.list_by_recurring_meeting(
                user_id,
                meeting.id,
                start_after=now - timedelta(hours=1),  # Small buffer for timezone issues
                end_before=upcoming_limit + timedelta(days=1),
            )
            # Build a set of existing start times for quick lookup
            existing_start_times = {
                task.start_time.replace(second=0, microsecond=0)
                for task in existing_tasks
                if task.start_time
            }

            # Find all occurrences within the lookahead window
            reference = now
            latest_occurrence: Optional[datetime] = None

            while True:
                next_start = self._next_occurrence_after(meeting, reference)
                if not next_start:
                    break
                if next_start > upcoming_limit:
                    break

                # Check if task already exists for this occurrence
                normalized_start = next_start.replace(second=0, microsecond=0)
                if normalized_start in existing_start_times:
                    # Task already exists, skip to next occurrence
                    reference = next_start
                    latest_occurrence = next_start
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
                    project_repo=self.project_repo,
                    member_repo=self.member_repo,
                )
                created.append(created_task)

                # Move reference to after this occurrence to find the next one
                reference = next_start
                latest_occurrence = next_start

            # Update last_occurrence to the latest scheduled time
            if latest_occurrence:
                await self.recurring_repo.update(
                    user_id,
                    meeting.id,
                    RecurringMeetingUpdate(last_occurrence=latest_occurrence),
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
