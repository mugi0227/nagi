"""
SQLite database configuration and ORM models.

This module defines the SQLAlchemy ORM models and database initialization.
"""

from datetime import datetime
from typing import Optional
from uuid import uuid4

from app.utils.datetime_utils import now_utc

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    ForeignKeyConstraint,
    Integer,
    String,
    Text,
    JSON,
    UniqueConstraint,
    create_engine,
)
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.core.config import get_settings


class Base(DeclarativeBase):
    """SQLAlchemy declarative base."""

    pass


# ===========================================
# ORM Models
# ===========================================


class TaskORM(Base):
    """Task ORM model."""

    __tablename__ = "tasks"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id = Column(String(255), nullable=False, index=True)
    project_id = Column(String(36), nullable=True, index=True)
    phase_id = Column(String(36), nullable=True, index=True)
    title = Column(String(500), nullable=False)
    description = Column(Text, nullable=True)
    status = Column(String(20), default="TODO", index=True)
    importance = Column(String(10), default="MEDIUM")
    urgency = Column(String(10), default="MEDIUM")
    energy_level = Column(String(10), default="LOW")
    estimated_minutes = Column(Integer, nullable=True)
    due_date = Column(DateTime, nullable=True)
    start_not_before = Column(DateTime, nullable=True)
    parent_id = Column(String(36), nullable=True, index=True)
    order_in_parent = Column(Integer, nullable=True)
    dependency_ids = Column(JSON, nullable=True, default=list)
    progress = Column(Integer, default=0, nullable=False)
    source_capture_id = Column(String(36), nullable=True)
    created_by = Column(String(10), default="USER")
    created_at = Column(DateTime, default=now_utc)
    updated_at = Column(DateTime, default=now_utc, onupdate=now_utc)

    # Meeting/Fixed-time event fields
    start_time = Column(DateTime, nullable=True)
    end_time = Column(DateTime, nullable=True)
    is_fixed_time = Column(Boolean, default=False, index=True)
    is_all_day = Column(Boolean, default=False, index=True)
    location = Column(String(500), nullable=True)
    attendees = Column(JSON, nullable=True, default=list)
    meeting_notes = Column(Text, nullable=True)
    recurring_meeting_id = Column(String(36), nullable=True, index=True)
    milestone_id = Column(String(36), nullable=True, index=True)


class ProjectORM(Base):
    """Project ORM model."""

    __tablename__ = "projects"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id = Column(String(255), nullable=False, index=True)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    status = Column(String(20), default="ACTIVE")
    context_summary = Column(Text, nullable=True)
    context = Column(Text, nullable=True)  # 詳細コンテキスト（README）
    priority = Column(Integer, default=5)  # プロジェクト優先度（1-10）
    goals = Column(JSON, nullable=True, default=list)  # プロジェクトのゴールリスト
    key_points = Column(JSON, nullable=True, default=list)  # 重要なポイントリスト
    kpi_config = Column(JSON, nullable=True)  # KPI configuration
    created_at = Column(DateTime, default=now_utc)
    updated_at = Column(DateTime, default=now_utc, onupdate=now_utc)


class PhaseORM(Base):
    """Phase ORM model."""

    __tablename__ = "phases"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id = Column(String(255), nullable=False, index=True)
    project_id = Column(String(36), nullable=False, index=True)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    status = Column(String(20), default="ACTIVE")
    order_in_project = Column(Integer, default=1, nullable=False)
    start_date = Column(DateTime, nullable=True)
    end_date = Column(DateTime, nullable=True)
    fixed_buffer_minutes = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=now_utc)
    updated_at = Column(DateTime, default=now_utc, onupdate=now_utc)


class MilestoneORM(Base):
    """Milestone ORM model."""

    __tablename__ = "milestones"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id = Column(String(255), nullable=False, index=True)
    project_id = Column(String(36), nullable=False, index=True)
    phase_id = Column(String(36), nullable=False, index=True)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    status = Column(String(20), default="ACTIVE")
    order_in_phase = Column(Integer, default=1, nullable=False)
    due_date = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=now_utc)
    updated_at = Column(DateTime, default=now_utc, onupdate=now_utc)


