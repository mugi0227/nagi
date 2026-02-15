"""
Work-memory service for managing WORK/RULE memories.

Work memories are stored as Memory(scope=WORK, memory_type=RULE).
This service provides:
- Parsing memory content to extract title and when_to_use
- Generating a compact work-memory index for system prompts
- Loading full work-memory content
- Selecting relevant work memories for dynamic prompt injection
"""

from __future__ import annotations

import re
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field

from app.interfaces.memory_repository import IMemoryRepository
from app.models.enums import MemoryScope, MemoryType
from app.models.memory import Memory

_RELEVANCE_TOKEN_PATTERN = re.compile(
    r"[a-z0-9]+|[\u3041-\u3093\u30a1-\u30f3\u4e00-\u9fff]{2,}",
    re.IGNORECASE,
)


class WorkMemoryIndexItem(BaseModel):
    """Compact work-memory info for prompt index."""

    id: str = Field(..., description="Work memory ID")
    title: str = Field(..., description="Work memory title")
    when_to_use: str = Field(..., description="When to use this work memory")
    tags: list[str] = Field(default_factory=list, description="Tags for searching")


class WorkMemoryContent(BaseModel):
    """Full work-memory content."""

    id: str
    title: str
    when_to_use: str
    content: str
    tags: list[str] = Field(default_factory=list)


def parse_work_memory(memory: Memory) -> WorkMemoryIndexItem:
    """
    Parse a WORK/RULE memory to extract title and when_to_use.

    Expected format:
    ```markdown
    # <Title>

    ## When to use
    <when to use description>

    ## Content
    <full content>
    ```

    Or simpler format:
    ```markdown
    # <Title>
    <first paragraph = when_to_use>

    <rest = content>
    ```
    """
    content = (memory.content or "").strip()

    title = _extract_title(content)
    when_to_use = _extract_when_to_use(content)

    if not title:
        lines = content.split("\n")
        title = lines[0].lstrip("#").strip() if lines else "Untitled Work Memory"

    if not when_to_use:
        when_to_use = _extract_first_paragraph(content)

    if len(when_to_use) > 200:
        when_to_use = when_to_use[:197] + "..."

    return WorkMemoryIndexItem(
        id=str(memory.id),
        title=title,
        when_to_use=when_to_use,
        tags=memory.tags,
    )


def parse_work_memory_full(memory: Memory) -> WorkMemoryContent:
    """Parse a WORK/RULE memory to get full work-memory content."""
    content = (memory.content or "").strip()
    title = _extract_title(content)
    when_to_use = _extract_when_to_use(content)
    full_content = _extract_content_section(content)

    if not title:
        lines = content.split("\n")
        title = lines[0].lstrip("#").strip() if lines else "Untitled Work Memory"

    if not when_to_use:
        when_to_use = _extract_first_paragraph(content)

    if not full_content:
        full_content = content

    return WorkMemoryContent(
        id=str(memory.id),
        title=title,
        when_to_use=when_to_use,
        content=full_content,
        tags=memory.tags,
    )


def _extract_title(content: str) -> str:
    match = re.search(r"^#\s+(.+)$", content, re.MULTILINE)
    if match:
        return match.group(1).strip()
    return ""


def _extract_when_to_use(content: str) -> str:
    pattern = r"##\s+(?:When to use|\u4f7f\u3046\u3068\u304d|\u4f7f\u3044\u3069\u3053\u308d|\u7528\u9014)\s*\n(.*?)(?=\n##|\Z)"
    match = re.search(pattern, content, re.IGNORECASE | re.DOTALL)
    if match:
        return match.group(1).strip()
    return ""


def _extract_content_section(content: str) -> str:
    pattern = r"##\s+(?:Content|\u5185\u5bb9|\u624b\u9806|\u5b9f\u65bd\u624b\u9806)\s*\n(.*?)(?=\n##|\Z)"
    match = re.search(pattern, content, re.IGNORECASE | re.DOTALL)
    if match:
        return match.group(1).strip()
    return ""


def _extract_first_paragraph(content: str) -> str:
    lines = content.split("\n")
    paragraphs: list[str] = []
    current: list[str] = []

    for line in lines:
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

    for paragraph in paragraphs:
        if paragraph.strip():
            return paragraph.strip()

    return "No description"


