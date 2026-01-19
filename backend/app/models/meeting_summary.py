"""
Meeting summary models.

Models for transcript analysis results including summaries, decisions, and next actions.
"""

from __future__ import annotations

from datetime import date
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


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
    assignee: Optional[str] = Field(None, description="担当者")
    due_date: Optional[date] = Field(None, description="期限")
    related_agenda: Optional[str] = Field(None, description="関連するアジェンダ項目")
    priority: str = Field("MEDIUM", description="優先度 (HIGH/MEDIUM/LOW)")


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


class CreateTasksFromActionsRequest(BaseModel):
    """Request body for creating tasks from next actions."""

    project_id: Optional[str] = Field(None, description="タスクを作成するプロジェクトID")
    actions: list[NextAction] = Field(..., description="タスク化するアクションリスト")
