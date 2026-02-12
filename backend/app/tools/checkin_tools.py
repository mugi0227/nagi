"""
Check-in related agent tools.

Tools for creating and listing structured check-ins (V2) from chat.
"""

from __future__ import annotations

import logging
from datetime import date
from typing import Optional
from uuid import UUID

from google.adk.tools import FunctionTool
from pydantic import BaseModel, Field

from app.interfaces.checkin_repository import ICheckinRepository
from app.interfaces.project_member_repository import IProjectMemberRepository
from app.interfaces.project_repository import IProjectRepository
from app.interfaces.proposal_repository import IProposalRepository
from app.models.collaboration import CheckinCreateV2, CheckinItem
from app.models.enums import CheckinItemCategory, CheckinItemUrgency, CheckinMood
from app.services.project_permissions import ProjectAction
from app.tools.approval_tools import create_tool_action_proposal
from app.tools.permissions import require_project_action

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Input Models
# ---------------------------------------------------------------------------


class CheckinItemInput(BaseModel):
    """Input for a single check-in item."""

    category: str = Field(
        ...,
        description="カテゴリ: blocker / discussion / update / request",
    )
    content: str = Field(..., description="内容")
    related_task_id: Optional[str] = Field(None, description="関連タスクID")
    urgency: str = Field("medium", description="緊急度: high / medium / low")


class CreateCheckinInput(BaseModel):
    """Input for create_checkin tool."""

    project_id: str = Field(..., description="プロジェクトID（UUID）")
    checkin_date: Optional[str] = Field(
        None, description="チェックイン日（YYYY-MM-DD、省略時は今日）"
    )
    items: list[CheckinItemInput] = Field(
        default_factory=list, description="チェックイン項目リスト"
    )
    mood: Optional[str] = Field(
        None, description="調子: good / okay / struggling"
    )
    must_discuss_in_next_meeting: Optional[str] = Field(
        None, description="次回ミーティングで必ず話すべきこと"
    )
    free_comment: Optional[str] = Field(None, description="自由コメント")
    member_user_id: Optional[str] = Field(
        None, description="チェックインするメンバーのID（省略時は現在のユーザー）"
    )


class ListCheckinsInput(BaseModel):
    """Input for list_checkins tool."""

    project_id: str = Field(..., description="プロジェクトID（UUID）")
    member_user_id: Optional[str] = Field(None, description="メンバーIDでフィルタ")
    start_date: Optional[str] = Field(None, description="開始日 (YYYY-MM-DD)")
    end_date: Optional[str] = Field(None, description="終了日 (YYYY-MM-DD)")


# ---------------------------------------------------------------------------
# Core implementation
# ---------------------------------------------------------------------------


async def create_checkin(
    user_id: str,
    checkin_repo: ICheckinRepository,
    project_repo: IProjectRepository,
    member_repo: IProjectMemberRepository,
    input_data: CreateCheckinInput,
) -> dict:
    """Create a V2 structured check-in."""

    # 1. Parse project_id
    try:
        project_id = UUID(input_data.project_id)
    except ValueError:
        return {"error": f"Invalid project ID: {input_data.project_id}"}

    # 2. Permission check
    access = await require_project_action(
        user_id, project_id, project_repo, member_repo,
        ProjectAction.CHECKIN_WRITE,
    )
    if isinstance(access, dict):
        return access

    # 3. Default member_user_id to current user
    member_user_id = input_data.member_user_id or user_id

    # 4. Parse checkin_date (default: today)
    checkin_date = date.today()
    if input_data.checkin_date:
        try:
            checkin_date = date.fromisoformat(input_data.checkin_date)
        except ValueError:
            return {"error": f"Invalid date format: {input_data.checkin_date}"}

    # 5. Convert items
    items: list[CheckinItem] = []
    for item_input in input_data.items:
        try:
            category = CheckinItemCategory(item_input.category.lower())
        except ValueError:
            return {
                "error": (
                    f"Invalid category: {item_input.category}. "
                    "Must be: blocker, discussion, update, request"
                )
            }
        try:
            urgency = CheckinItemUrgency(item_input.urgency.lower())
        except ValueError:
            urgency = CheckinItemUrgency.MEDIUM

        items.append(
            CheckinItem(
                category=category,
                content=item_input.content,
                related_task_id=item_input.related_task_id,
                urgency=urgency,
            )
        )

    # 6. Parse mood
    mood: Optional[CheckinMood] = None
    if input_data.mood:
        try:
            mood = CheckinMood(input_data.mood.lower())
        except ValueError:
            pass  # non-critical

    # 7. Create check-in
    checkin_data = CheckinCreateV2(
        member_user_id=member_user_id,
        checkin_date=checkin_date,
        items=items,
        mood=mood,
        must_discuss_in_next_meeting=input_data.must_discuss_in_next_meeting,
        free_comment=input_data.free_comment,
    )

    result = await checkin_repo.create_v2(access.owner_id, project_id, checkin_data)
    return result.model_dump(mode="json")


