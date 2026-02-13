from app.agents.runtime_router import (
    build_secretary_runtime_routing,
    select_runtime_profiles,
)


def test_select_runtime_profiles_for_browser_query() -> None:
    profiles = select_runtime_profiles("ブラウザで請求書サイトにログインして自動入力して")
    assert profiles
    assert profiles[0] == "browser"


def test_select_runtime_profiles_defaults_to_task() -> None:
    profiles = select_runtime_profiles("こんにちは")
    assert profiles == ("task",)


def test_select_runtime_profiles_for_capability_query() -> None:
    profiles = select_runtime_profiles("あなたが使えるツールは何？")
    assert profiles == ("capability",)


def test_capability_query_with_action_keeps_task_routing() -> None:
    profiles = select_runtime_profiles("使えるツールを教えて、ついでにタスクを作成して")
    assert profiles != ("capability",)
    assert "task" in profiles


def test_build_secretary_runtime_routing_limits_tools_by_intent() -> None:
    routing = build_secretary_runtime_routing("会議のアジェンダを更新して")
    assert "add_agenda_item" in routing.tool_names
    assert "create_project" not in routing.tool_names
    assert "ask_user_questions" in routing.tool_names
    assert len(routing.tool_names) <= 30


def test_ambiguous_followup_adds_broader_profiles() -> None:
    profiles = select_runtime_profiles("それで更新して")
    assert "task" in profiles
    assert "project" in profiles
