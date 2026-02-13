"""
Main Secretary Agent implementation using Google ADK.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from google.adk import Agent

from app.agents.prompts.secretary_core_prompt import SECRETARY_CORE_PROMPT
from app.agents.prompts.secretary_skill_prompts import format_profile_skill_prompts
from app.agents.runtime_router import build_secretary_runtime_routing
from app.core.logger import logger
from app.interfaces.agent_task_repository import IAgentTaskRepository
from app.interfaces.checkin_repository import ICheckinRepository
from app.interfaces.llm_provider import ILLMProvider
from app.interfaces.meeting_agenda_repository import IMeetingAgendaRepository
from app.interfaces.memory_repository import IMemoryRepository
from app.interfaces.milestone_repository import IMilestoneRepository
from app.interfaces.phase_repository import IPhaseRepository
from app.interfaces.project_invitation_repository import IProjectInvitationRepository
from app.interfaces.project_member_repository import IProjectMemberRepository
from app.interfaces.project_repository import IProjectRepository
from app.interfaces.proposal_repository import IProposalRepository
from app.interfaces.recurring_meeting_repository import IRecurringMeetingRepository
from app.interfaces.recurring_task_repository import IRecurringTaskRepository
from app.interfaces.task_assignment_repository import ITaskAssignmentRepository
from app.interfaces.task_repository import ITaskRepository
from app.interfaces.user_repository import IUserRepository
from app.services.skills_service import (
    format_loaded_skills_for_prompt,
    format_skills_index_for_prompt,
    get_skill_by_id,
    get_skills_index,
    select_relevant_skills,
)
from app.tools import (
    add_agenda_item_tool,
    add_to_memory_tool,
    apply_schedule_request_tool,
    ask_user_questions_tool,
    assign_task_tool,
    create_checkin_tool,
    create_meeting_tool,
    create_milestone_tool,
    create_phase_tool,
    create_project_summary_tool,
    create_project_tool,
    create_recurring_task_tool,
    create_skill_tool,
    create_task_tool,
    delete_agenda_item_tool,
    delete_milestone_tool,
    delete_phase_tool,
    delete_recurring_task_tool,
    delete_task_tool,
    fetch_meeting_context_tool,
    get_current_datetime_tool,
    get_phase_tool,
    get_task_tool,
    invite_project_member_tool,
    list_agenda_items_tool,
    list_checkins_tool,
    list_kpi_templates_tool,
    list_milestones_tool,
    list_phases_tool,
    list_project_assignments_tool,
    list_project_invitations_tool,
    list_project_members_tool,
    list_projects_tool,
    list_recurring_meetings_tool,
    list_recurring_tasks_tool,
    list_skills_index_tool,
    list_task_assignments_tool,
    list_tasks_tool,
    load_project_context_tool,
    load_skill_tool,
    refresh_user_profile_tool,
    register_browser_skill_tool,
    reorder_agenda_items_tool,
    run_browser_task_tool,
    run_hybrid_rpa_tool,
    schedule_agent_task_tool,
    search_memories_tool,
    search_similar_tasks_tool,
    search_skills_tool,
    search_work_memory_tool,
    update_agenda_item_tool,
    update_milestone_tool,
    update_phase_tool,
    update_project_tool,
    update_recurring_task_tool,
    update_task_tool,
)

_TOOL_HELP: dict[str, str] = {
    "get_current_datetime": "現在日時を取得",
    "ask_user_questions": "不足情報を質問",
    "create_task": "タスク作成",
    "update_task": "タスク更新",
    "delete_task": "タスク削除",
    "search_similar_tasks": "類似タスク検索",
    "list_tasks": "タスク一覧",
    "get_task": "タスク詳細",
    "assign_task": "担当割り当て",
    "list_task_assignments": "担当一覧",
    "list_project_assignments": "プロジェクト担当一覧",
    "create_project": "プロジェクト作成",
    "update_project": "プロジェクト更新",
    "list_projects": "プロジェクト一覧",
    "list_project_members": "メンバー一覧",
    "list_project_invitations": "招待一覧",
    "load_project_context": "プロジェクト文脈読込",
    "invite_project_member": "メンバー招待",
    "create_project_summary": "プロジェクト要約作成",
    "list_kpi_templates": "KPIテンプレート一覧",
    "list_phases": "フェーズ一覧",
    "get_phase": "フェーズ詳細",
    "create_phase": "フェーズ作成",
    "update_phase": "フェーズ更新",
    "delete_phase": "フェーズ削除",
    "list_milestones": "マイルストーン一覧",
    "create_milestone": "マイルストーン作成",
    "update_milestone": "マイルストーン更新",
    "delete_milestone": "マイルストーン削除",
    "add_agenda_item": "議題追加",
    "update_agenda_item": "議題更新",
    "delete_agenda_item": "議題削除",
    "list_agenda_items": "議題一覧",
    "reorder_agenda_items": "議題並び替え",
    "fetch_meeting_context": "会議文脈取得",
    "list_recurring_meetings": "定例会議一覧",
    "create_checkin": "チェックイン作成",
    "list_checkins": "チェックイン一覧",
    "create_recurring_task": "定期タスク作成",
    "list_recurring_tasks": "定期タスク一覧",
    "update_recurring_task": "定期タスク更新",
    "delete_recurring_task": "定期タスク削除",
    "search_memories": "メモ検索",
    "search_work_memory": "業務メモ検索",
    "search_skills": "スキル検索",
    "create_skill": "スキル作成",
    "load_skill": "スキル詳細読込",
    "list_skills_index": "スキル索引取得",
    "add_to_memory": "メモ保存",
    "refresh_user_profile": "プロフィール更新",
    "schedule_agent_task": "将来実行の予約",
    "apply_schedule_request": "日次予定の調整",
    "run_browser_task": "ブラウザ自動操作",
    "run_hybrid_rpa": "ハイブリッドRPA",
    "register_browser_skill": "ブラウザ操作をスキル化",
    "create_meeting": "会議タスク作成",
}

_TOOL_CATALOG_SECTIONS: dict[str, tuple[str, ...]] = {
    "Task": (
        "create_task",
        "update_task",
        "delete_task",
        "search_similar_tasks",
        "list_tasks",
        "get_task",
        "assign_task",
    ),
    "Project": (
        "create_project",
        "update_project",
        "list_projects",
        "list_project_members",
        "list_project_invitations",
        "load_project_context",
        "invite_project_member",
        "create_project_summary",
    ),
    "Phase": (
        "list_phases",
        "get_phase",
        "create_phase",
        "update_phase",
        "delete_phase",
        "list_milestones",
        "create_milestone",
        "update_milestone",
        "delete_milestone",
    ),
    "Meeting": (
        "add_agenda_item",
        "update_agenda_item",
        "delete_agenda_item",
        "list_agenda_items",
        "reorder_agenda_items",
        "fetch_meeting_context",
        "list_recurring_meetings",
        "create_checkin",
        "list_checkins",
    ),
    "Memory/Skill": (
        "search_memories",
        "search_work_memory",
        "search_skills",
        "create_skill",
        "load_skill",
        "list_skills_index",
        "add_to_memory",
        "refresh_user_profile",
    ),
    "Schedule": (
        "schedule_agent_task",
        "apply_schedule_request",
        "create_recurring_task",
        "list_recurring_tasks",
        "update_recurring_task",
        "delete_recurring_task",
    ),
    "Browser": (
        "run_browser_task",
        "run_hybrid_rpa",
        "register_browser_skill",
    ),
}


def get_current_datetime_section() -> str:
    jst = timezone(timedelta(hours=9))
    now = datetime.now(jst)
    weekday_names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    weekday = weekday_names[now.weekday()]
    return f"## Current DateTime\n{now.year:04d}-{now.month:02d}-{now.day:02d} {now.hour:02d}:{now.minute:02d} JST ({weekday})"


def _filter_tools_by_name(tools: list[Any], allowed_tool_names: frozenset[str]) -> list[Any]:
    filtered = [tool for tool in tools if getattr(tool, "name", "") in allowed_tool_names]
    if filtered:
        return filtered
    fallback_names = {"get_current_datetime", "ask_user_questions"}
    return [tool for tool in tools if getattr(tool, "name", "") in fallback_names]


def _format_tools_for_prompt(
    enabled_tool_names: list[str],
    include_catalog: bool,
) -> str:
    lines = ["## Enabled Tools (This Turn)"]
    for name in enabled_tool_names:
        desc = _TOOL_HELP.get(name, "利用可能")
        lines.append(f"- `{name}`: {desc}")

    if not include_catalog:
        return "\n".join(lines)

    lines.append("")
    lines.append("## Tool Catalog (All)")
    lines.append("質問が能力確認の場合は、この一覧をベースに回答する。")
    for section, names in _TOOL_CATALOG_SECTIONS.items():
        lines.append(f"- {section}: " + ", ".join(f"`{name}`" for name in names))
    return "\n".join(lines)


async def build_system_prompt_with_skills(
    user_id: str,
    memory_repo: IMemoryRepository,
    user_message: str | None,
    profiles: tuple[str, ...],
    enabled_tool_names: list[str],
    include_tool_catalog: bool,
) -> str:
    datetime_section = get_current_datetime_section()
    profile_skill_section = format_profile_skill_prompts(profiles)

    skills = await get_skills_index(user_id, memory_repo, limit=30)
    skills_index_section = format_skills_index_for_prompt(skills, max_items=8)

    selected = select_relevant_skills(skills, user_message or "", limit=2)
    loaded_skills = []
    for item in selected:
        full_skill = await get_skill_by_id(user_id, memory_repo, item.id)
        if full_skill:
            loaded_skills.append(full_skill)
    loaded_skills_section = format_loaded_skills_for_prompt(loaded_skills, max_chars_per_skill=600)
    tools_section = _format_tools_for_prompt(
        enabled_tool_names=enabled_tool_names,
        include_catalog=include_tool_catalog,
    )

    sections = [
        datetime_section,
        SECRETARY_CORE_PROMPT,
        tools_section,
        profile_skill_section,
        skills_index_section,
        loaded_skills_section,
    ]
    return "\n\n".join(section for section in sections if section)


async def create_secretary_agent(
    llm_provider: ILLMProvider,
    task_repo: ITaskRepository,
    project_repo: IProjectRepository,
    phase_repo: IPhaseRepository,
    milestone_repo: IMilestoneRepository,
    project_member_repo: IProjectMemberRepository,
    project_invitation_repo: IProjectInvitationRepository,
    task_assignment_repo: ITaskAssignmentRepository,
    memory_repo: IMemoryRepository,
    agent_task_repo: IAgentTaskRepository,
    meeting_agenda_repo: IMeetingAgendaRepository,
    recurring_meeting_repo: IRecurringMeetingRepository,
    recurring_task_repo: IRecurringTaskRepository,
    checkin_repo: ICheckinRepository,
    user_id: str,
    proposal_repo: IProposalRepository,
    session_id: str,
    auto_approve: bool = True,
    user_repo: IUserRepository | None = None,
    user_message: str | None = None,
) -> Agent:
    routing = build_secretary_runtime_routing(user_message)
    model = llm_provider.get_model()

    task_creation_tool = create_task_tool(
        task_repo,
        project_repo,
        project_member_repo,
        user_id,
        proposal_repo=proposal_repo,
        session_id=session_id,
        auto_approve=auto_approve,
        assignment_repo=task_assignment_repo,
    )
    task_assignment_tool = assign_task_tool(
        task_assignment_repo,
        task_repo,
        project_repo,
        project_member_repo,
        user_id,
        proposal_repo=proposal_repo,
        session_id=session_id,
        auto_approve=auto_approve,
    )
    project_creation_tool = create_project_tool(
        project_repo,
        project_member_repo,
        llm_provider,
        user_id,
        proposal_repo=proposal_repo,
        session_id=session_id,
        auto_approve=auto_approve,
    )
    skill_creation_tool = create_skill_tool(
        memory_repo,
        user_id,
        proposal_repo=proposal_repo,
        session_id=session_id,
        auto_approve=auto_approve,
    )

    all_tools = [
        get_current_datetime_tool(),
        task_creation_tool,
        task_assignment_tool,
        create_meeting_tool(
            task_repo,
            proposal_repo,
            project_repo,
            project_member_repo,
            user_id,
            session_id,
            auto_approve=auto_approve,
        ),
        list_kpi_templates_tool(),
        project_creation_tool,
        skill_creation_tool,
        list_projects_tool(project_repo, user_id),
        list_project_members_tool(project_repo, project_member_repo, user_id),
        list_project_invitations_tool(project_repo, project_member_repo, project_invitation_repo, user_id),
        load_project_context_tool(project_repo, project_member_repo, user_id),
        create_project_summary_tool(
            project_repo,
            task_repo,
            memory_repo,
            llm_provider,
            project_member_repo,
            user_id,
            proposal_repo=proposal_repo,
            session_id=session_id,
            auto_approve=auto_approve,
        ),
        update_project_tool(
            project_repo,
            project_member_repo,
            user_id,
            proposal_repo=proposal_repo,
            session_id=session_id,
            auto_approve=auto_approve,
        ),
        invite_project_member_tool(
            project_invitation_repo,
            project_member_repo,
            project_repo,
            user_id,
            proposal_repo=proposal_repo,
            session_id=session_id,
            auto_approve=auto_approve,
        ),
        update_task_tool(
            task_repo,
            project_repo,
            project_member_repo,
            user_id,
            proposal_repo=proposal_repo,
            session_id=session_id,
            auto_approve=auto_approve,
        ),
        delete_task_tool(
            task_repo,
            project_repo,
            project_member_repo,
            user_id,
            proposal_repo=proposal_repo,
            session_id=session_id,
            auto_approve=auto_approve,
        ),
        search_similar_tasks_tool(task_repo, project_repo, project_member_repo, user_id),
        list_tasks_tool(task_repo, project_repo, project_member_repo, user_id),
        get_task_tool(task_repo, project_repo, project_member_repo, user_id),
        list_task_assignments_tool(
            task_assignment_repo,
            task_repo,
            project_repo,
            project_member_repo,
            user_id,
        ),
        list_project_assignments_tool(
            task_assignment_repo,
            project_repo,
            project_member_repo,
            user_id,
        ),
        search_memories_tool(memory_repo, user_id),
        search_skills_tool(memory_repo, user_id),
        search_work_memory_tool(memory_repo, user_id),
        add_to_memory_tool(
            memory_repo,
            user_id,
            proposal_repo=proposal_repo,
            session_id=session_id,
            auto_approve=auto_approve,
        ),
        refresh_user_profile_tool(
            memory_repo,
            llm_provider,
            user_id,
            proposal_repo=proposal_repo,
            session_id=session_id,
            auto_approve=auto_approve,
        ),
        schedule_agent_task_tool(
            agent_task_repo,
            user_id,
            proposal_repo=proposal_repo,
            session_id=session_id,
            auto_approve=auto_approve,
        ),
        apply_schedule_request_tool(
            task_repo,
            task_assignment_repo,
            project_repo,
            user_id,
            proposal_repo=proposal_repo,
            session_id=session_id,
            auto_approve=auto_approve,
            user_repo=user_repo,
        ),
        list_phases_tool(phase_repo, project_repo, project_member_repo, user_id),
        get_phase_tool(phase_repo, project_repo, project_member_repo, user_id),
        update_phase_tool(
            phase_repo,
            project_repo,
            project_member_repo,
            user_id,
            proposal_repo=proposal_repo,
            session_id=session_id,
            auto_approve=auto_approve,
        ),
        create_phase_tool(
            phase_repo,
            project_repo,
            project_member_repo,
            user_id,
            proposal_repo=proposal_repo,
            session_id=session_id,
            auto_approve=auto_approve,
        ),
        delete_phase_tool(
            phase_repo,
            project_repo,
            project_member_repo,
            user_id,
            proposal_repo=proposal_repo,
            session_id=session_id,
            auto_approve=auto_approve,
        ),
        create_milestone_tool(
            milestone_repo,
            project_repo,
            project_member_repo,
            user_id,
            proposal_repo=proposal_repo,
            session_id=session_id,
            auto_approve=auto_approve,
        ),
        update_milestone_tool(
            milestone_repo,
            project_repo,
            project_member_repo,
            user_id,
            proposal_repo=proposal_repo,
            session_id=session_id,
            auto_approve=auto_approve,
        ),
        delete_milestone_tool(
            milestone_repo,
            project_repo,
            project_member_repo,
            user_id,
            proposal_repo=proposal_repo,
            session_id=session_id,
            auto_approve=auto_approve,
        ),
        list_milestones_tool(
            milestone_repo,
            phase_repo,
            project_repo,
            project_member_repo,
            user_id,
        ),
        add_agenda_item_tool(
            meeting_agenda_repo,
            project_repo,
            project_member_repo,
            recurring_meeting_repo,
            task_repo,
            user_id,
            proposal_repo=proposal_repo,
            session_id=session_id,
            auto_approve=auto_approve,
        ),
        update_agenda_item_tool(
            meeting_agenda_repo,
            project_repo,
            project_member_repo,
            recurring_meeting_repo,
            task_repo,
            user_id,
            proposal_repo=proposal_repo,
            session_id=session_id,
            auto_approve=auto_approve,
        ),
        delete_agenda_item_tool(
            meeting_agenda_repo,
            project_repo,
            project_member_repo,
            recurring_meeting_repo,
            task_repo,
            user_id,
            proposal_repo=proposal_repo,
            session_id=session_id,
            auto_approve=auto_approve,
        ),
        list_agenda_items_tool(
            meeting_agenda_repo,
            project_repo,
            project_member_repo,
            recurring_meeting_repo,
            task_repo,
            user_id,
        ),
        reorder_agenda_items_tool(
            meeting_agenda_repo,
            project_repo,
            project_member_repo,
            recurring_meeting_repo,
            task_repo,
            user_id,
            proposal_repo=proposal_repo,
            session_id=session_id,
            auto_approve=auto_approve,
        ),
        fetch_meeting_context_tool(
            checkin_repo,
            task_repo,
            meeting_agenda_repo,
            project_repo,
            recurring_meeting_repo,
            project_member_repo,
            user_id,
            user_repo=user_repo,
        ),
        list_recurring_meetings_tool(recurring_meeting_repo, project_repo, project_member_repo, user_id),
        create_checkin_tool(
            checkin_repo,
            project_repo,
            project_member_repo,
            user_id,
            proposal_repo=proposal_repo,
            session_id=session_id,
            auto_approve=auto_approve,
        ),
        list_checkins_tool(
            checkin_repo,
            project_repo,
            project_member_repo,
            user_id,
        ),
        create_recurring_task_tool(recurring_task_repo, task_repo, user_id),
        list_recurring_tasks_tool(recurring_task_repo, user_id),
        update_recurring_task_tool(recurring_task_repo, user_id),
        delete_recurring_task_tool(recurring_task_repo, user_id),
        load_skill_tool(memory_repo, user_id),
        list_skills_index_tool(memory_repo, user_id),
        run_browser_task_tool(),
        run_hybrid_rpa_tool(),
        register_browser_skill_tool(),
        ask_user_questions_tool(),
    ]

    tools = _filter_tools_by_name(all_tools, routing.tool_names)
    enabled_tool_names = [getattr(tool, "name", "") for tool in tools if getattr(tool, "name", "")]
    system_prompt = await build_system_prompt_with_skills(
        user_id=user_id,
        memory_repo=memory_repo,
        user_message=user_message,
        profiles=routing.profiles,
        enabled_tool_names=enabled_tool_names,
        include_tool_catalog="capability" in routing.profiles,
    )
    logger.info(
        "secretary_runtime profiles=%s tools=%s",
        ",".join(routing.profiles),
        ",".join(getattr(tool, "name", "") for tool in tools),
    )

    return Agent(
        name="secretary",
        model=model,
        instruction=system_prompt,
        tools=tools,
    )
