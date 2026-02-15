from __future__ import annotations

from dataclasses import dataclass

RuntimeProfile = str

_PROFILE_KEYWORDS: dict[RuntimeProfile, tuple[str, ...]] = {
    "capability": (
        "tool",
        "tools",
        "capability",
        "capabilities",
        "function",
        "functions",
        "使える",
        "できること",
        "何ができる",
        "ツール",
        "機能",
    ),
    "browser": (
        "browser",
        "web",
        "rpa",
        "スクレイピング",
        "ブラウザ",
        "サイト",
        "自動操作",
        "フォーム",
        "ログイン",
    ),
    "meeting": (
        "meeting",
        "agenda",
        "checkin",
        "会議",
        "ミーティング",
        "アジェンダ",
        "議事録",
        "チェックイン",
        "定例",
    ),
    "project": (
        "project",
        "kpi",
        "member",
        "invite",
        "プロジェクト",
        "メンバー",
        "招待",
    ),
    "phase": (
        "phase",
        "milestone",
        "フェーズ",
        "マイルストーン",
    ),
    "schedule": (
        "schedule",
        "calendar",
        "reschedule",
        "postpone",
        "スケジュール",
        "予定",
        "日程",
        "延期",
        "時間",
    ),
    "memory": (
        "memory",
        "remember",
        "profile",
        "memo",
        "skill",
        "メモ",
        "記録",
        "覚えて",
        "プロフィール",
        "スキル",
        "仕事メモリ",
        "ルール",
    ),
    "recurring": (
        "recurring",
        "routine",
        "repeat",
        "繰り返し",
        "定期",
        "毎日",
        "毎週",
    ),
    "task": (
        "task",
        "todo",
        "subtask",
        "deadline",
        "estimate",
        "priority",
        "タスク",
        "todo",
        "やること",
        "締切",
        "期限",
        "見積",
        "見積もり",
        "工数",
        "来週",
        "来週中",
        "担当",
    ),
}

_PROFILE_PRIORITY: tuple[RuntimeProfile, ...] = (
    "capability",
    "browser",
    "meeting",
    "project",
    "phase",
    "schedule",
    "memory",
    "recurring",
    "task",
)

_ALWAYS_ON_TOOL_NAMES = frozenset(
    {
        "get_current_datetime",
        "ask_user_questions",
    }
)

_PROJECT_MUTATION_TOOL_NAMES = frozenset(
    {
        "create_project",
        "update_project",
        "invite_project_member",
        "create_project_summary",
    }
)

_PROFILE_TOOL_NAMES: dict[RuntimeProfile, frozenset[str]] = {
    "capability": frozenset(
        {
            "get_current_datetime",
            "list_tasks",
            "get_task",
            "list_task_assignments",
            "list_project_assignments",
            "list_projects",
            "list_project_members",
            "list_project_invitations",
            "load_project_context",
            "list_phases",
            "get_phase",
            "list_milestones",
            "list_agenda_items",
            "list_recurring_meetings",
            "list_recurring_tasks",
            "list_checkins",
            "search_memories",
            "search_work_memory",
            "load_work_memory",
            "list_work_memory_index",
            "ask_user_questions",
        }
    ),
    "task": frozenset(
        {
            "create_task",
            "update_task",
            "delete_task",
            "search_similar_tasks",
            "list_tasks",
            "get_task",
            "assign_task",
            "list_task_assignments",
            "list_projects",
            "load_project_context",
        }
    ),
    "project": frozenset(
        {
            "create_project",
            "update_project",
            "list_projects",
            "list_project_members",
            "list_project_invitations",
            "load_project_context",
            "invite_project_member",
            "create_project_summary",
        }
    ),
    "phase": frozenset(
        {
            "list_phases",
            "get_phase",
            "update_phase",
            "create_phase",
            "delete_phase",
            "list_milestones",
            "create_milestone",
            "update_milestone",
            "delete_milestone",
        }
    ),
    "meeting": frozenset(
        {
            "add_agenda_item",
            "update_agenda_item",
            "delete_agenda_item",
            "list_agenda_items",
            "reorder_agenda_items",
            "fetch_meeting_context",
            "create_checkin",
            "list_checkins",
        }
    ),
    "schedule": frozenset(
        {
            "schedule_agent_task",
            "apply_schedule_request",
            "list_tasks",
            "get_task",
            "list_task_assignments",
            "list_projects",
        }
    ),
    "memory": frozenset(
        {
            "search_memories",
            "search_work_memory",
            "add_to_memory",
            "refresh_user_profile",
            "create_work_memory",
            "load_work_memory",
            "list_work_memory_index",
        }
    ),
    "recurring": frozenset(
        {
            "create_recurring_task",
            "list_recurring_tasks",
            "update_recurring_task",
            "delete_recurring_task",
        }
    ),
    "browser": frozenset(
        {
            "run_browser_task",
            "run_hybrid_rpa",
            "register_browser_work_memory",
            "search_work_memory",
            "load_work_memory",
        }
    ),
}


