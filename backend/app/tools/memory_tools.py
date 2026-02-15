"""
Memory-related agent tools.

Tools for searching and adding memories (user facts, work procedures, etc.).
"""

from __future__ import annotations

import hashlib
from typing import Optional
from uuid import UUID

from google.adk.tools import FunctionTool
from pydantic import AliasChoices, BaseModel, Field

from app.interfaces.llm_provider import ILLMProvider
from app.interfaces.memory_repository import IMemoryRepository
from app.interfaces.proposal_repository import IProposalRepository
from app.models.enums import MemoryScope, MemoryType
from app.models.memory import MemoryCreate, MemorySearchResult, MemoryUpdate
from app.models.proposal import Proposal, ProposalType
from app.services.llm_utils import generate_text
from app.services.work_memory_service import (
    get_work_memory_by_id,
    get_work_memory_index,
)
from app.tools.approval_tools import create_tool_action_proposal


class SearchWorkMemoryInput(BaseModel):
    query: str = Field(..., description="Search query")
    limit: int = Field(3, ge=1, le=10, description="Max results")


class SearchMemoriesInput(BaseModel):
    query: str = Field(..., description="Search query")
    scope: Optional[MemoryScope] = Field(None, description="Memory scope")
    memory_type: Optional[MemoryType] = Field(None, description="Memory type")
    project_id: Optional[str] = Field(None, description="Project ID for PROJECT scope")
    limit: int = Field(5, ge=1, le=20, description="Max results")


class AddToMemoryInput(BaseModel):
    content: str = Field(..., description="Memory content")
    scope: MemoryScope = Field(MemoryScope.USER, description="Memory scope")
    memory_type: MemoryType = Field(MemoryType.FACT, description="Memory type")
    project_id: Optional[str] = Field(None, description="Project ID for PROJECT scope")
    tags: list[str] = Field(default_factory=list, description="Tags")


class CreateWorkMemoryInput(BaseModel):
    content: str = Field(..., description="Work-memory content in Markdown")
    scope: MemoryScope = Field(MemoryScope.WORK, description="Memory scope")
    memory_type: MemoryType = Field(MemoryType.RULE, description="Memory type")
    tags: list[str] = Field(default_factory=list, description="Tags")


class RefreshUserProfileInput(BaseModel):
    limit: int = Field(50, ge=1, le=200, description="How many memories to summarize")


class LoadWorkMemoryInput(BaseModel):
    work_memory_id: str = Field(
        ...,
        validation_alias=AliasChoices("work_memory_id", "memory_id", "id"),
        description="Work-memory ID (UUID)",
    )


class ListWorkMemoryIndexInput(BaseModel):
    pass


def _resolve_proposal_user_id(user_id: str) -> tuple[UUID, Optional[str]]:
    try:
        return UUID(user_id), None
    except (ValueError, TypeError, AttributeError):
        return UUID(bytes=hashlib.md5(user_id.encode()).digest()), user_id


async def search_work_memory(
    user_id: str,
    repo: IMemoryRepository,
    input_data: SearchWorkMemoryInput,
) -> dict:
    raw_results = await repo.search_work_memory(
        user_id,
        query=input_data.query,
        limit=input_data.limit,
    )
    results: list[MemorySearchResult] = list(raw_results or [])
    return {
        "memories": [
            {
                "memory": result.memory.model_dump(mode="json"),
                "relevance_score": result.relevance_score,
            }
            for result in results
        ],
        "count": len(results),
    }


async def search_memories(
    user_id: str,
    repo: IMemoryRepository,
    input_data: SearchMemoriesInput,
) -> dict:
    project_id = UUID(input_data.project_id) if input_data.project_id else None
    raw_results = await repo.search(
        user_id,
        query=input_data.query,
        scope=input_data.scope,
        project_id=project_id,
        limit=input_data.limit,
    )
    results: list[MemorySearchResult] = list(raw_results or [])
    if input_data.memory_type:
        results = [
            result
            for result in results
            if result.memory.memory_type == input_data.memory_type
        ]
    return {
        "memories": [
            {
                "memory": result.memory.model_dump(mode="json"),
                "relevance_score": result.relevance_score,
            }
            for result in results
        ],
        "count": len(results),
    }


async def add_to_memory(
    user_id: str,
    repo: IMemoryRepository,
    input_data: AddToMemoryInput,
) -> dict:
    project_id = UUID(input_data.project_id) if input_data.project_id else None
    memory = await repo.create(
        user_id,
        MemoryCreate(
            content=input_data.content,
            scope=input_data.scope,
            memory_type=input_data.memory_type,
            project_id=project_id,
            tags=input_data.tags,
            source="agent",
        ),
    )
    return memory.model_dump(mode="json")


