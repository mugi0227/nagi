from app.services.skills_service import (
    SkillContent,
    SkillIndexItem,
    _extract_content_section,
    _extract_when_to_use,
    format_loaded_skills_for_prompt,
    format_skills_index_for_prompt,
    select_relevant_skills,
)


def test_select_relevant_skills_prefers_matching_title_and_tags() -> None:
    skills = [
        SkillIndexItem(
            id="s1",
            title="請求書処理フロー",
            when_to_use="PDF請求書を受け取って処理するとき",
            tags=["請求書", "pdf"],
        ),
        SkillIndexItem(
            id="s2",
            title="議事録テンプレート",
            when_to_use="会議メモを整理するとき",
            tags=["meeting"],
        ),
        SkillIndexItem(
            id="s3",
            title="日次ふりかえり",
            when_to_use="毎日の終わりに進捗を振り返る",
            tags=["daily"],
        ),
    ]

    selected = select_relevant_skills(skills, "請求書のPDFを処理したい", limit=2)
    assert [item.id for item in selected] == ["s1"]


def test_format_skills_index_for_prompt_is_compact() -> None:
    skills = [
        SkillIndexItem(id="s1", title="A", when_to_use="x", tags=[]),
        SkillIndexItem(id="s2", title="B", when_to_use="y", tags=[]),
    ]
    section = format_skills_index_for_prompt(skills, max_items=1)
    assert "Skills Index" in section
    assert "and 1 more" in section


def test_format_loaded_skills_for_prompt_truncates_long_content() -> None:
    section = format_loaded_skills_for_prompt(
        [
            SkillContent(
                id="s1",
                title="Long skill",
                when_to_use="When context is long",
                content="x" * 500,
                tags=[],
            )
        ],
        max_chars_per_skill=80,
    )
    assert "Loaded Skills" in section
    assert "..." in section


def test_extract_sections_supports_japanese_headings() -> None:
    text = "## 使うとき\n請求書処理のとき\n\n## 内容\n1. 開く\n2. 確認する"
    assert _extract_when_to_use(text) == "請求書処理のとき"
    assert _extract_content_section(text) == "1. 開く\n2. 確認する"
