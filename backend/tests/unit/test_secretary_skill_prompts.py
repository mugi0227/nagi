import re

from app.agents.prompts.secretary_prompt import SECRETARY_SYSTEM_PROMPT
from app.agents.prompts.secretary_skill_prompts import (
    PROFILE_SKILL_PROMPTS,
    format_profile_skill_prompts,
)
from app.agents.secretary_agent import _TOOL_HELP


def test_task_skill_prompt_contains_project_resolution_and_project_update_guard() -> None:
    section = format_profile_skill_prompts(("task",))
    assert "`list_projects`" in section
    assert "`create_task`" in section
    assert "`update_project`" in section
    assert "タスク依頼を `update_project`" in section


def test_task_skill_prompt_requires_subtask_guide_on_breakdown() -> None:
    section = format_profile_skill_prompts(("task",))
    assert "サブタスク分解の依頼では" in section
    assert "`description` と `guide` を必ず設定" in section
    assert "## 進め方ガイド" in section
    assert "**完了の目安**" in section


def test_meeting_skill_prompt_forbids_agenda_update_via_update_task_and_requires_confirmation_tool() -> None:
    section = format_profile_skill_prompts(("meeting",))
    assert "議題の追加・更新・削除・並び替えに `update_task` を使わない" in section
    assert "`ask_user_questions` を使う" in section
    assert 'options: ["はい", "いいえ"]' in section


def test_legacy_prompt_tool_guidance_is_migrated_to_skill_prompts() -> None:
    legacy_tokens = set(re.findall(r"`([a-z_]+)`", SECRETARY_SYSTEM_PROMPT))
    legacy_tool_names = {name for name in legacy_tokens if name in _TOOL_HELP}

    all_profiles = tuple(PROFILE_SKILL_PROMPTS.keys())
    migrated = format_profile_skill_prompts(all_profiles)
    missing = sorted(name for name in legacy_tool_names if f"`{name}`" not in migrated)

    assert not missing, f"Missing migrated tool guidance for: {missing}"