class UserORM(Base):
    """User ORM model."""

    __tablename__ = "users"
    __table_args__ = (
        UniqueConstraint("provider_issuer", "provider_sub", name="uq_user_provider"),
        UniqueConstraint("username", name="uq_user_username"),
    )

    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    provider_issuer = Column(String(500), nullable=False, index=True)
    provider_sub = Column(String(255), nullable=False, index=True)
    email = Column(String(255), nullable=True, index=True)
    display_name = Column(String(255), nullable=True)
    first_name = Column(String(100), nullable=True)
    last_name = Column(String(100), nullable=True)
    username = Column(String(255), nullable=True, index=True)
    password_hash = Column(String(255), nullable=True)
    timezone = Column(String(50), default="Asia/Tokyo", nullable=False)
    created_at = Column(DateTime, default=now_utc)
    updated_at = Column(DateTime, default=now_utc, onupdate=now_utc)


class ProjectMemberORM(Base):
    """Project member ORM model."""

    __tablename__ = "project_members"
    __table_args__ = (
        UniqueConstraint("project_id", "member_user_id", "user_id", name="uq_project_member"),
    )

    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id = Column(String(255), nullable=False, index=True)
    project_id = Column(String(36), nullable=False, index=True)
    member_user_id = Column(String(255), nullable=False, index=True)
    role = Column(String(20), default="MEMBER")
    capacity_hours = Column(Float, nullable=True)
    timezone = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=now_utc)
    updated_at = Column(DateTime, default=now_utc, onupdate=now_utc)


class ProjectInvitationORM(Base):
    """Project invitation ORM model."""

    __tablename__ = "project_invitations"
    __table_args__ = (
        UniqueConstraint("project_id", "email", name="uq_project_invitation"),
    )

    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id = Column(String(255), nullable=False, index=True)
    project_id = Column(String(36), nullable=False, index=True)
    email = Column(String(255), nullable=False, index=True)
    role = Column(String(20), default="MEMBER")
    status = Column(String(20), default="PENDING")
    token = Column(String(255), nullable=True, index=True)
    invited_by = Column(String(255), nullable=False)
    accepted_by = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=now_utc)
    updated_at = Column(DateTime, default=now_utc, onupdate=now_utc)
    expires_at = Column(DateTime, nullable=True)
    accepted_at = Column(DateTime, nullable=True)


class TaskAssignmentORM(Base):
    """Task assignment ORM model."""

    __tablename__ = "task_assignments"
    __table_args__ = (
        UniqueConstraint("task_id", "user_id", "assignee_id", name="uq_task_assignment"),
    )

    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id = Column(String(255), nullable=False, index=True)
    task_id = Column(String(36), nullable=False, index=True)
    assignee_id = Column(String(255), nullable=False, index=True)
    status = Column(String(20), nullable=True)
    progress = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=now_utc)
    updated_at = Column(DateTime, default=now_utc, onupdate=now_utc)


class CheckinORM(Base):
    """Check-in ORM model."""

    __tablename__ = "checkins"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id = Column(String(255), nullable=False, index=True)
    project_id = Column(String(36), nullable=False, index=True)
    member_user_id = Column(String(255), nullable=False, index=True)
    checkin_date = Column(Date, nullable=False, index=True)
    checkin_type = Column(String(20), nullable=True, default="weekly")
    summary_text = Column(Text, nullable=True)
    raw_text = Column(Text, nullable=True)  # Nullable for V2
    created_at = Column(DateTime, default=now_utc)

    # V2 fields (structured check-in)
    mood = Column(String(20), nullable=True)
    must_discuss_in_next_meeting = Column(Text, nullable=True)
    free_comment = Column(Text, nullable=True)


class CheckinItemORM(Base):
    """Check-in item ORM model (V2 structured items)."""

    __tablename__ = "checkin_items"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    checkin_id = Column(String(36), nullable=False, index=True)
    user_id = Column(String(255), nullable=False, index=True)
    category = Column(String(20), nullable=False)  # blocker/discussion/update/request
    content = Column(Text, nullable=False)
    related_task_id = Column(String(36), nullable=True, index=True)
    urgency = Column(String(10), default="medium")
    order_index = Column(Integer, default=0)
    created_at = Column(DateTime, default=now_utc)


