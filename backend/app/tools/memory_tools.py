"""
Memory-related agent tools.

Tools for searching and adding memories (user facts, work procedures, etc.).
"""

from __future__ import annotations

from typing import Optional
from uuid import UUID

from google.adk.tools import FunctionTool
from pydantic import BaseModel, Field

from app.interfaces.llm_provider import ILLMProvider
from app.interfaces.memory_repository import IMemoryRepository
from app.interfaces.proposal_repository import IProposalRepository
from app.models.enums import MemoryScope, MemoryType
from app.models.memory import MemoryCreate, MemoryUpdate
from app.models.proposal import Proposal, ProposalResponse, ProposalType
from app.services.llm_utils import generate_text
from app.services.skills_service import get_skill_by_id, get_skills_index
from app.tools.approval_tools import create_tool_action_proposal


# ===========================================
# Tool Input Models
# ===========================================


class SearchWorkMemoryInput(BaseModel):
    """Input for search_work_memory tool."""

    query: str = Field(..., description="検索クエリ（手順やルールを探す）")
    limit: int = Field(3, ge=1, le=10, description="最大結果数")


class SearchMemoriesInput(BaseModel):
    """Input for search_memories tool."""

    query: str = Field(..., description="検索クエリ")
    scope: Optional[MemoryScope] = Field(
        None,
        description="記憶スコープ（USER/PROJECT/WORK）",
    )
    memory_type: Optional[MemoryType] = Field(
        None,
        description="記憶タイプ（FACT/PREFERENCE/PATTERN/RULE）",
    )
    project_id: Optional[str] = Field(None, description="プロジェクトID（PROJECT scopeの場合）")
    limit: int = Field(5, ge=1, le=20, description="最大結果数")


class AddToMemoryInput(BaseModel):
    """Input for add_to_memory tool."""

    content: str = Field(..., description="記憶する内容（ユーザーの名前、好み、事実など）")
    scope: MemoryScope = Field(
        MemoryScope.USER,
        description="記憶スコープ: USER(ユーザー個人), PROJECT(プロジェクト), WORK(仕事手順)"
    )
    memory_type: MemoryType = Field(
        MemoryType.FACT,
        description="記憶タイプ: FACT(事実), PREFERENCE(好み), PATTERN(傾向), RULE(ルール)"
    )
    project_id: Optional[str] = Field(None, description="プロジェクトID（PROJECT scopeの場合）")
    tags: list[str] = Field(default_factory=list, description="検索用タグ")


class CreateSkillInput(BaseModel):
    """Input for propose_skill tool."""

    content: str = Field(..., description="スキル内容（Markdown）")
    scope: MemoryScope = Field(
        MemoryScope.WORK,
        description="記憶スコープ (WORK固定)",
    )
    memory_type: MemoryType = Field(
        MemoryType.RULE,
        description="記憶タイプ (RULE固定)",
    )
    tags: list[str] = Field(default_factory=list, description="検索用タグ")


class RefreshUserProfileInput(BaseModel):
    """Input for refresh_user_profile tool."""

    limit: int = Field(50, ge=1, le=200, description="参照するメモリ数")


class LoadSkillInput(BaseModel):
    """Input for load_skill tool."""

    skill_id: str = Field(..., description="スキルID（UUID形式）")


class ListSkillsIndexInput(BaseModel):
    """Input for list_skills_index tool."""

    pass


# ===========================================
# Tool Functions
# ===========================================


