"""
Meeting context tools for the agent.

These tools allow the agent to gather necessary context (check-ins, tasks, previous agendas)
to propose a meeting agenda.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Optional
from uuid import UUID

from google.adk.tools import FunctionTool
from pydantic import BaseModel, Field

from app.interfaces.checkin_repository import ICheckinRepository
from app.interfaces.meeting_agenda_repository import IMeetingAgendaRepository
from app.interfaces.project_member_repository import IProjectMemberRepository
from app.interfaces.project_repository import IProjectRepository
from app.interfaces.recurring_meeting_repository import IRecurringMeetingRepository
from app.interfaces.task_repository import ITaskRepository
from app.services.project_permissions import ProjectAction
from app.tools.permissions import require_project_action


class ListRecurringMeetingsInput(BaseModel):
    """Input for list_recurring_meetings tool."""

    project_id: Optional[str] = Field(None, description="プロジェクトID（指定しない場合は全ミーティング）")


class FetchMeetingContextInput(BaseModel):
    """Input for fetch_meeting_context tool."""

    project_id: str = Field(..., description="プロジェクトID")
    meeting_id: Optional[str] = Field(None, description="定例ミーティングID（指定するとミーティング詳細も取得）")
    start_date: date = Field(..., description="対象期間の開始日 (YYYY-MM-DD)")
    end_date: date = Field(..., description="対象期間の終了日 (YYYY-MM-DD)")


async def fetch_meeting_context(
    user_id: str,
    checkin_repo: ICheckinRepository,
    task_repo: ITaskRepository,
    meeting_agenda_repo: IMeetingAgendaRepository,
    project_repo: IProjectRepository,
    recurring_meeting_repo: IRecurringMeetingRepository,
    member_repo: IProjectMemberRepository,
    input_data: FetchMeetingContextInput,
) -> dict:
    """Fetch context for meeting agenda generation."""
    try:
        project_id = UUID(input_data.project_id)
    except ValueError:
        return {"error": f"Invalid project ID: {input_data.project_id}"}
    access = await require_project_action(
        user_id,
        project_id,
        project_repo,
        member_repo,
        ProjectAction.CHECKIN_READ,
    )
    if isinstance(access, dict):
        return access

    # 1. Fetch Project info
    project = await project_repo.get(access.owner_id, project_id)
    project_info = None
    if project:
        project_info = {
            "name": project.name,
            "description": project.description,
            "context_summary": project.context_summary,
            "goals": project.goals,
            "key_points": project.key_points,
        }

    # 2. Fetch Meeting info (if meeting_id provided)
    meeting_info = None
    if input_data.meeting_id:
        try:
            meeting_id = UUID(input_data.meeting_id)
            meeting = await recurring_meeting_repo.get(
                access.owner_id,
                meeting_id,
                project_id=project_id,
            )
            if meeting:
                meeting_info = {
                    "title": meeting.title,
                    "duration_minutes": meeting.duration_minutes,
                    "location": meeting.location,
                    "attendees": meeting.attendees,
                    "frequency": meeting.frequency.value if meeting.frequency else None,
                }
        except ValueError:
            pass  # Invalid meeting_id, skip

    # 3. Fetch Check-ins (V1 for backward compatibility)
    checkins = await checkin_repo.list(
        user_id=access.owner_id,
        project_id=project_id,
        start_date=input_data.start_date,
        end_date=input_data.end_date,
    )

    # Format check-ins (legacy format)
    checkin_summaries = []
    for c in checkins:
        checkin_summaries.append({
            "user": c.member_user_id,
            "date": c.checkin_date.isoformat(),
            "summary": c.summary_text or c.raw_text,
            "type": c.checkin_type
        })

    # 3b. Fetch structured check-in data (V2)
    agenda_items = await checkin_repo.get_agenda_items(
        user_id=access.owner_id,
        project_id=project_id,
        start_date=input_data.start_date,
        end_date=input_data.end_date,
    )

    # 4. Fetch Tasks (Active ones)
    all_tasks = await task_repo.list(access.owner_id, project_id=project_id)
    
    active_tasks = [
        t for t in all_tasks 
        if t.status != "DONE"
    ]
    
    task_list = []
    for t in active_tasks:
        task_list.append({
            "title": t.title,
            "status": t.status,
            "due_date": t.due_date.isoformat() if t.due_date else None,
            "progress": t.progress
        })

    # Convert member_moods to serializable format
    member_moods_serializable = {
        k: v.value if hasattr(v, 'value') else v
        for k, v in agenda_items.member_moods.items()
    }

    return {
        "project_info": project_info,
        "meeting_info": meeting_info,
        # Legacy format (for backward compatibility)
        "checkins": checkin_summaries,
        # V2 structured data (for agenda generation)
        "blockers": agenda_items.blockers,
        "discussions": agenda_items.discussions,
        "requests": agenda_items.requests,
        "updates": agenda_items.updates,
        "member_moods": member_moods_serializable,
        "must_discuss_items": agenda_items.must_discuss_items,
        # Tasks
        "active_tasks": task_list,
        "context_note": (
            "プロジェクト目標とキーポイントを参考にアジェンダを作成してください。"
            "blockers（ブロッカー）を優先的に議題に含め、discussions（相談事項）とrequests（依頼）も考慮してください。"
            "must_discuss_items は次回必ず話すべき項目です。"
            "member_moods でメンバーのコンディションを把握し、配慮してください。"
        )
    }


def fetch_meeting_context_tool(
    checkin_repo: ICheckinRepository,
    task_repo: ITaskRepository,
    meeting_agenda_repo: IMeetingAgendaRepository,
    project_repo: IProjectRepository,
    recurring_meeting_repo: IRecurringMeetingRepository,
    member_repo: IProjectMemberRepository,
    user_id: str,
) -> FunctionTool:
    """Create ADK tool for fetching meeting context."""

    async def _tool(input_data: dict) -> dict:
        """fetch_meeting_context: ミーティングのアジェンダ作成に必要なコンテキスト（プロジェクト情報、ミーティング詳細、チェックイン、タスク状況）を取得します。

        Parameters:
            project_id (str): プロジェクトID（必須）
            meeting_id (str): 定例ミーティングID（任意、指定するとミーティング詳細も取得）
            start_date (str): 対象期間の開始日 (YYYY-MM-DD)
            end_date (str): 対象期間の終了日 (YYYY-MM-DD)

        Returns:
            dict: project_info (dict), meeting_info (dict), checkins (list), active_tasks (list)
        """
        return await fetch_meeting_context(
            user_id, 
            checkin_repo, 
            task_repo, 
            meeting_agenda_repo, 
            project_repo,
            recurring_meeting_repo,
            member_repo,
            FetchMeetingContextInput(**input_data)
        )

    _tool.__name__ = "fetch_meeting_context"
    return FunctionTool(func=_tool)


def _calculate_next_occurrence(meeting, from_date: date) -> Optional[date]:
    """Calculate the next occurrence of a recurring meeting from a given date."""
    weekday = meeting.weekday  # 0=Monday, 6=Sunday
    current = from_date

    # Find the next occurrence
    for _ in range(14):  # Check up to 2 weeks
        if current.weekday() == weekday:
            if meeting.frequency.value == "biweekly":
                # For biweekly, check if this week is a meeting week
                if meeting.anchor_date:
                    weeks_diff = (current - meeting.anchor_date).days // 7
                    if weeks_diff % 2 == 0:
                        return current
            else:
                return current
        current += timedelta(days=1)
    return None


async def list_recurring_meetings(
    user_id: str,
    recurring_meeting_repo: IRecurringMeetingRepository,
    project_repo: IProjectRepository,
    member_repo: IProjectMemberRepository,
    input_data: ListRecurringMeetingsInput,
) -> dict:
    """List recurring meetings, optionally filtered by project."""
    project_id = None
    if input_data.project_id:
        try:
            project_id = UUID(input_data.project_id)
        except ValueError:
            return {"error": f"Invalid project ID: {input_data.project_id}"}

    if project_id:
        access = await require_project_action(
            user_id,
            project_id,
            project_repo,
            member_repo,
            ProjectAction.MEETING_AGENDA_MANAGE,
        )
        if isinstance(access, dict):
            return access
        meetings = await recurring_meeting_repo.list(access.owner_id, project_id=project_id)
        owner_id = access.owner_id
    else:
        meetings = await recurring_meeting_repo.list(user_id, project_id=None)
        owner_id = user_id

    today = date.today()
    result = []
    for meeting in meetings:
        # Get project name if project_id exists
        project_name = None
        if meeting.project_id:
            project = await project_repo.get(owner_id, meeting.project_id)
            if project:
                project_name = project.name

        # Calculate next occurrence
        next_date = _calculate_next_occurrence(meeting, today)

        result.append({
            "id": str(meeting.id),
            "title": meeting.title,
            "project_id": str(meeting.project_id) if meeting.project_id else None,
            "project_name": project_name,
            "frequency": meeting.frequency.value if meeting.frequency else None,
            "weekday": meeting.weekday,
            "weekday_name": ["月", "火", "水", "木", "金", "土", "日"][meeting.weekday],
            "start_time": meeting.start_time.isoformat() if meeting.start_time else None,
            "duration_minutes": meeting.duration_minutes,
            "location": meeting.location,
            "attendees": meeting.attendees,
            "is_active": meeting.is_active,
            "next_occurrence": next_date.isoformat() if next_date else None,
        })

    return {
        "meetings": result,
        "count": len(result),
    }


def list_recurring_meetings_tool(
    recurring_meeting_repo: IRecurringMeetingRepository,
    project_repo: IProjectRepository,
    member_repo: IProjectMemberRepository,
    user_id: str,
) -> FunctionTool:
    """Create ADK tool for listing recurring meetings."""

    async def _tool(input_data: dict) -> dict:
        """list_recurring_meetings: 定例ミーティング一覧を取得します。

        Parameters:
            project_id (str, optional): プロジェクトID。指定しない場合は全ミーティング。

        Returns:
            dict: meetings (list), count (int)
            各ミーティングには以下の情報が含まれます：
            - id: ミーティングID
            - title: タイトル
            - project_id/project_name: プロジェクト情報
            - frequency: 頻度 (weekly/biweekly)
            - weekday/weekday_name: 曜日
            - start_time: 開始時刻
            - duration_minutes: 所要時間
            - next_occurrence: 次回開催日
        """
        return await list_recurring_meetings(
            user_id,
            recurring_meeting_repo,
            project_repo,
            member_repo,
            ListRecurringMeetingsInput(**input_data)
        )

    _tool.__name__ = "list_recurring_meetings"
    return FunctionTool(func=_tool)
