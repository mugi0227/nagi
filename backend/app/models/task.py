"""
Task model definitions.

Tasks are the core entity representing user's to-do items.
"""

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

from app.models.enums import CreatedBy, EnergyLevel, Priority, TaskStatus


class TaskBase(BaseModel):
    """Base task fields shared across create/read."""

    title: str = Field(..., min_length=1, max_length=500, description="タスクタイトル")
    description: Optional[str] = Field(None, max_length=2000, description="タスクの詳細説明")
    project_id: Optional[UUID] = Field(None, description="所属プロジェクトID (InboxならNull)")
    phase_id: Optional[UUID] = Field(None, description="所属フェーズID（プロジェクト内での分類）")
    importance: Priority = Field(Priority.MEDIUM, description="重要度 (HIGH/MEDIUM/LOW)")
    urgency: Priority = Field(Priority.MEDIUM, description="緊急度 (HIGH/MEDIUM/LOW)")
    energy_level: EnergyLevel = Field(
        EnergyLevel.LOW, description="必要エネルギー (HIGH=重い, LOW=軽い)"
    )
    estimated_minutes: Optional[int] = Field(
        None, ge=1, description="見積もり時間（分）"
    )
    due_date: Optional[datetime] = Field(None, description="期限")
    start_not_before: Optional[datetime] = Field(
        None,
        description="着手可能日時（この日時より前は着手できない）",
    )
    parent_id: Optional[UUID] = Field(None, description="親タスクID（サブタスクの場合）")
    order_in_parent: Optional[int] = Field(
        None, ge=1, description="親タスク内での順序（1から始まる連番、サブタスクの場合のみ）"
    )
    dependency_ids: list[UUID] = Field(
        default_factory=list, description="このタスクより先に終わらせるべきタスクのID"
    )
    progress: int = Field(
        default=0, ge=0, le=100, description="進捗率（0-100%）"
    )

    # Meeting/Fixed-time event fields
    start_time: Optional[datetime] = Field(None, description="開始時刻（会議等の固定時間タスク用）")
    end_time: Optional[datetime] = Field(None, description="終了時刻（会議等の固定時間タスク用）")
    is_fixed_time: bool = Field(False, description="固定時間タスク（会議・予定など）")
    is_all_day: bool = Field(False, description="終日タスク（休暇・出張など、キャパシティを0にする）")
    location: Optional[str] = Field(None, max_length=500, description="場所（会議用）")
    attendees: list[str] = Field(default_factory=list, description="参加者リスト")
    meeting_notes: Optional[str] = Field(None, max_length=5000, description="議事録・メモ")
    recurring_meeting_id: Optional[UUID] = Field(None, description="定例会議ID（定例から生成された場合）")

    @model_validator(mode='after')
    def validate_fixed_time(self):
        """Validate fixed-time task constraints."""
        # 終日タスクの場合、is_fixed_time を自動設定し、時刻を生成
        if self.is_all_day:
            self.is_fixed_time = True
            # 日付を決定: start_time > due_date > 今日
            target_date = None
            if self.start_time:
                target_date = self.start_time.date()
            elif self.due_date:
                target_date = self.due_date.date()

            if target_date:
                # 00:00:00 〜 23:59:59 を設定
                self.start_time = datetime.combine(target_date, datetime.min.time())
                self.end_time = datetime.combine(target_date, datetime.max.time().replace(microsecond=0))

        if self.is_fixed_time:
            if not self.start_time or not self.end_time:
                raise ValueError("固定時間タスクにはstart_timeとend_timeが必須です")
            if self.end_time <= self.start_time:
                raise ValueError("終了時刻は開始時刻より後である必要があります")
            # Auto-calculate estimated_minutes if not provided
            if not self.estimated_minutes:
                duration_seconds = (self.end_time - self.start_time).total_seconds()
                self.estimated_minutes = int(duration_seconds / 60)
        return self


class TaskCreate(TaskBase):
    """Schema for creating a new task."""

    source_capture_id: Optional[UUID] = Field(
        None, description="元となったCaptureのID（重複排除用）"
    )
    created_by: CreatedBy = Field(CreatedBy.USER, description="作成者 (USER/AGENT)")


class TaskUpdate(BaseModel):
    """Schema for updating an existing task."""

    title: Optional[str] = Field(None, min_length=1, max_length=500)
    description: Optional[str] = Field(None, max_length=2000)
    project_id: Optional[UUID] = None
    phase_id: Optional[UUID] = None
    status: Optional[TaskStatus] = None
    importance: Optional[Priority] = None
    urgency: Optional[Priority] = None
    energy_level: Optional[EnergyLevel] = None
    estimated_minutes: Optional[int] = Field(None, ge=1)
    due_date: Optional[datetime] = None
    start_not_before: Optional[datetime] = None
    parent_id: Optional[UUID] = None
    order_in_parent: Optional[int] = Field(None, ge=1, description="親タスク内での順序")
    dependency_ids: Optional[list[UUID]] = None
    source_capture_id: Optional[UUID] = None
    progress: Optional[int] = Field(None, ge=0, le=100, description="進捗率（0-100%）")
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    is_fixed_time: Optional[bool] = None
    is_all_day: Optional[bool] = None
    location: Optional[str] = Field(None, max_length=500)
    attendees: Optional[list[str]] = None
    meeting_notes: Optional[str] = Field(None, max_length=5000)
    recurring_meeting_id: Optional[UUID] = None


class Task(TaskBase):
    """Complete task model with all fields."""

    id: UUID
    user_id: str = Field(..., description="所有者ユーザーID")
    status: TaskStatus = Field(TaskStatus.TODO, description="ステータス")
    source_capture_id: Optional[UUID] = None
    created_by: CreatedBy = Field(CreatedBy.USER)
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class TaskWithSubtasks(Task):
    """Task with its subtasks for hierarchical display."""

    subtasks: list["Task"] = Field(default_factory=list)


class SimilarTask(BaseModel):
    """Similar task result for duplicate detection."""

    task: Task
    similarity_score: float = Field(..., ge=0.0, le=1.0, description="類似度スコア")
