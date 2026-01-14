"""
Meeting context tools for the agent.

These tools allow the agent to gather necessary context (check-ins, tasks, previous agendas)
to propose a meeting agenda.
"""

from __future__ import annotations

from datetime import date
from typing import Optional
from uuid import UUID

from google.adk.tools import FunctionTool
from pydantic import BaseModel, Field

from app.interfaces.checkin_repository import ICheckinRepository
from app.interfaces.meeting_agenda_repository import IMeetingAgendaRepository
from app.interfaces.project_repository import IProjectRepository
from app.interfaces.recurring_meeting_repository import IRecurringMeetingRepository
from app.interfaces.task_repository import ITaskRepository


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
    input_data: FetchMeetingContextInput,
) -> dict:
    """Fetch context for meeting agenda generation."""
    try:
        project_id = UUID(input_data.project_id)
    except ValueError:
        return {"error": f"Invalid project ID: {input_data.project_id}"}

    # 1. Fetch Project info
    project = await project_repo.get(user_id, project_id)
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
            meeting = await recurring_meeting_repo.get(user_id, meeting_id)
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

    # 3. Fetch Check-ins
    checkins = await checkin_repo.list(
        user_id=user_id,
        project_id=project_id,
        start_date=input_data.start_date,
        end_date=input_data.end_date,
    )
    
    # Format check-ins
    checkin_summaries = []
    for c in checkins:
        checkin_summaries.append({
            "user": c.member_user_id,
            "date": c.checkin_date.isoformat(),
            "summary": c.summary_text or c.raw_text,
            "type": c.checkin_type
        })

    # 4. Fetch Tasks (Active ones)
    all_tasks = await task_repo.list(user_id, project_id=project_id)
    
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

    return {
        "project_info": project_info,
        "meeting_info": meeting_info,
        "checkins": checkin_summaries,
        "active_tasks": task_list,
        "context_note": "プロジェクト目標とキーポイントを参考にアジェンダを作成してください。チェックインからブロッカーや話題を特定し、タスク状況から遅延を把握してください。"
    }


def fetch_meeting_context_tool(
    checkin_repo: ICheckinRepository,
    task_repo: ITaskRepository,
    meeting_agenda_repo: IMeetingAgendaRepository,
    project_repo: IProjectRepository,
    recurring_meeting_repo: IRecurringMeetingRepository,
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
            FetchMeetingContextInput(**input_data)
        )

    _tool.__name__ = "fetch_meeting_context"
    return FunctionTool(func=_tool)
