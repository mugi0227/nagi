from app.services.work_memory_service import (
    WorkMemoryContent,
    WorkMemoryIndexItem,
    format_loaded_work_memories_for_prompt,
    format_work_memory_index_for_prompt,
    select_relevant_work_memories,
)


def test_select_relevant_work_memories_prefers_matching_title_and_tags() -> None:
    work_memories = [
        WorkMemoryIndexItem(
            id="w1",
            title="請求書処理フロー",
            when_to_use="PDF請求書を受け取って処理するとき",
            tags=["請求書", "pdf"],
        ),
        WorkMemoryIndexItem(
            id="w2",
            title="議事録テンプレート",
            when_to_use="会議メモを整理するとき",
            tags=["meeting"],
        ),
    ]

    selected = select_relevant_work_memories(work_memories, "請求書のPDFを処理したい", limit=2)
    assert [item.id for item in selected] == ["w1"]


def test_format_work_memory_index_for_prompt_uses_new_tool_names() -> None:
    section = format_work_memory_index_for_prompt(
        [WorkMemoryIndexItem(id="w1", title="A", when_to_use="x", tags=[])],
        max_items=1,
    )
    assert "Work Memory Index" in section
    assert "`load_work_memory`" in section
    assert "`search_work_memory`" in section
    assert "`load_skill`" not in section


def test_format_loaded_work_memories_for_prompt_header() -> None:
    section = format_loaded_work_memories_for_prompt(
        [
            WorkMemoryContent(
                id="w1",
                title="Long memory",
                when_to_use="When context is long",
                content="x" * 500,
                tags=[],
            )
        ],
        max_chars_per_work_memory=80,
    )
    assert "Loaded Work Memories" in section
    assert "..." in section
