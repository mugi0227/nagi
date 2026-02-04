"""
User interaction tools for the Secretary Agent.

Tools for asking questions to the user and waiting for their response.
Supports multiple questions with radio button options (like Claude Code VSCode extension).
"""

from __future__ import annotations

from typing import Optional
from uuid import uuid4

from google.adk.tools import FunctionTool
from pydantic import BaseModel, Field


# ===========================================
# Tool Input Models
# ===========================================


class QuestionInput(BaseModel):
    """A single question to ask the user."""

    question: str = Field(
        ...,
        description="質問文。明確で具体的に。",
    )
    options: list[str] = Field(
        default_factory=list,
        description="選択肢のリスト。UIでは自動的に「その他（自由入力）」が追加される。空の場合は自由入力のみのUIになる。",
    )
    allow_multiple: bool = Field(
        False,
        description="複数選択を許可するか。Trueならチェックボックス、Falseならラジオボタン。",
    )
    placeholder: Optional[str] = Field(
        None,
        description="自由入力欄のプレースホルダー。optionsが空の場合に表示される。例: '2025-02-10 14:00'",
    )


class AskUserQuestionsInput(BaseModel):
    """Input for ask_user_questions tool."""

    questions: list[QuestionInput] = Field(
        ...,
        min_length=1,
        description="ユーザーに投げかける質問のリスト。",
    )
    context: Optional[str] = Field(
        None,
        description="質問全体の背景や文脈。なぜこれらの質問をするのかの説明。",
    )


# ===========================================
# Tool Functions
# ===========================================


async def ask_user_questions(
    input_data: AskUserQuestionsInput,
) -> dict:
    """
    Ask multiple questions to the user and wait for their responses.

    This tool is used when the agent needs clarification or additional
    information from the user before proceeding with a task.
    Each question has predefined options plus an "Other" option for free input.

    Args:
        input_data: Questions parameters

    Returns:
        A response with questions awaiting user input
    """
    questions = []
    for q in input_data.questions:
        item: dict = {
            "id": str(uuid4())[:8],  # Short unique ID
            "question": q.question,
            "options": q.options,
            "allow_multiple": q.allow_multiple,
        }
        if q.placeholder:
            item["placeholder"] = q.placeholder
        questions.append(item)

    response = {
        "status": "awaiting_response",
        "questions": questions,
    }

    if input_data.context:
        response["context"] = input_data.context

    return response


# ===========================================
# FunctionTool Wrappers
# ===========================================


def ask_user_questions_tool() -> FunctionTool:
    """
    Create ADK tool for asking multiple questions to the user.

    This tool allows the agent to explicitly ask the user for information
    when needed, rather than making assumptions. Questions are presented
    with radio button options (like Claude Code VSCode extension).

    Returns:
        FunctionTool instance
    """

    async def _tool(input_data: dict) -> dict:
        """ask_user_questions: ユーザーに複数の質問を投げかけ、回答を待ちます。

        タスクやアジェンダを作成・編集する際に、詳細を詰めるために使用します。
        各質問には選択肢を設定でき、UIではラジオボタン（またはチェックボックス）と
        「その他」の自由入力欄が表示されます。

        **選択肢あり（options指定）**: ボタンやラジオボタンで選択するUI
        **選択肢なし（options空）**: テキスト入力欄のみのUI（日時や自由記述など）

        使用例:
        - Yes/No確認 → options: ["はい", "いいえ"]
        - 選択式 → options: ["30分", "1時間", "1時間半"]
        - 自由入力 → options: []（空）, placeholder: "例: 2025-02-10 14:00"

        Args:
            input_data: 質問パラメータ
                - questions (list[QuestionInput], required): 質問リスト
                    - question (str): 質問文
                    - options (list[str]): 選択肢（空なら自由入力UI）
                    - allow_multiple (bool): 複数選択可能か（デフォルト: False）
                    - placeholder (str, optional): 自由入力時のプレースホルダー
                - context (str, optional): 質問全体の背景
        """
        validated = AskUserQuestionsInput(**input_data)
        return await ask_user_questions(validated)

    _tool.__name__ = "ask_user_questions"
    return FunctionTool(func=_tool)
