"""
Chat model definitions.

Models for the chat interface between user and secretary agent.
"""

from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, Field

from app.core.config import get_settings
from app.models.enums import ChatMode, ToolApprovalMode

settings = get_settings()


class ChatRequest(BaseModel):
    """Request model for chat endpoints."""

    text: Optional[str] = Field(None, max_length=settings.MAX_TEXT_LENGTH, description="Text input")
    audio_url: Optional[str] = Field(None, description="Audio file URL")
    audio_base64: Optional[str] = Field(
        None,
        description="Audio data URL (data:audio/...;base64,...)",
    )
    audio_mime_type: Optional[str] = Field(
        None,
        max_length=120,
        description="Audio MIME type (e.g. audio/webm;codecs=opus)",
    )
    audio_language: Optional[str] = Field(
        None,
        max_length=20,
        description="Language hint for speech-to-text (e.g. ja-JP)",
    )
    image_url: Optional[str] = Field(None, description="Image file URL")
    image_base64: Optional[str] = Field(
        None,
        description="Image data URL (data:image/...;base64,...)"
    )
    file_url: Optional[str] = Field(None, description="Generic file URL (e.g. PDF)")
    file_base64: Optional[str] = Field(
        None,
        description="Generic file data URL (e.g. data:application/pdf;base64,...)"
    )
    file_name: Optional[str] = Field(None, max_length=255, description="Attached file name")
    file_mime_type: Optional[str] = Field(None, max_length=120, description="Attached file MIME type")
    mode: ChatMode = Field(ChatMode.DUMP, description="Chat mode")
    session_id: Optional[str] = Field(None, description="Session ID for continuity")
    context: dict[str, Any] = Field(default_factory=dict, description="Additional context")
    approval_mode: Optional[ToolApprovalMode] = Field(None, description="Tool approval mode")
    proposal_mode: bool = Field(False, description="If true, return proposals instead of executing")
    model: Optional[str] = Field(None, max_length=200, description="Model ID override for this message")


class SuggestedAction(BaseModel):
    """Suggested action for the user."""

    action_type: str = Field(..., description="Action type")
    label: str = Field(..., description="Display label")
    payload: dict[str, Any] = Field(default_factory=dict, description="Action payload")


class PendingQuestion(BaseModel):
    """A question awaiting user response."""

    id: str = Field(..., description="Question ID")
    question: str = Field(..., description="Question text")
    options: list[str] = Field(default_factory=list, description="Selectable options")
    allow_multiple: bool = Field(False, description="Whether multiple selections are allowed")
    placeholder: Optional[str] = Field(None, description="Placeholder for free-form input")


class PendingQuestions(BaseModel):
    """Questions awaiting user response (for ask_user_questions tool)."""

    questions: list[PendingQuestion] = Field(..., description="Question list")
    context: Optional[str] = Field(None, description="Question context")


class ChatResponse(BaseModel):
    """Response model for chat endpoint."""

    assistant_message: str = Field(..., description="Assistant response text")
    related_tasks: list[UUID] = Field(default_factory=list, description="Related task IDs")
    suggested_actions: list[SuggestedAction] = Field(default_factory=list, description="Suggested actions")
    session_id: str = Field(..., description="Session ID")
    capture_id: Optional[UUID] = Field(None, description="Created capture ID")
    pending_questions: Optional[PendingQuestions] = Field(
        None, description="Pending user questions from ask_user_questions"
    )


class StreamingChatChunk(BaseModel):
    """Streaming chat response chunk."""

    chunk_type: str = Field(..., description="Chunk type (text/tool_call/done)")
    content: str = Field("", description="Chunk text content")
    tool_name: Optional[str] = Field(None, description="Tool name for tool chunks")
    tool_result: Optional[dict[str, Any]] = Field(None, description="Tool result payload")