@dataclass(frozen=True)
class SecretaryRuntimeRouting:
    profiles: tuple[RuntimeProfile, ...]
    tool_names: frozenset[str]

    @property
    def signature(self) -> str:
        return ",".join(self.profiles)


def _normalize_text(text: str | None) -> str:
    return (text or "").strip().lower()


def _is_capability_query(text: str) -> bool:
    hints = (
        "使えるツール",
        "使える機能",
        "何ができる",
        "できること",
        "tool",
        "tools",
        "capability",
        "capabilities",
    )
    has_hint = any(hint in text for hint in hints)
    if not has_hint:
        return False
    action_hints = (
        "作成して",
        "更新して",
        "削除して",
        "追加して",
        "実行して",
        "やって",
    )
    has_action = any(hint in text for hint in action_hints)
    return not has_action


def _is_ambiguous_followup(text: str) -> bool:
    referential_hints = ("それ", "これ", "さっき", "続き", "同じ", "前の")
    action_hints = ("更新", "修正", "作成", "追加", "削除", "実行", "お願い", "して")
    return any(h in text for h in referential_hints) and any(h in text for h in action_hints)


def _score_profiles(text: str) -> dict[RuntimeProfile, int]:
    scores: dict[RuntimeProfile, int] = {profile: 0 for profile in _PROFILE_KEYWORDS}
    for profile, keywords in _PROFILE_KEYWORDS.items():
        for keyword in keywords:
            if keyword in text:
                scores[profile] += 1
    return scores


def _has_explicit_project_management_intent(text: str) -> bool:
    project_hints = ("project", "プロジェクト")
    management_hints = (
        "create_project",
        "update_project",
        "create",
        "作成",
        "新規",
        "更新",
        "修正",
        "変更",
        "招待",
        "invite",
        "member",
        "メンバー",
        "goal",
        "goals",
        "ゴール",
        "kpi",
        "context",
        "readme",
        "key_points",
        "summary",
        "要約",
    )
    return any(hint in text for hint in project_hints) and any(
        hint in text for hint in management_hints
    )


def _is_agenda_operation_intent(text: str) -> bool:
    agenda_hints = ("agenda", "アジェンダ", "議題")
    operation_hints = ("add", "update", "delete", "reorder", "追加", "更新", "削除", "並び替え")
    return any(hint in text for hint in agenda_hints) and any(
        hint in text for hint in operation_hints
    )


def select_runtime_profiles(text: str | None) -> tuple[RuntimeProfile, ...]:
    normalized = _normalize_text(text)
    if not normalized:
        return ("task",)
    if _is_capability_query(normalized):
        return ("capability",)

    scores = _score_profiles(normalized)
    ranked = sorted(
        scores.items(),
        key=lambda item: (-item[1], _PROFILE_PRIORITY.index(item[0])),
    )
    top_profile, top_score = ranked[0]
    if top_score <= 0:
        if _is_ambiguous_followup(normalized):
            return ("task", "project", "meeting")
        return ("task",)

    selected: list[RuntimeProfile] = [top_profile]
    for profile, score in ranked[1:]:
        if score <= 0:
            break
        if len(selected) >= 2:
            break
        if score >= top_score - 1:
            selected.append(profile)

    if "project" in selected and "phase" not in selected:
        if any(token in normalized for token in ("phase", "milestone", "フェーズ", "マイルストーン")):
            if len(selected) < 2:
                selected.append("phase")

    return tuple(selected)


def resolve_tool_names_for_profiles(
    profiles: tuple[RuntimeProfile, ...],
    text: str | None = None,
) -> frozenset[str]:
    names = set(_ALWAYS_ON_TOOL_NAMES)
    for profile in profiles:
        names.update(_PROFILE_TOOL_NAMES.get(profile, frozenset()))

    normalized = _normalize_text(text)
    if "task" in profiles and not _has_explicit_project_management_intent(normalized):
        names.difference_update(_PROJECT_MUTATION_TOOL_NAMES)
    if "meeting" in profiles and _is_agenda_operation_intent(normalized):
        names.discard("update_task")

    return frozenset(names)


def build_secretary_runtime_routing(
    text: str | None,
    *,
    allow_browser: bool = False,
    forced_profile: RuntimeProfile | None = None,
) -> SecretaryRuntimeRouting:
    normalized_forced = str(forced_profile or "").strip().lower()
    if normalized_forced in _PROFILE_TOOL_NAMES and (
        normalized_forced != "browser" or allow_browser
    ):
        profiles: tuple[RuntimeProfile, ...] = (normalized_forced,)
    else:
        selected = list(select_runtime_profiles(text))
        if not allow_browser:
            selected = [profile for profile in selected if profile != "browser"]
            if not selected:
                normalized = _normalize_text(text)
                if _is_ambiguous_followup(normalized):
                    selected = ["task", "project", "meeting"]
                else:
                    selected = ["task"]
        profiles = tuple(selected)

    tool_names = resolve_tool_names_for_profiles(profiles, text=text)
    return SecretaryRuntimeRouting(
        profiles=profiles,
        tool_names=tool_names,
    )