async def search_work_memory(
    user_id: str,
    repo: IMemoryRepository,
    input_data: SearchWorkMemoryInput,
) -> dict:
    """
    Search work memories (procedures, rules).

    Args:
        user_id: User ID
        repo: Memory repository
        input_data: Search parameters

    Returns:
        List of work memories with relevance scores
    """
    results = await repo.search_work_memory(
        user_id,
        query=input_data.query,
        limit=input_data.limit,
    )

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
    """
    Search memories by content.

    Args:
        user_id: User ID
        repo: Memory repository
        input_data: Search parameters

    Returns:
        List of memories with relevance scores
    """
    project_id = UUID(input_data.project_id) if input_data.project_id else None
    results = await repo.search(
        user_id,
        query=input_data.query,
        scope=input_data.scope,
        project_id=project_id,
        limit=input_data.limit,
    )

    if input_data.memory_type:
        results = [
            result for result in results
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
    """
    Add a new memory (user fact, preference, work procedure, etc.).

    Args:
        user_id: User ID
        repo: Memory repository
        input_data: Memory data

    Returns:
        Created memory as dict
    """
    project_id = UUID(input_data.project_id) if input_data.project_id else None

    memory_data = MemoryCreate(
        content=input_data.content,
        scope=input_data.scope,
        memory_type=input_data.memory_type,
        project_id=project_id,
        tags=input_data.tags,
        source="agent",
    )

    memory = await repo.create(user_id, memory_data)
    return memory.model_dump(mode="json")  # Serialize UUIDs to strings


async def propose_skill(
    user_id: str,
    session_id: str,
    proposal_repo: IProposalRepository,
    memory_repo: IMemoryRepository,
    input_data: CreateSkillInput,
    description: str = "",
    auto_approve: bool = False,
) -> dict:
    """
    Propose a skill for user approval, or auto-approve if configured.

    Args:
        user_id: User ID
        session_id: Chat session ID
        proposal_repo: Proposal repository
        memory_repo: Memory repository (for auto-approval)
        input_data: Skill data
        description: AI-generated description
        auto_approve: If True, create immediately
    """
    from uuid import UUID

    if not description:
        description = "作業手順のスキルを登録します。"

    if auto_approve:
        memory = await memory_repo.create(
            user_id,
            MemoryCreate(
                content=input_data.content,
                scope=input_data.scope,
                memory_type=input_data.memory_type,
                tags=input_data.tags,
                source="agent",
            ),
        )
        return {
            "auto_approved": True,
            "memory_id": str(memory.id),
            "description": description,
        }

    user_id_raw = None
    try:
        parsed_user_id = UUID(user_id)
    except (ValueError, AttributeError):
        import hashlib

        user_id_raw = user_id
        parsed_user_id = UUID(bytes=hashlib.md5(user_id.encode()).digest())

    proposal = Proposal(
        user_id=parsed_user_id,
        user_id_raw=user_id_raw,
        session_id=session_id,
        proposal_type=ProposalType.CREATE_SKILL,
        payload={
            "content": input_data.content,
            "tags": input_data.tags,
            "scope": input_data.scope.value,
            "memory_type": input_data.memory_type.value,
        },
        description=description,
    )

    created_proposal = await proposal_repo.create(proposal)

    # Return pending_approval status to signal AI to wait for user approval
    return {
        "status": "pending_approval",
        "proposal_id": str(created_proposal.id),
        "proposal_type": ProposalType.CREATE_SKILL.value,
        "description": description,
        "message": "ユーザーの承諾待ちです。承諾されるまで「完了しました」とは言わないでください。",
    }


async def load_skill(
    user_id: str,
    repo: IMemoryRepository,
    input_data: LoadSkillInput,
) -> dict:
    """
    Load full skill content by ID.

    Args:
        user_id: User ID
        repo: Memory repository
        input_data: Skill ID

    Returns:
        Full skill content (title, when_to_use, content, tags)
    """
    skill = await get_skill_by_id(user_id, repo, input_data.skill_id)
    if not skill:
        return {"error": f"Skill not found: {input_data.skill_id}"}
    return skill.model_dump()


async def list_skills_index(
    user_id: str,
    repo: IMemoryRepository,
) -> dict:
    """
    List all skills with compact index (title + when_to_use).

    Args:
        user_id: User ID
        repo: Memory repository

    Returns:
        List of skills with id, title, when_to_use, tags
    """
    skills = await get_skills_index(user_id, repo)
    return {
        "skills": [skill.model_dump() for skill in skills],
        "count": len(skills),
    }


async def refresh_user_profile(
    user_id: str,
    repo: IMemoryRepository,
    llm_provider: ILLMProvider,
    input_data: RefreshUserProfileInput,
) -> dict:
    """
    Refresh user profile summary from user memories.

    Args:
        user_id: User ID
        repo: Memory repository
        llm_provider: LLM provider
        input_data: Parameters

    Returns:
        Updated profile memory (or created one)
    """
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
            tags=tags,
            source="agent",
        ),
    )
    return {"updated": True, "memory": created.model_dump(mode="json")}