class BlockerORM(Base):
    """Blocker ORM model."""

    __tablename__ = "blockers"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id = Column(String(255), nullable=False, index=True)
    task_id = Column(String(36), nullable=False, index=True)
    created_by = Column(String(255), nullable=False)
    status = Column(String(20), default="OPEN")
    reason = Column(Text, nullable=False)
    resolved_by = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=now_utc)
    resolved_at = Column(DateTime, nullable=True)


class AgentTaskORM(Base):
    """AgentTask ORM model."""

    __tablename__ = "agent_tasks"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id = Column(String(255), nullable=False, index=True)
    trigger_time = Column(DateTime, nullable=False, index=True)
    action_type = Column(String(30), nullable=False)
    status = Column(String(20), default="PENDING", index=True)
    payload = Column(Text, nullable=True)  # JSON string
    retry_count = Column(Integer, default=0)
    last_error = Column(Text, nullable=True)
    executed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=now_utc)
    updated_at = Column(DateTime, default=now_utc, onupdate=now_utc)


class RecurringMeetingORM(Base):
    """Recurring meeting ORM model."""

    __tablename__ = "recurring_meetings"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id = Column(String(255), nullable=False, index=True)
    project_id = Column(String(36), nullable=True, index=True)
    title = Column(String(500), nullable=False)
    frequency = Column(String(20), nullable=False, default="weekly")
    weekday = Column(Integer, nullable=False)
    start_time = Column(String(10), nullable=False)  # HH:MM
    duration_minutes = Column(Integer, nullable=False)
    location = Column(String(500), nullable=True)
    attendees = Column(JSON, nullable=True, default=list)
    agenda_window_days = Column(Integer, nullable=False, default=7)
    anchor_date = Column(Date, nullable=False)
    last_occurrence = Column(DateTime, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=now_utc)
    updated_at = Column(DateTime, default=now_utc, onupdate=now_utc)


class MeetingAgendaItemORM(Base):
    """Meeting agenda item ORM model."""

    __tablename__ = "meeting_agenda_items"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    meeting_id = Column(String(36), nullable=True, index=True)  # For RecurringMeeting
    task_id = Column(String(36), nullable=True, index=True)  # For standalone meeting tasks
    user_id = Column(String(255), nullable=False, index=True)
    title = Column(String(500), nullable=False)
    description = Column(Text, nullable=True)
    duration_minutes = Column(Integer, nullable=True)
    order_index = Column(Integer, nullable=False, default=0)
    is_completed = Column(Boolean, default=False)
    event_date = Column(Date, nullable=True, index=True)
    created_at = Column(DateTime, default=now_utc)
    updated_at = Column(DateTime, default=now_utc, onupdate=now_utc)


class MeetingSessionORM(Base):
    """Meeting session ORM model."""

    __tablename__ = "meeting_sessions"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id = Column(String(255), nullable=False, index=True)
    task_id = Column(String(36), nullable=False, index=True)
    status = Column(String(20), default="PREPARATION", index=True)
    current_agenda_index = Column(Integer, nullable=True)
    transcript = Column(Text, nullable=True)
    summary = Column(Text, nullable=True)
    started_at = Column(DateTime, nullable=True)
    ended_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=now_utc)
    updated_at = Column(DateTime, default=now_utc, onupdate=now_utc)


class MemoryORM(Base):
    """Memory ORM model."""

    __tablename__ = "memories"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id = Column(String(255), nullable=False, index=True)
    scope = Column(String(20), nullable=False, index=True)
    memory_type = Column(String(20), nullable=False)
    project_id = Column(String(36), nullable=True, index=True)
    content = Column(Text, nullable=False)
    tags = Column(Text, nullable=True)  # JSON array string
    source = Column(String(20), default="agent")
    created_at = Column(DateTime, default=now_utc)
    updated_at = Column(DateTime, default=now_utc, onupdate=now_utc)


