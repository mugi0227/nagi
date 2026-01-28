"""
Shared helpers for tool approval flows.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from app.interfaces.proposal_repository import IProposalRepository
from app.models.proposal import Proposal, ProposalResponse, ProposalType


def _read_str(value: Any) -> str | None:
    if isinstance(value, str):
        trimmed = value.strip()
        return trimmed or None
    return None


def _read_first(args: dict[str, Any], keys: list[str]) -> str | None:
    for key in keys:
        value = _read_str(args.get(key))
        if value:
            return value
    return None


def _default_tool_action_description(tool_name: str, args: dict[str, Any]) -> str:
    title = _read_first(args, ["title", "task_title"])
    name = _read_first(args, ["name"])
    email = _read_first(args, ["email"])

    match tool_name:
        case "update_task":
            return f'タスク「{title}」を更新します。' if title else "タスクを更新します。"
        case "delete_task":
            return "タスクを削除します。"
        case "assign_task":
            return "タスクの担当者を設定します。"
        case "update_project":
            return f'プロジェクト「{name}」を更新します。' if name else "プロジェクトを更新します。"
        case "invite_project_member":
            return f"{email} をプロジェクトに招待します。" if email else "プロジェクトにメンバーを招待します。"
        case "create_project_summary":
            return "プロジェクトサマリーを作成します。"
        case "add_to_memory":
            return "メモを記録します。"
        case "refresh_user_profile":
            return "ユーザープロフィールを更新します。"
        case "schedule_agent_task":
            return "エージェントタスクをスケジュールします。"
        case "add_agenda_item":
            return "アジェンダを追加します。"
        case "update_agenda_item":
            return "アジェンダを更新します。"
        case "delete_agenda_item":
            return "アジェンダを削除します。"
        case "reorder_agenda_items":
            return "アジェンダの順序を更新します。"
        case "create_phase":
            return "フェーズを作成します。"
        case "update_phase":
            return "フェーズを更新します。"
        case "delete_phase":
            return "フェーズを削除します。"
        case "create_milestone":
            return "マイルストーンを作成します。"
        case "update_milestone":
            return "マイルストーンを更新します。"
        case "delete_milestone":
            return "マイルストーンを削除します。"
        case _:
            return f'「{tool_name}」を実行します。'


async def create_tool_action_proposal(
    user_id: str,
    session_id: str,
    proposal_repo: IProposalRepository,
    tool_name: str,
    args: dict[str, Any],
    description: str = "",
) -> dict:
    if not description:
        description = _default_tool_action_description(tool_name, args)

    user_id_raw = None
    try:
        parsed_user_id = UUID(user_id)
    except (ValueError, AttributeError):
        import hashlib

        user_id_raw = user_id
        parsed_user_id = UUID(bytes=hashlib.md5(user_id.encode()).digest())

    payload = {
        "tool_name": tool_name,
        "args": args,
    }

    proposal = Proposal(
        user_id=parsed_user_id,
        user_id_raw=user_id_raw,
        session_id=session_id,
        proposal_type=ProposalType.TOOL_ACTION,
        payload=payload,
        description=description,
    )

    created_proposal = await proposal_repo.create(proposal)

    # Return pending_approval status to signal AI to wait for user approval
    return {
        "status": "pending_approval",
        "proposal_id": str(created_proposal.id),
        "proposal_type": ProposalType.TOOL_ACTION.value,
        "description": description,
        "message": "ユーザーの承諾待ちです。承諾されるまで「完了しました」とは言わないでください。",
    }