async def propose_work_memory(
    user_id: str,
    session_id: str,
    proposal_repo: IProposalRepository,
    memory_repo: IMemoryRepository,
    input_data: CreateWorkMemoryInput,
    description: str = "",
    auto_approve: bool = False,
) -> dict:
    proposal_description = description or "Create this work memory."

    if auto_approve:
        memory = await memory_repo.create(
            user_id,
            MemoryCreate(
                content=input_data.content,
                scope=input_data.scope,
                memory_type=input_data.memory_type,
                project_id=None,
                tags=input_data.tags,
                source="agent",
            ),
        )
        return {
            "auto_approved": True,
            "memory_id": str(memory.id),
            "description": proposal_description,
        }

    proposal_user_id, user_id_raw = _resolve_proposal_user_id(user_id)
    proposal = Proposal(
        user_id=proposal_user_id,
        user_id_raw=user_id_raw,
        session_id=session_id,
        proposal_type=ProposalType.CREATE_WORK_MEMORY,
        payload={
            "content": input_data.content,
            "tags": input_data.tags,
            "scope": input_data.scope.value,
            "memory_type": input_data.memory_type.value,
        },
        description=proposal_description,
    )
    created_proposal = await proposal_repo.create(proposal)
    return {
        "status": "pending_approval",
        "proposal_id": str(created_proposal.id),
        "proposal_type": ProposalType.CREATE_WORK_MEMORY.value,
        "description": proposal_description,
        "message": "Waiting for user approval.",
    }


async def load_work_memory(
    user_id: str,
    repo: IMemoryRepository,
    work_memory_id: str,
) -> dict:
    work_memory = await get_work_memory_by_id(user_id, repo, work_memory_id)
    if not work_memory:
        return {"error": f"Work memory not found: {work_memory_id}"}
    return work_memory.model_dump()


async def list_work_memory_index(
    user_id: str,
    repo: IMemoryRepository,
) -> dict:
    work_memories = await get_work_memory_index(user_id, repo)
    return {
        "work_memories": [memory.model_dump() for memory in work_memories],
        "count": len(work_memories),
    }


async def refresh_user_profile(
    user_id: str,
    repo: IMemoryRepository,
    llm_provider: ILLMProvider,
    input_data: RefreshUserProfileInput,
) -> dict:
    memories = await repo.list(
        user_id,
        scope=MemoryScope.USER,
        limit=input_data.limit,
    )
    if not memories:
        return {"updated": False, "reason": "no_user_memories"}

    base_memories = [memory for memory in memories if "profile" not in memory.tags]
    if not base_memories:
        return {"updated": False, "reason": "no_base_memories"}

    prompt_lines = [
        "Summarize the user's traits, preferences, and behavior patterns.",
        "Keep it short, bullet points only.",
        "",
    ]
    for memory in base_memories[: input_data.limit]:
        prompt_lines.append(f"- {memory.content}")
    prompt = "\n".join(prompt_lines)

    summary_text = generate_text(
        llm_provider,
        prompt,
        temperature=0.2,
        max_output_tokens=400,
    )
    if not summary_text:
        summary_text = "\n".join([f"- {memory.content}" for memory in base_memories[:10]])

    tags = ["profile", "snapshot", "version:v1"]
    existing_profile = next(
        (memory for memory in memories if "profile" in memory.tags),
        None,
    )
    if existing_profile:
        updated = await repo.update(
            user_id,
            existing_profile.id,
            MemoryUpdate(content=summary_text, tags=tags),
        )
        return {"updated": True, "memory": updated.model_dump(mode="json")}

    created = await repo.create(
        user_id,
            MemoryCreate(
                content=summary_text,
                scope=MemoryScope.USER,
                memory_type=MemoryType.PATTERN,
                project_id=None,
                tags=tags,
                source="agent",
            ),
    )
    return {"updated": True, "memory": created.model_dump(mode="json")}


def search_work_memory_tool(repo: IMemoryRepository, user_id: str) -> FunctionTool:
    async def _tool(input_data: dict) -> dict:
        return await search_work_memory(user_id, repo, SearchWorkMemoryInput(**input_data))

    _tool.__name__ = "search_work_memory"
    return FunctionTool(func=_tool)


