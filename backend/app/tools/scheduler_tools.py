"""
Scheduler-related agent tools.

Tools for scheduling autonomous agent actions.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from google.adk.tools import FunctionTool
from pydantic import BaseModel, Field

from app.interfaces.agent_task_repository import IAgentTaskRepository
from app.interfaces.postpone_repository import IPostponeRepository
from app.interfaces.proposal_repository import IProposalRepository
from app.interfaces.task_repository import ITaskRepository
from app.models.agent_task import AgentTaskCreate, AgentTaskPayload
from app.models.enums import ActionType
from app.tools.approval_tools import create_tool_action_proposal

# ===========================================
# Tool Input Models
# ===========================================


class ScheduleAgentTaskInput(BaseModel):
    """Input for schedule_agent_task tool."""

    action_type: ActionType = Field(..., description="アクションタイプ")
    execute_at: str = Field(..., description="実行時刻（ISO形式: YYYY-MM-DDTHH:MM:SS）")
    target_task_id: Optional[str] = Field(None, description="対象タスクID（UUID文字列）")
    message_tone: str = Field("neutral", description="メッセージのトーン (gentle/neutral/firm)")
    custom_message: Optional[str] = Field(None, description="カスタムメッセージ")
    metadata: dict[str, Any] = Field(default_factory=dict, description="追加メタデータ")


# ===========================================
# Tool Functions
# ===========================================


def get_current_datetime() -> dict:
    """
    Get current date and time.

    Returns:
        Current datetime information in various formats
    """
    now = datetime.now()
    return {
        "current_datetime": now.isoformat(),
        "date": now.strftime("%Y-%m-%d"),
        "time": now.strftime("%H:%M:%S"),
        "weekday": now.strftime("%A"),
        "weekday_ja": ["月", "火", "水", "木", "金", "土", "日"][now.weekday()],
        "year": now.year,
        "month": now.month,
        "day": now.day,
        "hour": now.hour,
        "minute": now.minute,
        "timestamp": now.timestamp(),
    }


async def schedule_agent_task(
    user_id: str,
    repo: IAgentTaskRepository,
    input_data: ScheduleAgentTaskInput,
) -> dict:
    """
    Schedule an autonomous agent action.

    Args:
        user_id: User ID
        repo: Agent task repository
        input_data: Schedule parameters

    Returns:
        Created agent task as dict
    """
    # Parse execute_at
    try:
        trigger_time = datetime.fromisoformat(
            input_data.execute_at.replace("Z", "+00:00")
        )
    except ValueError:
        raise ValueError(f"Invalid date format: {input_data.execute_at}")

    # Parse target_task_id if provided
    target_task_id = UUID(input_data.target_task_id) if input_data.target_task_id else None

    payload = AgentTaskPayload(
        target_task_id=target_task_id,
        message_tone=input_data.message_tone,
        custom_message=input_data.custom_message,
        metadata=input_data.metadata,
    )

    task_data = AgentTaskCreate(
        trigger_time=trigger_time,
        action_type=input_data.action_type,
        payload=payload,
    )

    task = await repo.create(user_id, task_data)
    return task.model_dump(mode="json")  # Serialize UUIDs to strings


# ===========================================
# ADK Tool Definitions
# ===========================================


def get_current_datetime_tool() -> FunctionTool:
    """Create ADK tool for getting current datetime."""
    def _tool() -> dict:
        """get_current_datetime: 現在の日時を取得します。

        Parameters:
            なし

        Returns:
            dict: 現在の日時情報（ISO形式、日付、時刻、曜日、年月日時分など）
        """
        return get_current_datetime()

    _tool.__name__ = "get_current_datetime"
    return FunctionTool(func=_tool)


def schedule_agent_task_tool(
    repo: IAgentTaskRepository,
    user_id: str,
    proposal_repo: Optional[IProposalRepository] = None,
    session_id: Optional[str] = None,
    auto_approve: bool = True,
) -> FunctionTool:
    """Create ADK tool for scheduling agent tasks."""
    async def _tool(input_data: dict) -> dict:
        """schedule_agent_task: 自律行動（リマインド等）をスケジュールします。

        Parameters:
            action_type (str): アクションタイプ（REMINDER/FOLLOWUP/MOTIVATE等、必須）
            execute_at (str): 実行時刻（ISO形式: YYYY-MM-DDTHH:MM:SS、必須）
            target_task_id (str, optional): 対象タスクID（UUID文字列）
            message_tone (str, optional): メッセージのトーン (gentle/neutral/firm)、デフォルト: neutral
            custom_message (str, optional): カスタムメッセージ
            metadata (dict, optional): 追加メタデータ

        Returns:
            dict: 作成されたエージェントタスク情報
        """
        payload = dict(input_data)
        proposal_desc = payload.pop("proposal_description", "")
        if proposal_repo and session_id and not auto_approve:
            return await create_tool_action_proposal(
                user_id,
                session_id,
                proposal_repo,
                "schedule_agent_task",
                payload,
                proposal_desc,
            )
        return await schedule_agent_task(user_id, repo, ScheduleAgentTaskInput(**payload))

    _tool.__name__ = "schedule_agent_task"
    return FunctionTool(func=_tool)


# ===========================================
# Postpone History Tools
# ===========================================


async def get_task_postpone_history(
    user_id: str,
    task_id: str,
    postpone_repo: IPostponeRepository,
    task_repo: ITaskRepository,
) -> dict:
    """Get postpone history for a specific task."""
    from uuid import UUID as _UUID

    tid = _UUID(task_id)
    task = await task_repo.get_by_id(user_id, tid)
    events = await postpone_repo.list_by_task(user_id, tid)
    return {
        "task_id": task_id,
        "task_title": task.title if task else "不明",
        "postpone_count": len(events),
        "events": [
            {
                "from_date": e.from_date.isoformat(),
                "to_date": e.to_date.isoformat(),
                "reason": e.reason,
                "pinned": e.pinned,
                "created_at": e.created_at.isoformat(),
            }
            for e in events
        ],
    }


async def get_postpone_stats(
    user_id: str,
    postpone_repo: IPostponeRepository,
    task_repo: ITaskRepository,
    days: int = 7,
) -> dict:
    """Get aggregate postponement statistics."""
    from datetime import date, timedelta
    from uuid import UUID as _UUID

    since = date.today() - timedelta(days=days)
    events = await postpone_repo.list_by_user(user_id, since=since)

    task_counts: dict[str, int] = {}
    for event in events:
        key = str(event.task_id)
        task_counts[key] = task_counts.get(key, 0) + 1

    most_postponed = []
    sorted_tasks = sorted(task_counts.items(), key=lambda x: x[1], reverse=True)[:5]
    for tid_str, count in sorted_tasks:
        task = await task_repo.get_by_id(user_id, _UUID(tid_str))
        most_postponed.append({
            "task_id": tid_str,
            "task_title": task.title if task else "不明",
            "postpone_count": count,
        })

    return {
        "period_days": days,
        "total_postpones": len(events),
        "unique_tasks": len(task_counts),
        "most_postponed": most_postponed,
    }


def get_task_postpone_history_tool(
    postpone_repo: IPostponeRepository,
    task_repo: ITaskRepository,
    user_id: str,
) -> FunctionTool:
    """Create ADK tool for getting task postpone history."""
    async def _tool(input_data: dict) -> dict:
        """get_task_postpone_history: 特定タスクの延期履歴を取得します。

        Parameters:
            task_id (str): 対象タスクID（UUID文字列、必須）

        Returns:
            dict: タスクの延期履歴（回数、各イベントの詳細）
        """
        task_id = input_data.get("task_id", "")
        return await get_task_postpone_history(
            user_id, task_id, postpone_repo, task_repo
        )

    _tool.__name__ = "get_task_postpone_history"
    return FunctionTool(func=_tool)


def get_postpone_stats_tool(
    postpone_repo: IPostponeRepository,
    task_repo: ITaskRepository,
    user_id: str,
) -> FunctionTool:
    """Create ADK tool for getting postpone statistics."""
    async def _tool(input_data: dict) -> dict:
        """get_postpone_stats: 期間内の延期統計を取得します。

        Parameters:
            days (int, optional): 集計期間（日数）、デフォルト: 7

        Returns:
            dict: 延期統計（総回数、ユニークタスク数、最多延期タスクTop5）
        """
        days = input_data.get("days", 7)
        return await get_postpone_stats(
            user_id, postpone_repo, task_repo, days=days
        )

    _tool.__name__ = "get_postpone_stats"
    return FunctionTool(func=_tool)

