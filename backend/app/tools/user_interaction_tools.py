"""
User interaction tools for the Secretary Agent.

Tools for asking questions to the user and waiting for their response.
"""

from __future__ import annotations

from typing import Optional

from google.adk.tools import FunctionTool
from pydantic import BaseModel, Field


# ===========================================
# Tool Input Models
# ===========================================


class AskUserQuestionInput(BaseModel):
    """Input for ask_user_question tool."""

    question: str = Field(
        ...,
        description="ユーザーに投げかける質問内容。明確で具体的な質問にすること。",
    )
    context: Optional[str] = Field(
        None,
        description="質問の背景や文脈（任意）。なぜこの質問をするのかの説明。",
    )
    options: Optional[list[str]] = Field(
        None,
        description="選択肢がある場合のリスト（任意）。例: ['はい', 'いいえ'] や ['A案', 'B案', 'C案']",
    )


# ===========================================
# Tool Functions
# ===========================================


async def ask_user_question(
    input_data: AskUserQuestionInput,
) -> dict:
    """
    Ask a question to the user and wait for their response.

    This tool is used when the agent needs clarification or additional
    information from the user before proceeding with a task.

    Args:
        input_data: Question parameters

    Returns:
        A response indicating the question was asked and awaiting user input
    """
    response = {
        "status": "awaiting_response",
        "question": input_data.question,
    }

    if input_data.context:
        response["context"] = input_data.context

    if input_data.options:
        response["options"] = input_data.options

    return response


# ===========================================
# FunctionTool Wrappers
# ===========================================


def ask_user_question_tool() -> FunctionTool:
    """
    Create ADK tool for asking questions to the user.

    This tool allows the agent to explicitly ask the user for information
    when needed, rather than making assumptions. The user's response will
    come in the next message.

    Returns:
        FunctionTool instance
    """

    async def _tool(input_data: dict) -> dict:
        """ask_user_question: ユーザーに質問を投げかけ、回答を待ちます。

        タスクを進めるために必要な情報が不足している場合や、
        ユーザーの確認が必要な場合に使用します。

        使用例:
        - プロジェクトの選択が必要な場合
        - タスクの優先度を確認したい場合
        - 期限や担当者を確認したい場合
        - 曖昧な指示を明確にしたい場合

        Args:
            input_data: 質問パラメータ
                - question (str, required): 質問内容
                - context (str, optional): 質問の背景
                - options (list[str], optional): 選択肢
        """
        validated = AskUserQuestionInput(**input_data)
        return await ask_user_question(validated)

    _tool.__name__ = "ask_user_question"
    return FunctionTool(func=_tool)
