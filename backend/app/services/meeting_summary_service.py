"""
Meeting Summary Service.

Analyzes meeting transcripts using LLM to extract summaries, decisions, and next actions.
"""

from __future__ import annotations

import json
import re
from typing import Optional
from uuid import UUID

from google.adk.runners import InMemoryRunner
from google.genai.types import Content, Part
from pydantic import ValidationError

from app.core.exceptions import LLMValidationError
from app.core.logger import logger
from app.interfaces.llm_provider import ILLMProvider
from app.models.meeting_agenda import MeetingAgendaItem
from app.models.meeting_summary import (
    AgendaDiscussion,
    Decision,
    MeetingSummary,
    NextAction,
)


class MeetingSummaryService:
    """Service for analyzing meeting transcripts."""

    APP_NAME = "SecretaryPartnerAI_MeetingSummary"
    MAX_RETRIES = 2

    def __init__(self, llm_provider: ILLMProvider):
        """Initialize Meeting Summary Service."""
        self._llm_provider = llm_provider

    async def analyze_transcript(
        self,
        session_id: UUID,
        transcript: str,
        agenda_items: list[MeetingAgendaItem],
        meeting_title: Optional[str] = None,
    ) -> MeetingSummary:
        """
        Analyze meeting transcript to extract summary, decisions, and next actions.

        Args:
            session_id: Meeting session ID
            transcript: Meeting transcript text
            agenda_items: List of agenda items for context
            meeting_title: Optional meeting title for context

        Returns:
            MeetingSummary with extracted information

        Raises:
            LLMValidationError: If LLM output validation fails after retries
        """
        # Import here to avoid circular imports
        from google.adk import Agent

        # Create a minimal agent for transcript analysis
        agent = Agent(
            name="meeting_summary_analyzer",
            model=self._llm_provider.get_model(),
            instruction=self._get_system_instruction(),
        )
        runner = InMemoryRunner(agent=agent, app_name=self.APP_NAME)

        # Build prompt
        prompt = self._build_analysis_prompt(transcript, agenda_items, meeting_title)

        # Run with retry logic
        return await self._run_with_retry(runner, session_id, prompt)

    def _get_system_instruction(self) -> str:
        """Get system instruction for the analysis agent."""
        return """あなたは会議議事録分析のエキスパートです。
会議の議事録（トランスクリプト）を分析し、以下の情報を抽出します：

1. **全体サマリー**: 会議の概要を2-3文でまとめる
2. **アジェンダごとの議論**: 各アジェンダ項目について議論された内容を要約
3. **決定事項**: 会議で決まったことをリストアップ
4. **ネクストアクション**: 今後のアクション項目（担当者・期限があれば含める）

必ずJSON形式で出力してください。日本語で回答してください。"""

    def _build_analysis_prompt(
        self,
        transcript: str,
        agenda_items: list[MeetingAgendaItem],
        meeting_title: Optional[str] = None,
    ) -> str:
        """Build the prompt for transcript analysis."""
        parts = []

        if meeting_title:
            parts.append(f"# 会議タイトル: {meeting_title}")
            parts.append("")

        if agenda_items:
            parts.append("## アジェンダ")
            for i, item in enumerate(agenda_items, 1):
                parts.append(f"{i}. {item.title}")
                if item.description:
                    parts.append(f"   - {item.description}")
            parts.append("")

        parts.append("## 議事録")
        parts.append(transcript)
        parts.append("")
        parts.append("---")
        parts.append("")
        parts.append("上記の議事録を分析し、以下のJSON形式で結果を返してください：")
        parts.append("")
        parts.append("""```json
{
  "overall_summary": "会議全体の要約（2-3文）",
  "agenda_discussions": [
    {
      "agenda_title": "アジェンダ項目のタイトル",
      "summary": "この議題についての議論の要約",
      "key_points": ["ポイント1", "ポイント2"]
    }
  ],
  "decisions": [
    {
      "content": "決定内容",
      "related_agenda": "関連するアジェンダ（任意）",
      "rationale": "決定の理由（任意）"
    }
  ],
  "next_actions": [
    {
      "title": "アクション項目のタイトル",
      "description": "詳細説明（任意）",
      "purpose": "なぜやるか・目的（任意）",
      "assignee": "担当者名（任意）",
      "due_date": "YYYY-MM-DD形式の期限（任意）",
      "related_agenda": "関連するアジェンダ（任意）",
      "priority": "HIGH/MEDIUM/LOW",
      "estimated_minutes": 見積もり時間（分、整数、任意）,
      "energy_level": "HIGH/MEDIUM/LOW（タスクの負荷レベル）"
    }
  ]
}
```

**注意事項**:
- 決定事項は「〇〇することに決定」「〇〇で合意」などの明確な決定のみを抽出
- ネクストアクションは具体的なアクションのみを抽出（「検討する」などの曖昧なものは含めない）
- 担当者名は議事録に記載があれば抽出、なければnull
- 期限も同様に、明示されていればYYYY-MM-DD形式で、なければnull
- estimated_minutes: タスクの内容から見積もり時間を推定する（例: 簡単なタスク=30, 中程度=60, 複雑=120）
- energy_level: タスクの負荷を推定する（HIGH=集中力が必要な重い作業, MEDIUM=普通, LOW=軽い作業）
- purpose: アクションの目的や背景を簡潔に記述する
""")

        return "\n".join(parts)

    async def _run_with_retry(
        self,
        runner: InMemoryRunner,
        session_id: UUID,
        prompt: str,
    ) -> MeetingSummary:
        """Run agent with retry logic for validation failures."""
        raw_output = ""

        for attempt in range(1, self.MAX_RETRIES + 1):
            try:
                # Create session
                run_session_id = f"transcript-analysis-{session_id}-{attempt}"
                await runner.session_service.create_session(
                    app_name=self.APP_NAME,
                    user_id="system",
                    session_id=run_session_id,
                )

                # Run agent
                message = Content(role="user", parts=[Part(text=prompt)])
                response_parts: list[str] = []

                async for event in runner.run_async(
                    user_id="system",
                    session_id=run_session_id,
                    new_message=message,
                ):
                    if event.content and getattr(event.content, "parts", None):
                        for part in event.content.parts or []:
                            text = getattr(part, "text", None)
                            if text:
                                response_parts.append(text)

                raw_output = "".join(response_parts)

                # Parse and validate
                summary = self._parse_summary(session_id, raw_output)
                return summary

            except ValidationError as e:
                logger.warning(
                    f"Summary validation failed (attempt {attempt}/{self.MAX_RETRIES}): {e}"
                )
                # Modify prompt for retry
                prompt = f"""前回の出力にエラーがありました。修正してください。

エラー: {str(e)}

{prompt}"""

            except Exception as e:
                logger.error(f"Transcript analysis failed: {e}")
                break

        raise LLMValidationError(
            message=f"Transcript analysis failed after {self.MAX_RETRIES} attempts",
            raw_output=raw_output,
            attempts=self.MAX_RETRIES,
        )

    def _parse_summary(self, session_id: UUID, raw_output: str) -> MeetingSummary:
        """Parse LLM output into MeetingSummary model."""
        # Extract JSON from markdown code block
        json_match = re.search(r"```(?:json)?\s*([\s\S]*?)```", raw_output)
        if json_match:
            json_str = json_match.group(1).strip()
        else:
            # Try to find raw JSON
            json_match = re.search(r"\{[\s\S]*\}", raw_output)
            if json_match:
                json_str = json_match.group(0)
            else:
                raise ValidationError.from_exception_data(
                    "MeetingSummary",
                    [{"type": "value_error", "msg": "No JSON found in output"}],
                )

        # Parse JSON
        data = json.loads(json_str)

        # Build agenda discussions
        agenda_discussions = []
        for disc_data in data.get("agenda_discussions", []):
            agenda_discussions.append(AgendaDiscussion(
                agenda_title=disc_data.get("agenda_title", ""),
                summary=disc_data.get("summary", ""),
                key_points=disc_data.get("key_points", []),
            ))

        # Build decisions
        decisions = []
        for dec_data in data.get("decisions", []):
            decisions.append(Decision(
                content=dec_data.get("content", ""),
                related_agenda=dec_data.get("related_agenda"),
                rationale=dec_data.get("rationale"),
            ))

        # Build next actions
        next_actions = []
        for action_data in data.get("next_actions", []):
            next_actions.append(NextAction(
                title=action_data.get("title", ""),
                description=action_data.get("description"),
                purpose=action_data.get("purpose"),
                assignee=action_data.get("assignee"),
                due_date=action_data.get("due_date"),
                related_agenda=action_data.get("related_agenda"),
                priority=action_data.get("priority", "MEDIUM"),
                estimated_minutes=action_data.get("estimated_minutes"),
                energy_level=action_data.get("energy_level"),
            ))

        return MeetingSummary(
            session_id=session_id,
            overall_summary=data.get("overall_summary", ""),
            agenda_discussions=agenda_discussions,
            decisions=decisions,
            next_actions=next_actions,
            action_items_count=len(next_actions),
        )