async def get_work_memory_index(
    user_id: str,
    memory_repo: IMemoryRepository,
    limit: int = 100,
) -> list[WorkMemoryIndexItem]:
    """Get compact work-memory index from WORK/RULE memories."""
    memories = await memory_repo.list(
        user_id,
        scope=MemoryScope.WORK,
        memory_type=MemoryType.RULE,
        limit=limit,
    )
    return [parse_work_memory(memory) for memory in memories]


async def get_work_memory_by_id(
    user_id: str,
    memory_repo: IMemoryRepository,
    work_memory_id: str,
) -> Optional[WorkMemoryContent]:
    """Get full work-memory content by ID."""
    try:
        memory = await memory_repo.get(user_id, UUID(work_memory_id))
        if memory and memory.scope == MemoryScope.WORK:
            return parse_work_memory_full(memory)
    except (ValueError, TypeError):
        return None
    return None


def _truncate_text(text: str, max_chars: int) -> str:
    normalized = " ".join((text or "").split())
    if len(normalized) <= max_chars:
        return normalized
    return normalized[: max_chars - 3].rstrip() + "..."


def _tokenize_for_relevance(text: str) -> set[str]:
    return {token.lower() for token in _RELEVANCE_TOKEN_PATTERN.findall(text)}


def score_work_memory_relevance(work_memory: WorkMemoryIndexItem, query: str) -> float:
    normalized_query = (query or "").strip().lower()
    if not normalized_query:
        return 0.0

    haystack = " ".join(
        [work_memory.title, work_memory.when_to_use, " ".join(work_memory.tags)]
    ).lower()
    query_tokens = _tokenize_for_relevance(normalized_query)
    memory_tokens = _tokenize_for_relevance(haystack)

    overlap_score = float(len(query_tokens.intersection(memory_tokens)))
    score = overlap_score

    title = work_memory.title.lower()
    if title and title in normalized_query:
        score += 2.0

    for tag in work_memory.tags:
        normalized_tag = tag.strip().lower()
        if normalized_tag and normalized_tag in normalized_query:
            score += 1.5

    for token in query_tokens:
        if len(token) >= 3 and token in haystack:
            score += 0.2

    return score


def select_relevant_work_memories(
    work_memories: list[WorkMemoryIndexItem],
    query: str,
    limit: int = 2,
) -> list[WorkMemoryIndexItem]:
    if not work_memories or limit <= 0:
        return []

    ranked: list[tuple[float, int, WorkMemoryIndexItem]] = []
    for index, work_memory in enumerate(work_memories):
        ranked.append((score_work_memory_relevance(work_memory, query), index, work_memory))

    ranked.sort(key=lambda item: (-item[0], item[1]))
    return [item for score, _, item in ranked if score > 0][:limit]


def format_work_memory_index_for_prompt(
    work_memories: list[WorkMemoryIndexItem],
    max_items: int = 12,
    max_when_chars: int = 60,
) -> str:
    """Format compact work-memory index for prompt."""
    if not work_memories:
        return ""

    shown = work_memories[:max_items]
    lines = [
        "## Work Memory Index",
        "- Start from usage summaries, then load only necessary entries with `load_work_memory`.",
        "- If you cannot find a fit, use `search_work_memory` with concise keywords.",
    ]
    for work_memory in shown:
        summary = _truncate_text(work_memory.when_to_use, max_when_chars)
        lines.append(f"- `{work_memory.id}` {work_memory.title}: {summary}")
    if len(work_memories) > max_items:
        lines.append(f"- ...and {len(work_memories) - max_items} more")
    return "\n".join(lines)


def format_loaded_work_memories_for_prompt(
    work_memories: list[WorkMemoryContent],
    max_chars_per_work_memory: int = 700,
) -> str:
    """Format loaded full work memories for prompt injection."""
    if not work_memories:
        return ""

    sections = ["## Loaded Work Memories"]
    for work_memory in work_memories:
        sections.append(f"### {work_memory.title} (`{work_memory.id}`)")
        sections.append(f"When to use: {_truncate_text(work_memory.when_to_use, 120)}")
        sections.append(_truncate_text(work_memory.content, max_chars_per_work_memory))
    return "\n\n".join(sections)
