"""
Meeting summary models.

Models for transcript analysis results including summaries, decisions, and next actions.
"""

from __future__ import annotations

from datetime import date
from enum import Enum
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class ActionType(str, Enum):
    """Type of action to take for a next action item."""

    CREATE = "create"           # 新規タスク作成
    UPDATE = "update"           # 既存タスクの更新（説明追加、期限変更等）
    ADD_SUBTASK = "add_subtask" # 既存タスクにサブタスク追加


class AgendaDiscussion(BaseModel):
    """Summary of discussion for a single agenda item."""

    agenda_title: str = Field(..., description="アジェンダ項目のタイトル")
    summary: str = Field(..., description="議論の要約")
    key_points: list[str] = Field(default_factory=list, description="主要なポイント")


class Decision(BaseModel):
    """A decision made during the meeting."""

    content: str = Field(..., description="決定内容")
    related_agenda: Optional[str] = Field(None, description="関連するアジェンダ項目")
    rationale: Optional[str] = Field(None, description="決定の理由・背景")


class NextAction(BaseModel):
    """A next action extracted from the meeting."""

    title: str = Field(..., description="アクション項目のタイトル")
    description: Optional[str] = Field(None, description="詳細説明")
    purpose: Optional[str] = Field(None, description="なぜやるか（目的）")
    assignee: Optional[str] = Field(None, description="担当者名")
    assignee_id: Optional[str] = Field(None, description="担当者のユーザーID")
    due_date: Optional[date] = Field(None, description="期限")
    related_agenda: Optional[str] = Field(None, description="関連するアジェンダ項目")
    priority: str = Field("MEDIUM", description="優先度 (HIGH/MEDIUM/LOW)")
    estimated_minutes: Optional[int] = Field(None, description="見積もり時間（分）")
    energy_level: Optional[str] = Field(None, description="必要エネルギー (HIGH/MEDIUM/LOW)")
    action_type: ActionType = Field(
        ActionType.CREATE,
        description="アクション種別: create=新規作成, update=既存更新, add_subtask=サブタスク追加",
    )
    existing_task_id: Optional[str] = Field(
        None,
        description="update/add_subtaskの場合の対象タスクID",
    )
    existing_task_title: Optional[str] = Field(
        None,
        description="update/add_subtaskの場合の対象タスクのタイトル（表示用）",
    )
    update_reason: Optional[str] = Field(
        None,
        description="update の場合、何を更新するかの説明",
    )


class MeetingSummary(BaseModel):
    """Complete summary of a meeting transcript."""

    session_id: UUID = Field(..., description="セッションID")
    overall_summary: str = Field(..., description="会議全体の要約")
    agenda_discussions: list[AgendaDiscussion] = Field(
        default_factory=list,
        description="各アジェンダ項目の議論サマリー"
    )
    decisions: list[Decision] = Field(
        default_factory=list,
        description="決定事項リスト"
    )
    next_actions: list[NextAction] = Field(
        default_factory=list,
        description="ネクストアクションリスト"
    )
    action_items_count: int = Field(0, description="抽出されたアクション数")


class AnalyzeTranscriptRequest(BaseModel):
    """Request body for transcript analysis."""

    transcript: str = Field(..., description="議事録テキスト", max_length=50000)
    project_id: Optional[str] = Field(None, description="プロジェクトID（既存タスク取得用）")


class CreateTasksFromActionsRequest(BaseModel):
    """Request body for creating tasks from next actions."""

    project_id: Optional[str] = Field(None, description="タスクを作成するプロジェクトID")
    actions: list[NextAction] = Field(..., description="タスク化するアクションリスト")
