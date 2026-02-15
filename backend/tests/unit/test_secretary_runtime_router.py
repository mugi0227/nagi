from app.agents.runtime_router import (
    build_secretary_runtime_routing,
    select_runtime_profiles,
)


def test_select_runtime_profiles_for_browser_query() -> None:
    profiles = select_runtime_profiles("ブラウザで検索サイトにログインして自動操作して")
    assert profiles
    assert profiles[0] == "browser"


def test_build_routing_disables_browser_tools_by_default() -> None:
    routing = build_secretary_runtime_routing("ブラウザ操作を再利用できる形で保存したい")
    assert "browser" not in routing.profiles
    assert "run_browser_task" not in routing.tool_names
    assert "register_browser_work_memory" not in routing.tool_names


def test_build_routing_enables_browser_tools_when_allowed() -> None:
    routing = build_secretary_runtime_routing(
        "ブラウザ操作を再利用できる形で保存したい",
        allow_browser=True,
    )
    assert "browser" in routing.profiles
    assert "run_browser_task" in routing.tool_names
    assert "register_browser_work_memory" in routing.tool_names


def test_build_routing_can_force_browser_profile() -> None:
    routing = build_secretary_runtime_routing(
        "こんにちは",
        allow_browser=True,
        forced_profile="browser",
    )
    assert routing.profiles == ("browser",)
    assert "run_browser_task" in routing.tool_names


def test_build_routing_ignores_forced_browser_when_not_allowed() -> None:
    routing = build_secretary_runtime_routing(
        "こんにちは",
        allow_browser=False,
        forced_profile="browser",
    )
    assert routing.profiles == ("task",)
    assert "run_browser_task" not in routing.tool_names


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
    assert "update_task" not in routing.tool_names
    assert "create_project" not in routing.tool_names
    assert "ask_user_questions" in routing.tool_names
    assert len(routing.tool_names) <= 30


def test_agenda_add_intent_prefers_agenda_tools_over_task_update() -> None:
    routing = build_secretary_runtime_routing("会議タスクのアジェンダに議題を追加して")
    assert "add_agenda_item" in routing.tool_names
    assert "update_agenda_item" in routing.tool_names
    assert "update_task" not in routing.tool_names
    assert "ask_user_questions" in routing.tool_names


def test_ambiguous_followup_adds_broader_profiles() -> None:
    profiles = select_runtime_profiles("それで更新して")
    assert "task" in profiles
    assert "project" in profiles


def test_memory_query_uses_work_memory_tool_names() -> None:
    routing = build_secretary_runtime_routing("仕事メモリを保存して")
    assert "create_work_memory" in routing.tool_names
    assert "load_work_memory" in routing.tool_names
    assert "list_work_memory_index" in routing.tool_names
    assert "create_skill" not in routing.tool_names


def test_task_routing_includes_project_lookup_tools() -> None:
    routing = build_secretary_runtime_routing("新しいタスクを作って")
    assert "create_task" in routing.tool_names
    assert "list_projects" in routing.tool_names
    assert "load_project_context" in routing.tool_names


def test_task_followup_answers_keep_task_tools_and_avoid_project_mutation() -> None:
    message = (
        "プロジェクトに割り当ては難しいですか？ "
        "はい、これでいいです。 "
        "既存のタスクも同時にどれくらいですか？ 1時間程度 "
        "それぞれの期限を教えてください。 優先度中"
    )
    routing = build_secretary_runtime_routing(message)
    assert "create_task" in routing.tool_names
    assert "list_projects" in routing.tool_names
    assert "update_project" not in routing.tool_names


def test_explicit_project_update_keeps_project_mutation_tools() -> None:
    routing = build_secretary_runtime_routing("A社プロジェクトのゴールを更新して")
    assert "update_project" in routing.tool_names
