"""
Issue Chat Service.

Handles chat interactions with the Issue Partner agent.
"""

import base64
import logging
from typing import AsyncGenerator
from uuid import uuid4

from google.adk.runners import InMemoryRunner
from google.genai.types import Content, Part

from app.agents.issue_agent import create_issue_agent
from app.interfaces.issue_repository import IIssueRepository
from app.interfaces.llm_provider import ILLMProvider

logger = logging.getLogger(__name__)

# Module-level storage for session runners (singleton pattern)
# This persists across API requests while the server is running
_runners: dict[str, InMemoryRunner] = {}


class IssueChatService:
    """Service for Issue chat functionality."""

    def __init__(
        self,
        llm_provider: ILLMProvider,
        issue_repo: IIssueRepository,
    ):
        self.llm_provider = llm_provider
        self.issue_repo = issue_repo

    def _get_runner(self, user_id: str, session_id: str) -> InMemoryRunner:
        """Get or create runner for session."""
        key = f"{user_id}:{session_id}"
        if key not in _runners:
            agent = create_issue_agent(
                llm_provider=self.llm_provider,
                issue_repo=self.issue_repo,
                user_id=user_id,
            )
            _runners[key] = InMemoryRunner(
                agent=agent,
                app_name="issue_chat",
            )
        return _runners[key]

    async def _ensure_session(self, runner: InMemoryRunner, user_id: str, session_id: str) -> None:
        existing = await runner.session_service.get_session(
            app_name="issue_chat",
            user_id=user_id,
            session_id=session_id,
        )
        if existing is None:
            await runner.session_service.create_session(
                app_name="issue_chat",
                user_id=user_id,
                session_id=session_id,
            )

    @staticmethod
    def _build_user_content(message: str, image_base64: str | None = None) -> Content:
        """Build user Content with optional image."""
        parts: list[Part] = []

        if image_base64:
            try:
                # Parse data URI: "data:image/png;base64,..."
                if image_base64.startswith("data:"):
                    header, data = image_base64.split(",", 1)
                    mime_type = header.split(":")[1].split(";")[0]
                else:
                    data = image_base64
                    mime_type = "image/png"

                image_bytes = base64.b64decode(data)
                parts.append(Part.from_bytes(data=image_bytes, mime_type=mime_type))
            except Exception as e:
                logger.warning(f"Failed to process image: {e}")

        if message:
            parts.append(Part(text=message))

        return Content(role="user", parts=parts)

    async def process_chat_stream(
        self,
        user_id: str,
        message: str,
        session_id: str | None = None,
        image_base64: str | None = None,
    ) -> AsyncGenerator[dict, None]:
        """
        Process a chat message and yield streaming chunks.

        Args:
            user_id: User ID
            message: User message
            session_id: Session ID for conversation continuity
            image_base64: Optional base64 encoded image (data URI format)

        Yields:
            Streaming chunks with tool calls and text
        """
        if not session_id:
            session_id = f"issue_{uuid4().hex[:8]}"

        runner = self._get_runner(user_id, session_id)
        await self._ensure_session(runner, user_id, session_id)

        # Yield session info
        yield {
            "chunk_type": "session",
            "session_id": session_id,
        }

        try:
            # Run agent
            user_message = self._build_user_content(message, image_base64)
            _pending_tool_ids: dict[str, list[str]] = {}
            async for event in runner.run_async(
                user_id=user_id,
                session_id=session_id,
                new_message=user_message,
            ):
                if event.content:
                    for part in event.content.parts:
                        if hasattr(part, "text") and part.text:
                            yield {
                                "chunk_type": "text",
                                "content": part.text,
                            }
                        elif hasattr(part, "function_call") and part.function_call:
                            tool_call_id = str(uuid4())
                            fc_name = part.function_call.name
                            _pending_tool_ids.setdefault(fc_name, []).append(tool_call_id)
                            yield {
                                "chunk_type": "tool_start",
                                "tool_name": fc_name,
                                "tool_call_id": tool_call_id,
                                "tool_args": dict(part.function_call.args) if part.function_call.args else {},
                            }
                        elif hasattr(part, "function_response") and part.function_response:
                            result = part.function_response.response
                            fr_name = part.function_response.name
                            pending = _pending_tool_ids.get(fr_name, [])
                            resp_tool_call_id = pending.pop(0) if pending else None
                            yield {
                                "chunk_type": "tool_end",
                                "tool_name": fr_name,
                                "tool_call_id": resp_tool_call_id,
                                "tool_result": result,
                            }
                            # Detect ask_user_questions response
                            if isinstance(result, dict) and result.get("status") == "awaiting_response":
                                questions = result.get("questions", [])
                                if questions:
                                    yield {
                                        "chunk_type": "questions",
                                        "questions": questions,
                                        "context": result.get("context"),
                                    }

            yield {
                "chunk_type": "done",
            }

        except Exception as e:
            logger.error(f"Error during issue chat: {e}")
            yield {
                "chunk_type": "error",
                "content": str(e),
            }
