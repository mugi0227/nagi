"""Shared helpers for tool approval flows."""

from __future__ import annotations

import hashlib
from typing import Any
from uuid import UUID

from app.interfaces.proposal_repository import IProposalRepository
from app.models.proposal import Proposal, ProposalType


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
            return f'Update task "{title}".' if title else "Update a task."
        case "delete_task":
            return "Delete a task."
        case "assign_task":
            return "Assign a task."
        case "update_project":
            return f'Update project "{name}".' if name else "Update a project."
        case "invite_project_member":
            return (
                f"Invite {email} to the project."
                if email
                else "Invite a new member to the project."
            )
        case "create_project_summary":
            return "Create a project summary."
        case "add_to_memory":
            return "Save information to memory."
        case "refresh_user_profile":
            return "Refresh user profile memory."
        case "schedule_agent_task":
            return "Schedule an agent task."
        case "apply_schedule_request":
            return "Apply today's schedule preference request."
        case "add_agenda_item":
            return "Add an agenda item."
        case "update_agenda_item":
            return "Update an agenda item."
        case "delete_agenda_item":
            return "Delete an agenda item."
        case "reorder_agenda_items":
            return "Reorder agenda items."
        case "create_phase":
            return "Create a phase."
        case "update_phase":
            return "Update a phase."
        case "delete_phase":
            return "Delete a phase."
        case "create_milestone":
            return "Create a milestone."
        case "update_milestone":
            return "Update a milestone."
        case "delete_milestone":
            return "Delete a milestone."
        case _:
            return f"Run tool action: {tool_name}."


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

    user_id_raw: str | None = None
    try:
        parsed_user_id = UUID(user_id)
    except (ValueError, AttributeError):
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

    return {
        "status": "pending_approval",
        "proposal_id": str(created_proposal.id),
        "proposal_type": ProposalType.TOOL_ACTION.value,
        "description": description,
        "message": (
            "This tool action requires your approval. "
            "Please approve it to continue."
        ),
    }
