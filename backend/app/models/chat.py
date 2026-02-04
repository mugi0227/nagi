"""
Chat model definitions.

Models for the main chat interface between user and secretary agent.
"""

from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, Field

from app.core.config import get_settings
from app.models.enums import ChatMode, ToolApprovalMode

settings = get_settings()


class ChatRequest(BaseModel):
    """Request model for chat endpoint."""

    text: Optional[str] = Field(None, max_length=settings.MAX_TEXT_LENGTH, description="テキスト入力")
    audio_url: Optional[str] = Field(None, description="音声ファイルURL")
    image_url: Optional[str] = Field(None, description="画像ファイルURL")
    image_base64: Optional[str] = Field(None, description="Base64エンコードされた画像データ（data:image/...形式）")
    mode: ChatMode = Field(ChatMode.DUMP, description="チャットモード")
    session_id: Optional[str] = Field(None, description="セッションID（継続会話用）")
    context: dict[str, Any] = Field(default_factory=dict, description="追加コンテキスト")
    approval_mode: Optional[ToolApprovalMode] = Field(None, description="Tool approval mode")
    proposal_mode: bool = Field(False, description="提案モード（True: AIが提案→ユーザー承諾、False: AI が直接作成）")


class SuggestedAction(BaseModel):
    """Suggested action for the user."""

    action_type: str = Field(..., description="アクションタイプ")
    label: str = Field(..., description="表示ラベル")
    payload: dict[str, Any] = Field(default_factory=dict, description="アクション実行用データ")


class PendingQuestion(BaseModel):
    """A question awaiting user response."""

    id: str = Field(..., description="質問ID（回答と紐付け用）")
    question: str = Field(..., description="質問文")
    options: list[str] = Field(default_factory=list, description="選択肢（UIで「その他」は自動追加）。空の場合は自由入力UI。")
    allow_multiple: bool = Field(False, description="複数選択可能か（True: チェックボックス, False: ラジオボタン）")
    placeholder: Optional[str] = Field(None, description="自由入力時のプレースホルダー")


class PendingQuestions(BaseModel):
    """Questions awaiting user response (for ask_user_questions tool)."""

    questions: list[PendingQuestion] = Field(..., description="質問リスト")
    context: Optional[str] = Field(None, description="質問全体の背景・文脈")


class ChatResponse(BaseModel):
    """Response model for chat endpoint."""

    assistant_message: str = Field(..., description="アシスタントの応答メッセージ")
    related_tasks: list[UUID] = Field(
        default_factory=list, description="関連するタスクIDリスト"
    )
    suggested_actions: list[SuggestedAction] = Field(
        default_factory=list, description="提案アクションリスト"
    )
    session_id: str = Field(..., description="セッションID")
    capture_id: Optional[UUID] = Field(None, description="作成されたCaptureのID")
    pending_questions: Optional[PendingQuestions] = Field(
        None, description="ユーザーへの質問（ask_user_questionsツール使用時）"
    )


class StreamingChatChunk(BaseModel):
    """Streaming chat response chunk."""

    chunk_type: str = Field(..., description="チャンクタイプ (text/tool_call/done)")
    content: str = Field("", description="テキストコンテンツ")
    tool_name: Optional[str] = Field(None, description="ツール名（tool_callの場合）")
    tool_result: Optional[dict[str, Any]] = Field(None, description="ツール実行結果")
