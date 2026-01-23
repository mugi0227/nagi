"""
Shared helpers for tool approval flows.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from app.interfaces.proposal_repository import IProposalRepository
from app.models.proposal import Proposal, ProposalResponse, ProposalType


async def create_tool_action_proposal(
    user_id: str,
    session_id: str,
    proposal_repo: IProposalRepository,
    tool_name: str,
    args: dict[str, Any],
    description: str = "",
) -> dict:
    if not description:
        description = f'Approve tool execution: "{tool_name}".'

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

    return ProposalResponse(
        proposal_id=str(created_proposal.id),
        proposal_type=ProposalType.TOOL_ACTION,
        description=description,
        payload=payload,
    ).model_dump(mode="json")