class CaptureORM(Base):
    """Capture ORM model."""

    __tablename__ = "captures"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id = Column(String(255), nullable=False, index=True)
    content_type = Column(String(10), nullable=False)
    content_url = Column(String(500), nullable=True)
    raw_text = Column(Text, nullable=True)
    transcription = Column(Text, nullable=True)
    image_analysis = Column(Text, nullable=True)
    processed = Column(Boolean, default=False)
    created_at = Column(DateTime, default=now_utc)


class ChatSessionORM(Base):
    """Chat session ORM model."""

    __tablename__ = "chat_sessions"

    session_id = Column(String(100), primary_key=True)
    user_id = Column(String(255), primary_key=True, index=True)
    title = Column(String(200), nullable=True)
    created_at = Column(DateTime, default=now_utc)
    updated_at = Column(DateTime, default=now_utc, onupdate=now_utc)


class ChatMessageORM(Base):
    """Chat message ORM model."""

    __tablename__ = "chat_messages"
    __table_args__ = (
        ForeignKeyConstraint(
            ["session_id", "user_id"],
            ["chat_sessions.session_id", "chat_sessions.user_id"],
            ondelete="CASCADE",
        ),
    )

    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    session_id = Column(String(100), nullable=False, index=True)
    user_id = Column(String(255), nullable=False, index=True)
    role = Column(String(20), nullable=False)
    content = Column(Text, nullable=False, default="")
    created_at = Column(DateTime, default=now_utc, index=True)


class IssueORM(Base):
    """Issue ORM model - shared across all users."""

    __tablename__ = "issues"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id = Column(String(255), nullable=False, index=True)  # 投稿者
    title = Column(String(200), nullable=False)
    content = Column(Text, nullable=False)
    category = Column(String(30), nullable=False)
    status = Column(String(20), default="OPEN", index=True)
    like_count = Column(Integer, default=0)
    admin_response = Column(Text, nullable=True)
    created_at = Column(DateTime, default=now_utc)
    updated_at = Column(DateTime, default=now_utc, onupdate=now_utc)


class IssueLikeORM(Base):
    """Issue like ORM model."""

    __tablename__ = "issue_likes"
    __table_args__ = (
        UniqueConstraint("issue_id", "user_id", name="uq_issue_like"),
    )

    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    issue_id = Column(String(36), nullable=False, index=True)
    user_id = Column(String(255), nullable=False, index=True)
    created_at = Column(DateTime, default=now_utc)


class ScheduleSnapshotORM(Base):
    """Schedule snapshot ORM model for baseline management."""

    __tablename__ = "schedule_snapshots"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id = Column(String(255), nullable=False, index=True)
    project_id = Column(String(36), nullable=False, index=True)
    name = Column(String(200), nullable=False)
    is_active = Column(Boolean, default=False, index=True)
    start_date = Column(Date, nullable=False)
    tasks_json = Column(JSON, nullable=False, default=list)  # List of SnapshotTaskScheduleInfo
    days_json = Column(JSON, nullable=False, default=list)  # List of SnapshotDayAllocation
    phase_buffers_json = Column(JSON, nullable=True, default=list)  # List of PhaseBufferInfo
    total_buffer_minutes = Column(Integer, default=0)
    consumed_buffer_minutes = Column(Integer, default=0)
    capacity_hours = Column(Float, default=8.0)
    capacity_by_weekday = Column(JSON, nullable=True)  # List of 7 floats
    max_days = Column(Integer, default=60)
    plan_utilization_ratio = Column(Float, default=1.0)
    created_at = Column(DateTime, default=now_utc)
    updated_at = Column(DateTime, default=now_utc, onupdate=now_utc)


# ===========================================
# Database Session Management
# ===========================================


def get_engine():
    """Get async engine instance."""
    settings = get_settings()
    return create_async_engine(settings.DATABASE_URL, echo=settings.DEBUG)


def get_session_factory():
    """Get async session factory."""
    engine = get_engine()
    return sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def init_db():
    """Initialize database tables and run migrations."""
    engine = get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Run migrations to add any missing columns
    from app.infrastructure.local.migrations import run_migrations
    await run_migrations()


async def get_db_session() -> AsyncSession:
    """Get database session (for dependency injection)."""
    session_factory = get_session_factory()
    async with session_factory() as session:
        yield session