async def list_checkins(
    user_id: str,
    checkin_repo: ICheckinRepository,
    project_repo: IProjectRepository,
    member_repo: IProjectMemberRepository,
    input_data: ListCheckinsInput,
) -> dict:
    """List V2 structured check-ins for a project."""

    try:
        project_id = UUID(input_data.project_id)
    except ValueError:
        return {"error": f"Invalid project ID: {input_data.project_id}"}

    access = await require_project_action(
        user_id, project_id, project_repo, member_repo,
        ProjectAction.CHECKIN_READ,
    )
    if isinstance(access, dict):
        return access

    start_date: Optional[date] = None
    end_date: Optional[date] = None
    if input_data.start_date:
        try:
            start_date = date.fromisoformat(input_data.start_date)
        except ValueError:
            return {"error": f"Invalid start_date: {input_data.start_date}"}
    if input_data.end_date:
        try:
            end_date = date.fromisoformat(input_data.end_date)
        except ValueError:
            return {"error": f"Invalid end_date: {input_data.end_date}"}

    checkins = await checkin_repo.list_v2(
        access.owner_id,
        project_id,
        member_user_id=input_data.member_user_id,
        start_date=start_date,
        end_date=end_date,
    )

    return {
        "checkins": [c.model_dump(mode="json") for c in checkins],
        "count": len(checkins),
    }


# ---------------------------------------------------------------------------
# Tool factories
# ---------------------------------------------------------------------------


def create_checkin_tool(
    checkin_repo: ICheckinRepository,
    project_repo: IProjectRepository,
    member_repo: IProjectMemberRepository,
    user_id: str,
    proposal_repo: Optional[IProposalRepository] = None,
    session_id: Optional[str] = None,
    auto_approve: bool = True,
) -> FunctionTool:
    """Create ADK tool for creating V2 check-ins."""

    async def _tool(input_data: dict) -> dict:
        """create_checkin: プロジェクトにチェックインを作成します。

        ユーザーの「脳内ダンプ」や近況報告を構造化されたチェックインとして保存します。
        チェックインは後で定例会議のアジェンダに自動で反映されます。

        Parameters:
            project_id (str): プロジェクトID（UUID、必須）
            checkin_date (str, optional): チェックイン日 (YYYY-MM-DD、省略時は今日)
            items (list, optional): チェックイン項目リスト。各項目:
                - category (str): blocker / discussion / update / request
                - content (str): 内容
                - related_task_id (str, optional): 関連タスクID
                - urgency (str, optional): high / medium / low（デフォルト: medium）
            mood (str, optional): 調子 (good / okay / struggling)
            must_discuss_in_next_meeting (str, optional): 次回ミーティングで必ず話すべきこと
            free_comment (str, optional): 自由コメント
            member_user_id (str, optional): メンバーID（省略時は現在のユーザー）

        Returns:
            dict: 作成されたチェックイン情報

        Example:
            {
                "project_id": "...",
                "items": [
                    {"category": "blocker", "content": "APIの認証が通らない", "urgency": "high"},
                    {"category": "update", "content": "デザインレビュー完了"}
                ],
                "mood": "okay",
                "free_comment": "今週はちょっとバタバタしてる"
            }
        """
        if not isinstance(input_data, dict):
            logger.error(
                "create_checkin: Expected dict but got %s: %s",
                type(input_data), input_data,
            )
            return {"error": f"input_data must be dict, got {type(input_data)}"}

        payload = dict(input_data)
        proposal_desc = payload.pop("proposal_description", "")

        if proposal_repo and session_id and not auto_approve:
            return await create_tool_action_proposal(
                user_id, session_id, proposal_repo,
                "create_checkin", payload, proposal_desc,
            )

        return await create_checkin(
            user_id, checkin_repo, project_repo, member_repo,
            CreateCheckinInput(**payload),
        )

    _tool.__name__ = "create_checkin"
    return FunctionTool(func=_tool)


def list_checkins_tool(
    checkin_repo: ICheckinRepository,
    project_repo: IProjectRepository,
    member_repo: IProjectMemberRepository,
    user_id: str,
) -> FunctionTool:
    """Create ADK tool for listing V2 check-ins."""

    async def _tool(input_data: dict) -> dict:
        """list_checkins: プロジェクトのチェックイン一覧を取得します。

        Parameters:
            project_id (str): プロジェクトID（UUID、必須）
            member_user_id (str, optional): メンバーIDでフィルタ
            start_date (str, optional): 開始日 (YYYY-MM-DD)
            end_date (str, optional): 終了日 (YYYY-MM-DD)

        Returns:
            dict: checkins (list), count (int)
        """
        if not isinstance(input_data, dict):
            return {"error": f"input_data must be dict, got {type(input_data)}"}

        return await list_checkins(
            user_id, checkin_repo, project_repo, member_repo,
            ListCheckinsInput(**input_data),
        )

    _tool.__name__ = "list_checkins"
    return FunctionTool(func=_tool)
