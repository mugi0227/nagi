"""Pydantic models (schemas) for the application."""

from app.models.agent_task import AgentTask, AgentTaskCreate, AgentTaskUpdate
from app.models.capture import Capture, CaptureCreate
from app.models.chat import ChatMode, ChatRequest, ChatResponse
from app.models.chat_session import ChatMessage, ChatMessageCreate, ChatSession
from app.models.enums import (
    ActionType,
    ContentType,
    CreatedBy,
    EnergyLevel,
    MemoryScope,
    MemoryType,
    Priority,
    ProjectStatus,
    TaskStatus,
)
from app.models.memory import (
    Memory,
    MemoryCreate,
    MemoryUpdate,
    ProjectMemory,
    UserMemory,
    WorkMemory,
)
from app.models.project import Project, ProjectCreate, ProjectUpdate
from app.models.project_kpi import ProjectKpiConfig, ProjectKpiMetric, ProjectKpiTemplate
from app.models.task import Task, TaskCreate, TaskUpdate

__all__ = [
    # Enums
    "TaskStatus",
    "Priority",
    "EnergyLevel",
    "CreatedBy",
    "ProjectStatus",
    "ActionType",
    "ContentType",
    "MemoryScope",
    "MemoryType",
    "ChatMode",
    # Task
    "Task",
    "TaskCreate",
    "TaskUpdate",
    # Project
    "Project",
    "ProjectCreate",
    "ProjectUpdate",
    "ProjectKpiConfig",
    "ProjectKpiMetric",
    "ProjectKpiTemplate",
    # AgentTask
    "AgentTask",
    "AgentTaskCreate",
    "AgentTaskUpdate",
    # Memory
    "Memory",
    "MemoryCreate",
    "MemoryUpdate",
    "UserMemory",
    "ProjectMemory",
    "WorkMemory",
    # Capture
    "Capture",
    "CaptureCreate",
    # Chat
    "ChatRequest",
    "ChatResponse",
    "ChatSession",
    "ChatMessage",
    "ChatMessageCreate",
]