# ===========================================
# ADK Tool Definitions
# ===========================================


def search_work_memory_tool(repo: IMemoryRepository, user_id: str) -> FunctionTool:
    """Create ADK tool for searching work memories."""
    async def _tool(input_data: dict) -> dict:
        """search_work_memory: 仕事の手順やルール（WorkMemory）を検索します。

        Parameters:
            query (str): 検索クエリ（手順やルールを探す文字列、必須）
            limit (int, optional): 最大結果数（1〜10、デフォルト: 3）

        Returns:
            dict: 検索結果 (memories: リスト, count: 件数)
        """
        return await search_work_memory(user_id, repo, SearchWorkMemoryInput(**input_data))

    _tool.__name__ = "search_work_memory"
    return FunctionTool(func=_tool)


def search_memories_tool(repo: IMemoryRepository, user_id: str) -> FunctionTool:
    """Create ADK tool for searching memories."""
    async def _tool(input_data: dict) -> dict:
        """search_memories: 記憶（User/Project/Work）を検索します。

        Parameters:
            query (str): 検索クエリ（必須）
            scope (str, optional): 記憶スコープ（USER/PROJECT/WORK）
            memory_type (str, optional): 記憶タイプ（FACT/PREFERENCE/PATTERN/RULE）
            project_id (str, optional): プロジェクトID（PROJECT scopeの場合に指定）
            limit (int, optional): 最大結果数（デフォルト: 5）

        Returns:
            dict: 検索結果 (memories: リスト, count: 件数)
        """
        return await search_memories(user_id, repo, SearchMemoriesInput(**input_data))

    _tool.__name__ = "search_memories"
    return FunctionTool(func=_tool)


def search_skills_tool(repo: IMemoryRepository, user_id: str) -> FunctionTool:
    """Create ADK tool for searching Skills (WorkMemory)."""
    async def _tool(input_data: dict) -> dict:
        """search_skills: 作業スキル（手順・ルール）を検索します。

        Parameters:
            query (str): 検索クエリ（必須）
            limit (int, optional): 最大結果数（デフォルト: 3）

        Returns:
            dict: 検索結果 (memories: リスト, count: 件数)
        """
        return await search_work_memory(user_id, repo, SearchWorkMemoryInput(**input_data))

    _tool.__name__ = "search_skills"
    return FunctionTool(func=_tool)


def add_to_memory_tool(
    repo: IMemoryRepository,
    user_id: str,
    proposal_repo: Optional[IProposalRepository] = None,
    session_id: Optional[str] = None,
    auto_approve: bool = True,
) -> FunctionTool:
    """Create ADK tool for adding memories."""
    async def _tool(input_data: dict) -> dict:
        """add_to_memory: 記憶（User/Project/Work）を追加します。

        Parameters:
            content (str): 記憶する内容（ユーザーの名前、好み、事実など、必須）
            scope (str, optional): 記憶スコープ (USER/PROJECT/WORK)、デフォルト: USER
            memory_type (str, optional): 記憶タイプ (FACT/PREFERENCE/PATTERN/RULE)、デフォルト: FACT
            project_id (str, optional): プロジェクトID（PROJECT scopeの場合に指定）
            tags (list[str], optional): 検索用タグのリスト

        Returns:
            dict: 作成された記憶情報
        """
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