def search_memories_tool(repo: IMemoryRepository, user_id: str) -> FunctionTool:
    async def _tool(input_data: dict) -> dict:
        return await search_memories(user_id, repo, SearchMemoriesInput(**input_data))

    _tool.__name__ = "search_memories"
    return FunctionTool(func=_tool)


def add_to_memory_tool(
    repo: IMemoryRepository,
    user_id: str,
    proposal_repo: Optional[IProposalRepository] = None,
    session_id: Optional[str] = None,
    auto_approve: bool = True,
) -> FunctionTool:
    async def _tool(input_data: dict) -> dict:
        payload = dict(input_data)
        proposal_desc = payload.pop("proposal_description", "")
        if proposal_repo and session_id and not auto_approve:
            return await create_tool_action_proposal(
                user_id,
                session_id,
                proposal_repo,
                "add_to_memory",
                payload,
                proposal_desc,
            )
        return await add_to_memory(user_id, repo, AddToMemoryInput(**payload))

    _tool.__name__ = "add_to_memory"
    return FunctionTool(func=_tool)


def propose_work_memory_tool(
    proposal_repo: IProposalRepository,
    memory_repo: IMemoryRepository,
    user_id: str,
    session_id: str,
    auto_approve: bool = False,
) -> FunctionTool:
    async def _tool(input_data: dict) -> dict:
        payload = dict(input_data)
        proposal_desc = payload.pop("proposal_description", "")
        return await propose_work_memory(
            user_id=user_id,
            session_id=session_id,
            proposal_repo=proposal_repo,
            memory_repo=memory_repo,
            input_data=CreateWorkMemoryInput(**payload),
            description=proposal_desc,
            auto_approve=auto_approve,
        )

    _tool.__name__ = "propose_work_memory"
    return FunctionTool(func=_tool)


def create_work_memory_tool(
    memory_repo: IMemoryRepository,
    user_id: str,
    proposal_repo: Optional[IProposalRepository] = None,
    session_id: Optional[str] = None,
    auto_approve: bool = True,
) -> FunctionTool:
    async def _tool(input_data: dict) -> dict:
        payload = dict(input_data)
        proposal_desc = payload.pop("proposal_description", "")
        if proposal_repo and session_id and not auto_approve:
            return await propose_work_memory(
                user_id=user_id,
                session_id=session_id,
                proposal_repo=proposal_repo,
                memory_repo=memory_repo,
                input_data=CreateWorkMemoryInput(**payload),
                description=proposal_desc,
                auto_approve=False,
            )

        work_memory = CreateWorkMemoryInput(**payload)
        memory = await memory_repo.create(
            user_id,
            MemoryCreate(
                content=work_memory.content,
                scope=work_memory.scope,
                memory_type=work_memory.memory_type,
                project_id=None,
                tags=work_memory.tags,
                source="agent",
            ),
        )
        return memory.model_dump(mode="json")

    _tool.__name__ = "create_work_memory"
    return FunctionTool(func=_tool)


def load_work_memory_tool(repo: IMemoryRepository, user_id: str) -> FunctionTool:
    async def _tool(input_data: dict) -> dict:
        parsed = LoadWorkMemoryInput(**input_data)
        return await load_work_memory(user_id, repo, parsed.work_memory_id)

    _tool.__name__ = "load_work_memory"
    return FunctionTool(func=_tool)


def list_work_memory_index_tool(repo: IMemoryRepository, user_id: str) -> FunctionTool:
    async def _tool(input_data: dict) -> dict:
        _ = ListWorkMemoryIndexInput(**input_data)
        return await list_work_memory_index(user_id, repo)

    _tool.__name__ = "list_work_memory_index"
    return FunctionTool(func=_tool)


def refresh_user_profile_tool(
    repo: IMemoryRepository,
    llm_provider: ILLMProvider,
    user_id: str,
    proposal_repo: Optional[IProposalRepository] = None,
    session_id: Optional[str] = None,
    auto_approve: bool = True,
) -> FunctionTool:
    async def _tool(input_data: dict) -> dict:
        payload = dict(input_data)
        proposal_desc = payload.pop("proposal_description", "")
        if proposal_repo and session_id and not auto_approve:
            return await create_tool_action_proposal(
                user_id,
                session_id,
                proposal_repo,
                "refresh_user_profile",
                payload,
                proposal_desc,
            )
        return await refresh_user_profile(
            user_id,
            repo,
            llm_provider,
            RefreshUserProfileInput(**payload),
        )

    _tool.__name__ = "refresh_user_profile"
    return FunctionTool(func=_tool)
