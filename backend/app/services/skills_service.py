"""
Compatibility layer for legacy skills naming.

Canonical implementation lives in app.services.work_memory_service.
"""

from __future__ import annotations

from typing import Optional

from app.interfaces.memory_repository import IMemoryRepository
from app.models.memory import Memory
from app.services.work_memory_service import (
    WorkMemoryContent,
    WorkMemoryIndexItem,
    format_loaded_work_memories_for_prompt,
    format_work_memory_index_for_prompt,
    get_work_memory_by_id,
    get_work_memory_index,
    parse_work_memory,
    parse_work_memory_full,
    score_work_memory_relevance,
    select_relevant_work_memories,
)
from app.services.work_memory_service import (
    _extract_content_section as _extract_work_memory_content_section,
)
from app.services.work_memory_service import (
    _extract_when_to_use as _extract_work_memory_when_to_use,
)

SkillIndexItem = WorkMemoryIndexItem
SkillContent = WorkMemoryContent


def parse_skill(memory: Memory) -> SkillIndexItem:
    return parse_work_memory(memory)


def parse_skill_full(memory: Memory) -> SkillContent:
    return parse_work_memory_full(memory)


async def get_skills_index(
    user_id: str,
    memory_repo: IMemoryRepository,
    limit: int = 100,
) -> list[SkillIndexItem]:
    return await get_work_memory_index(user_id, memory_repo, limit=limit)


async def get_skill_by_id(
    user_id: str,
    memory_repo: IMemoryRepository,
    skill_id: str,
) -> Optional[SkillContent]:
    return await get_work_memory_by_id(user_id, memory_repo, skill_id)


def score_skill_relevance(skill: SkillIndexItem, query: str) -> float:
    return score_work_memory_relevance(skill, query)


def select_relevant_skills(
    skills: list[SkillIndexItem],
    query: str,
    limit: int = 2,
) -> list[SkillIndexItem]:
    return select_relevant_work_memories(skills, query, limit=limit)


def format_skills_index_for_prompt(
    skills: list[SkillIndexItem],
    max_items: int = 12,
    max_when_chars: int = 60,
) -> str:
    section = format_work_memory_index_for_prompt(
        skills,
        max_items=max_items,
        max_when_chars=max_when_chars,
    )
    if not section:
        return ""
    return (
        section.replace("## Work Memory Index", "## Skills Index")
        .replace("`load_work_memory`", "`load_skill`")
        .replace("`search_work_memory`", "`search_skills`")
    )


def format_loaded_skills_for_prompt(
    skills: list[SkillContent],
    max_chars_per_skill: int = 700,
) -> str:
    section = format_loaded_work_memories_for_prompt(
        skills,
        max_chars_per_work_memory=max_chars_per_skill,
    )
    if not section:
        return ""
    return section.replace("## Loaded Work Memories", "## Loaded Skills")


def _extract_when_to_use(content: str) -> str:
    return _extract_work_memory_when_to_use(content)


def _extract_content_section(content: str) -> str:
    return _extract_work_memory_content_section(content)
