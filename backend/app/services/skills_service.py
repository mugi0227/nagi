"""
Skills service for managing WorkMemory-based skills.

Skills are stored as WorkMemory (scope=WORK, memory_type=RULE).
This service provides:
- Parsing skill content to extract title and when_to_use
- Generating a compact skills index for the system prompt
- Loading full skill content
"""

from __future__ import annotations

import re
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field

from app.interfaces.memory_repository import IMemoryRepository
from app.models.enums import MemoryScope, MemoryType
from app.models.memory import Memory


class SkillIndexItem(BaseModel):
    """Compact skill info for system prompt index."""

    id: str = Field(..., description="Skill (Memory) ID")
    title: str = Field(..., description="Skill title")
    when_to_use: str = Field(..., description="When to use this skill")
    tags: list[str] = Field(default_factory=list, description="Tags for searching")


class SkillContent(BaseModel):
    """Full skill content."""

    id: str
    title: str
    when_to_use: str
    content: str
    tags: list[str] = Field(default_factory=list)


def parse_skill(memory: Memory) -> SkillIndexItem:
    """
    Parse a WorkMemory to extract title and when_to_use.

    Expected format:
    ```markdown
    # <Title>

    ## いつ使うか
    <when to use description>

    ## 内容
    <full content>
    ```

    Or simpler format:
    ```markdown
    # <Title>
    <first paragraph = when_to_use>

    <rest = content>
    ```

    Args:
        memory: WorkMemory instance

    Returns:
        SkillIndexItem with title and when_to_use
    """
    content = memory.content.strip()

    # Try structured format first
    title = _extract_title(content)
    when_to_use = _extract_when_to_use(content)

    # Fallback: use first line as title, second paragraph as when_to_use
    if not title:
        lines = content.split("\n")
        title = lines[0].lstrip("#").strip() if lines else "Untitled Skill"

    if not when_to_use:
        # Use first non-title paragraph as when_to_use
        when_to_use = _extract_first_paragraph(content)

    # Truncate when_to_use if too long
    if len(when_to_use) > 200:
        when_to_use = when_to_use[:197] + "..."

    return SkillIndexItem(
        id=str(memory.id),
        title=title,
        when_to_use=when_to_use,
        tags=memory.tags,
    )


def parse_skill_full(memory: Memory) -> SkillContent:
    """
    Parse a WorkMemory to get full skill content.

    Args:
        memory: WorkMemory instance

    Returns:
        SkillContent with all details
    """
    content = memory.content.strip()
    title = _extract_title(content)
    when_to_use = _extract_when_to_use(content)
    full_content = _extract_content_section(content)

    if not title:
        lines = content.split("\n")
        title = lines[0].lstrip("#").strip() if lines else "Untitled Skill"

    if not when_to_use:
        when_to_use = _extract_first_paragraph(content)

    if not full_content:
        full_content = content

    return SkillContent(
        id=str(memory.id),
        title=title,
        when_to_use=when_to_use,
        content=full_content,
        tags=memory.tags,
    )


def _extract_title(content: str) -> str:
    """Extract title from # heading."""
    match = re.search(r"^#\s+(.+)$", content, re.MULTILINE)
    if match:
        return match.group(1).strip()
    return ""


def _extract_when_to_use(content: str) -> str:
    """Extract when_to_use section from ## いつ使うか."""
    # Match ## いつ使うか or ## When to use
    pattern = r"##\s+(?:いつ使うか|When to use)\s*\n(.*?)(?=\n##|\Z)"
    match = re.search(pattern, content, re.IGNORECASE | re.DOTALL)
    if match:
        return match.group(1).strip()
    return ""


def _extract_content_section(content: str) -> str:
    """Extract content section from ## 内容 or ## Content."""
    pattern = r"##\s+(?:内容|Content)\s*\n(.*?)(?=\n##|\Z)"
    match = re.search(pattern, content, re.IGNORECASE | re.DOTALL)
    if match:
        return match.group(1).strip()
    return ""


def _extract_first_paragraph(content: str) -> str:
    """Extract first non-heading paragraph as fallback when_to_use."""
    lines = content.split("\n")
    paragraphs = []
    current = []

    for line in lines:
        # Skip headings
        if line.startswith("#"):
            if current:
                paragraphs.append("\n".join(current))
                current = []
            continue

        if line.strip():
            current.append(line)
        elif current:
            paragraphs.append("\n".join(current))
            current = []

    if current:
        paragraphs.append("\n".join(current))

    # Return first paragraph that isn't empty
    for para in paragraphs:
        if para.strip():
            return para.strip()

    return "スキルの説明がありません"


async def get_skills_index(
    user_id: str,
    memory_repo: IMemoryRepository,
) -> list[SkillIndexItem]:
    """
    Get compact skills index from all WorkMemories.

    Args:
        user_id: User ID
        memory_repo: Memory repository

    Returns:
        List of SkillIndexItem (title + when_to_use)
    """
    # Fetch all WorkMemories (scope=WORK, memory_type=RULE)
    memories = await memory_repo.list(
        user_id,
        scope=MemoryScope.WORK,
        memory_type=MemoryType.RULE,
        limit=100,
    )

    return [parse_skill(memory) for memory in memories]


async def get_skill_by_id(
    user_id: str,
    memory_repo: IMemoryRepository,
    skill_id: str,
) -> Optional[SkillContent]:
    """
    Get full skill content by ID.

    Args:
        user_id: User ID
        memory_repo: Memory repository
        skill_id: Skill (Memory) ID

    Returns:
        SkillContent if found, None otherwise
    """
    try:
        memory = await memory_repo.get(user_id, UUID(skill_id))
        if memory and memory.scope == MemoryScope.WORK:
            return parse_skill_full(memory)
    except (ValueError, TypeError):
        pass
    return None


def format_skills_index_for_prompt(skills: list[SkillIndexItem]) -> str:
    """
    Format skills index for inclusion in system prompt.

    Args:
        skills: List of SkillIndexItem

    Returns:
        Formatted markdown string
    """
    if not skills:
        return ""

    lines = ["## 利用可能なスキル一覧", ""]
    lines.append("以下のスキルが登録されています。必要なときに`load_skill`で詳細を読み込んでください。")
    lines.append("")

    for skill in skills:
        tags_str = f" [{', '.join(skill.tags)}]" if skill.tags else ""
        lines.append(f"- **{skill.title}** (ID: `{skill.id}`){tags_str}")
        lines.append(f"  - いつ使うか: {skill.when_to_use}")

    return "\n".join(lines)
