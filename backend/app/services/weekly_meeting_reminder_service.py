"""
Weekly meeting registration reminder service.

Automatically creates reminder tasks for users to register their weekly meetings.
"""

from __future__ import annotations

import re
from datetime import datetime, timedelta
from typing import Optional
from zoneinfo import ZoneInfo

from app.core.logger import logger
from app.interfaces.task_repository import ITaskRepository
from app.interfaces.user_repository import IUserRepository
from app.models.task import Task, TaskCreate
from app.utils.datetime_utils import now_utc


def _get_next_monday(from_date: datetime, user_tz: ZoneInfo) -> datetime:
    """Get the next Monday from the given date in user timezone."""
    # Convert to user timezone
    local_date = from_date.astimezone(user_tz)

    # Calculate days until next Monday (0 = Monday, 6 = Sunday)
    days_ahead = 0 - local_date.weekday()
    if days_ahead <= 0:  # Target day already happened this week
        days_ahead += 7

    next_monday = local_date + timedelta(days=days_ahead)
    # Set to start of day (00:00:00)
    next_monday = next_monday.replace(hour=0, minute=0, second=0, microsecond=0)

    return next_monday


def _get_week_start_end(date: datetime, user_tz: ZoneInfo) -> tuple[datetime, datetime]:
    """Get the start (Monday 00:00) and end (Sunday 23:59:59) of the week containing the date."""
    local_date = date.astimezone(user_tz)

    # Get Monday of this week
    days_since_monday = local_date.weekday()
    week_start = local_date - timedelta(days=days_since_monday)
    week_start = week_start.replace(hour=0, minute=0, second=0, microsecond=0)

    # Get Sunday of this week
    week_end = week_start + timedelta(days=6, hours=23, minutes=59, seconds=59)

    return week_start, week_end


async def ensure_weekly_meeting_reminders(
    user_repo: IUserRepository,
    task_repo: ITaskRepository,
) -> dict[str, int]:
    """
    Ensure weekly meeting registration reminder tasks exist for all users with the feature enabled.

    Creates reminder tasks for the next 4-5 weeks (approximately 1 month).
    Skips creating tasks if a similar reminder already exists for that week.

    Returns:
        dict: Summary of tasks created per user
    """
    results = {"users_processed": 0, "tasks_created": 0, "tasks_skipped": 0}

    # Get all users
    all_users = await user_repo.list_all()

    for user in all_users:
        # Skip if feature is disabled for this user
        if not user.enable_weekly_meeting_reminder:
            continue

        results["users_processed"] += 1
        user_tz = ZoneInfo(user.timezone)
        current_time = now_utc()

        # Get existing reminder tasks for this user
        existing_tasks = await task_repo.list(
            user_id=str(user.id),
            include_done=True,  # Check all tasks including completed ones
            limit=1000,  # Get more tasks to check
        )
        existing_reminder_weeks = set()

        for task in existing_tasks:
            # Check if this is a weekly meeting reminder task
            if "会議情報" in task.title and "登録" in task.title:
                # Extract week range from title (e.g., "03/02-03/08")
                match = re.search(r"(\d{2}/\d{2})-(\d{2}/\d{2})", task.title)
                if match:
                    start_date_str = match.group(1)  # e.g., "03/02"
                    # Parse the start date (assuming current or next year)
                    try:
                        current_year = datetime.now(user_tz).year
                        month, day = map(int, start_date_str.split("/"))
                        week_monday = datetime(current_year, month, day, tzinfo=user_tz)
                        existing_reminder_weeks.add(week_monday.date())
                    except ValueError:
                        # If parsing fails, skip this task
                        continue

        # Create tasks for the next 5 weeks (1 month+)
        next_monday = _get_next_monday(current_time, user_tz)

        for week_offset in range(5):
            target_monday = next_monday + timedelta(weeks=week_offset)
            week_key = target_monday.date()

            # Skip if we already have a reminder for this week
            if week_key in existing_reminder_weeks:
                results["tasks_skipped"] += 1
                continue

            # Create the reminder task
            task = await _create_reminder_task(
                task_repo=task_repo,
                user_id=str(user.id),
                target_monday=target_monday,
                user_tz=user_tz,
            )

            if task:
                results["tasks_created"] += 1
                logger.info(
                    f"Created weekly meeting reminder for user {user.id} for week of {target_monday.date()}"
                )

    logger.info(
        f"Weekly meeting reminder task generation completed: {results['tasks_created']} tasks created, "
        f"{results['tasks_skipped']} skipped, {results['users_processed']} users processed"
    )

    return results


async def _create_reminder_task(
    task_repo: ITaskRepository,
    user_id: str,
    target_monday: datetime,
    user_tz: ZoneInfo,
) -> Optional[Task]:
    """Create a single weekly meeting registration reminder task."""
    # Format the week range for the description
    week_end = target_monday + timedelta(days=6)
    week_range = f"{target_monday.strftime('%m/%d')}-{week_end.strftime('%m/%d')}"

    # Warm, friendly message
    description = f"""今週（{week_range}）の会議予定は登録できていますか？ 📅

お疲れさまです！週の始まりは会議の予定を整理するのにぴったりなタイミングですね。

もし定例会議やミーティングの予定があれば、今のうちにサクッと登録しておくと、後で「あれ、いつだっけ？」と慌てずに済みますよ。

焦らず、思い出せる範囲でOKです 😊

**登録済みならこのタスクは完了にしてください。**
新しい会議が追加されたら、その都度登録していきましょう！
"""

    task_data = TaskCreate(
        user_id=user_id,
        project_id=None,  # Personal task (Inbox)
        title=f"今週の会議情報を登録しましょう 📅 ({week_range})",
        description=description,
        status="TODO",
        importance="MEDIUM",  # Not too pressuring
        urgency="LOW",  # No rush
        energy_level="LOW",  # Easy task
        priority=1,  # Show at top of list
        due_date=None,  # No deadline pressure
        start_not_before=target_monday.astimezone(ZoneInfo("UTC")),  # Only actionable from Monday
        created_by="AGENT",  # System-generated task
    )

    return await task_repo.create(user_id=user_id, task=task_data)