def propose_skill_tool(
    proposal_repo: IProposalRepository,
    memory_repo: IMemoryRepository,
    user_id: str,
    session_id: str,
    auto_approve: bool = False,
) -> FunctionTool:
    """Create ADK tool for proposing/creating skills."""
    async def _tool(input_data: dict) -> dict:
        """propose_skill: スキル（作業手順）を提案して登録します。

        Parameters:
            content (str): スキル内容（Markdown、必須）
            tags (list[str], optional): 検索用タグ
            proposal_description (str, optional): 提案理由

        Returns:
            dict: メモリIDまたは提案ID
        """
        proposal_desc = input_data.pop("proposal_description", "")
        return await propose_skill(
            user_id,
            session_id,
            proposal_repo,
            memory_repo,
            CreateSkillInput(**input_data),
            proposal_desc,
            auto_approve,
        )

    _tool.__name__ = "propose_skill"
    return FunctionTool(func=_tool)


def create_skill_tool(
    memory_repo: IMemoryRepository,
    user_id: str,
    proposal_repo: Optional[IProposalRepository] = None,
    session_id: Optional[str] = None,
    auto_approve: bool = True,
) -> FunctionTool:
    """Create ADK tool for creating skills."""
    async def _tool(input_data: dict) -> dict:
        """create_skill: スキルを登録します、E
        Parameters:
            content (str): スキル内容 (Markdown)
            tags (list[str], optional): 検索用タグ
            proposal_description (str, optional): 承諾用の説明
        Returns:
            dict: 作成されたメモリ情報 or proposal payload
        """
        payload = dict(input_data)
        proposal_desc = payload.pop("proposal_description", "")
        if proposal_repo and session_id and not auto_approve:
            return await propose_skill(
                user_id,
                session_id,
                proposal_repo,
                memory_repo,
                CreateSkillInput(**payload),
                proposal_desc,
                False,
            )

        skill = CreateSkillInput(**payload)
        memory = await memory_repo.create(
            user_id,
            MemoryCreate(
                content=skill.content,
                scope=skill.scope,
                memory_type=skill.memory_type,
                tags=skill.tags,
                source="agent",
            ),
        )
        return memory.model_dump(mode="json")

    _tool.__name__ = "create_skill"
    return FunctionTool(func=_tool)


def load_skill_tool(repo: IMemoryRepository, user_id: str) -> FunctionTool:
    """Create ADK tool for loading full skill content."""
    async def _tool(input_data: dict) -> dict:
        """load_skill: スキルの詳細内容を読み込みます。

        Parameters:
            skill_id (str): スキルID（UUID形式、必須）

        Returns:
            dict: スキル詳細 (title, when_to_use, content, tags)
        """
        return await load_skill(user_id, repo, LoadSkillInput(**input_data))

    _tool.__name__ = "load_skill"
    return FunctionTool(func=_tool)


def list_skills_index_tool(repo: IMemoryRepository, user_id: str) -> FunctionTool:
    """Create ADK tool for listing skills index."""
    async def _tool(input_data: dict) -> dict:
        """list_skills_index: 登録されているスキル一覧（タイトルと用途）を取得します。

        Parameters:
            (none)

        Returns:
            dict: スキル一覧 (skills: list, count: int)
        """
        return await list_skills_index(user_id, repo)

    _tool.__name__ = "list_skills_index"
    return FunctionTool(func=_tool)


def refresh_user_profile_tool(
    repo: IMemoryRepository,
    llm_provider: ILLMProvider,
    user_id: str,
    proposal_repo: Optional[IProposalRepository] = None,
    session_id: Optional[str] = None,
    auto_approve: bool = True,
) -> FunctionTool:
    """Create ADK tool for refreshing user profile summary."""

    async def _tool(input_data: dict) -> dict:
        """refresh_user_profile: UserMemoryからプロフィールサマリを更新します。

        Parameters:
            limit (int, optional): 参照するメモリ数（デフォルト: 50）

        Returns:
            dict: 更新結果とプロフィールメモリ
        """
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

