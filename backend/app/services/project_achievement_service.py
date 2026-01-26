"""
Project Achievement generation service.

Generates AI-powered team achievement summaries from completed tasks.
"""

from __future__ import annotations

import json
from collections import defaultdict
from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4

from app.core.logger import logger
from app.interfaces.llm_provider import ILLMProvider
from app.interfaces.notification_repository import INotificationRepository
from app.interfaces.project_achievement_repository import IProjectAchievementRepository
from app.interfaces.project_member_repository import IProjectMemberRepository
from app.interfaces.project_repository import IProjectRepository
from app.interfaces.task_repository import ITaskRepository
from app.interfaces.user_repository import IUserRepository
from app.models.achievement import (
    MemberContribution,
    ProjectAchievement,
)
from app.models.enums import GenerationType
from app.models.notification import NotificationCreate, NotificationType
from app.models.task import Task
from app.services.llm_utils import generate_text


# JSON schema for AI response
PROJECT_ACHIEVEMENT_RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "summary": {
            "type": "string",
            "description": "チームとしての達成サマリー（2-3文）",
        },
        "team_highlights": {
            "type": "array",
            "items": {"type": "string"},
            "description": "チームの成果ハイライト（3-5項目）",
        },
        "challenges": {
            "type": "array",
            "items": {"type": "string"},
            "description": "課題・反省点（2-3項目）",
        },
        "learnings": {
            "type": "array",
            "items": {"type": "string"},
            "description": "学び・次への教訓（2-3項目）",
        },
        "open_issues": {
            "type": "array",
            "items": {"type": "string"},
            "description": "未解決の課題・引き継ぎ事項（0-3項目）",
        },
        "member_areas": {
            "type": "object",
            "description": "メンバーごとの主な担当領域（user_id: [領域名]）",
        },
    },
    "required": ["summary", "team_highlights", "challenges", "learnings"],
}


def _build_tasks_by_member_prompt(
    tasks_by_member: dict[str, list[Task]],
    member_names: dict[str, str],
) -> str:
    """Build task list organized by member for the prompt."""
    lines = ["## メンバー別の完了タスク", ""]

    for user_id, tasks in tasks_by_member.items():
        name = member_names.get(user_id, "不明なメンバー")
        lines.append(f"### {name} ({len(tasks)}タスク)")
        for task in tasks[:10]:  # Limit to 10 tasks per member
            lines.append(f"- {task.title}")
            if task.completion_note:
                lines.append(f"  - メモ: {task.completion_note[:200]}")
        if len(tasks) > 10:
            lines.append(f"  - ...他{len(tasks) - 10}タスク")
        lines.append("")

    return "\n".join(lines)


def _generate_project_achievement_prompt(
    project_name: str,
    tasks_by_member: dict[str, list[Task]],
    member_names: dict[str, str],
    remaining_tasks_count: int,
    period_start: datetime,
    period_end: datetime,
    period_label: Optional[str] = None,
) -> str:
    """Generate the prompt for project achievement generation."""
    period_str = period_label or f"{period_start.strftime('%Y/%m/%d')} - {period_end.strftime('%Y/%m/%d')}"
    total_tasks = sum(len(tasks) for tasks in tasks_by_member.values())

    prompt = f"""あなたはプロジェクトマネージャーです。以下のプロジェクトの完了タスク一覧を分析し、チームとしての達成内容をまとめてください。

## プロジェクト情報
- プロジェクト名: {project_name}
- 対象期間: {period_str}
- 完了タスク数: {total_tasks}件
- 残タスク数: {remaining_tasks_count}件
- メンバー数: {len(tasks_by_member)}人

{_build_tasks_by_member_prompt(tasks_by_member, member_names)}

## 分析の指示

1. **サマリー（summary）**: チームとしての達成内容を2-3文で要約してください。

2. **チームの成果ハイライト（team_highlights）**: 特筆すべき成果を3-5項目で挙げてください。
   - 具体的なアウトプット
   - マイルストーンの達成
   - チームとしての連携

3. **課題・反省点（challenges）**: 今後改善すべき点を2-3項目で挙げてください。
   - 進め方の課題
   - コミュニケーションの課題
   - 技術的な課題

4. **学び・次への教訓（learnings）**: 次のプロジェクトに活かせる学びを2-3項目で挙げてください。

5. **未解決の課題（open_issues）**: 引き継ぎが必要な事項があれば0-3項目で挙げてください。

6. **メンバーの担当領域（member_areas）**: 各メンバーが主に担当した領域を推測してください。
   - 形式: {{"user_id": ["設計", "実装"]}} のようなJSON
   - 領域例: 設計, 実装, テスト, ドキュメント, 調整, レビュー, 企画, 分析

## 注意点
- チームの貢献を公平に評価してください
- ポジティブなトーンで、達成感を感じられるように書いてください
- 日本語で回答してください

回答はJSON形式で返してください。
"""
    return prompt


async def generate_project_achievement(
    llm_provider: ILLMProvider,
    task_repo: ITaskRepository,
    project_repo: IProjectRepository,
    project_member_repo: IProjectMemberRepository,
    user_repo: IUserRepository,
    project_achievement_repo: IProjectAchievementRepository,
    notification_repo: Optional[INotificationRepository],
    project_id: UUID,
    period_start: datetime,
    period_end: datetime,
    period_label: Optional[str] = None,
    generation_type: GenerationType = GenerationType.AUTO,
) -> Optional[ProjectAchievement]:
    """
    Generate a project achievement summary for a given period.

    Args:
        llm_provider: LLM provider for AI generation
        task_repo: Task repository
        project_repo: Project repository
        project_member_repo: Project member repository
        user_repo: User repository
        project_achievement_repo: Project achievement repository
        notification_repo: Notification repository (optional, for sending notifications)
        project_id: Project ID
        period_start: Period start datetime
        period_end: Period end datetime
        period_label: Optional human-readable period label
        generation_type: AUTO or MANUAL

    Returns:
        Generated and saved ProjectAchievement, or None if no tasks
    """
    # Get project info (using get_by_id for system/background processes)
    project = await project_repo.get_by_id(project_id)
    if not project:
        logger.warning(f"Project {project_id} not found")
        return None

    # Get project members
    members = await project_member_repo.list_by_project(project_id)
    member_user_ids = [str(m.user_id) for m in members]

    # Get user display names
    member_names: dict[str, str] = {}
    for user_id in member_user_ids:
        try:
            user = await user_repo.get_by_id(UUID(user_id))
            if user:
                member_names[user_id] = user.display_name or user.username
            else:
                member_names[user_id] = "不明"
        except Exception:
            member_names[user_id] = "不明"

    # Fetch completed tasks by member
    tasks_by_member: dict[str, list[Task]] = defaultdict(list)
    for user_id in member_user_ids:
        completed_tasks = await task_repo.list_completed_in_period(
            user_id=user_id,
            period_start=period_start,
            period_end=period_end,
            project_id=project_id,
        )
        if completed_tasks:
            tasks_by_member[user_id] = completed_tasks

    total_task_count = sum(len(tasks) for tasks in tasks_by_member.values())
    if total_task_count == 0:
        logger.info(f"No completed tasks for project {project_id} in period")
        return None

    # Get remaining tasks count (include_done=False excludes DONE tasks by default)
    remaining_tasks = await task_repo.list(
        user_id=member_user_ids[0] if member_user_ids else "",
        project_id=project_id,
        include_done=False,
    )
    remaining_tasks_count = len(remaining_tasks)

    # Generate AI analysis
    prompt = _generate_project_achievement_prompt(
        project_name=project.name,
        tasks_by_member=tasks_by_member,
        member_names=member_names,
        remaining_tasks_count=remaining_tasks_count,
        period_start=period_start,
        period_end=period_end,
        period_label=period_label,
    )

    response_text = generate_text(
        llm_provider=llm_provider,
        prompt=prompt,
        temperature=0.3,
        max_output_tokens=2000,
        response_mime_type="application/json",
    )

    # Parse AI response
    ai_result = _parse_ai_response(response_text)

    # Build member contributions
    member_areas = ai_result.get("member_areas", {})
    member_contributions = []
    for user_id, tasks in tasks_by_member.items():
        contribution = MemberContribution(
            user_id=user_id,
            display_name=member_names.get(user_id, "不明"),
            task_count=len(tasks),
            main_areas=member_areas.get(user_id, []),
            task_titles=[t.title for t in tasks[:10]],
        )
        member_contributions.append(contribution)

    # Create achievement
    achievement = ProjectAchievement(
        id=uuid4(),
        project_id=project_id,
        period_start=period_start,
        period_end=period_end,
        period_label=period_label,
        summary=ai_result.get("summary", "この期間の達成内容をまとめられませんでした。"),
        team_highlights=ai_result.get("team_highlights", []),
        challenges=ai_result.get("challenges", []),
        learnings=ai_result.get("learnings", []),
        member_contributions=member_contributions,
        total_task_count=total_task_count,
        remaining_tasks_count=remaining_tasks_count,
        open_issues=ai_result.get("open_issues", []),
        generation_type=generation_type,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )

    # Save to repository
    saved = await project_achievement_repo.create(project_id, achievement)

    # Send notifications to all members
    if notification_repo:
        await _send_achievement_notifications(
            notification_repo=notification_repo,
            project_id=project_id,
            project_name=project.name,
            achievement_id=saved.id,
            member_user_ids=member_user_ids,
        )

    return saved


def _parse_ai_response(response_text: Optional[str]) -> dict:
    """Parse AI response JSON."""
    if not response_text:
        return {}

    try:
        text = response_text.strip()
        if text.startswith("```json"):
            text = text[7:]
        if text.startswith("```"):
            text = text[3:]
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()

        return json.loads(text)
    except json.JSONDecodeError as e:
        logger.warning(f"Failed to parse AI response: {e}")
        return {}


async def _send_achievement_notifications(
    notification_repo: INotificationRepository,
    project_id: UUID,
    project_name: str,
    achievement_id: UUID,
    member_user_ids: list[str],
):
    """Send notifications to all project members about new achievement."""
    notifications = []
    for user_id in member_user_ids:
        notifications.append(NotificationCreate(
            user_id=user_id,
            type=NotificationType.ACHIEVEMENT_PROJECT,
            title="プロジェクト達成項目が更新されました",
            message=f"「{project_name}」の達成項目が更新されました。チームの成果を確認しましょう！",
            link_type="project_achievement",
            link_id=str(achievement_id),
            project_id=project_id,
            project_name=project_name,
        ))

    if notifications:
        await notification_repo.create_bulk(notifications)
        logger.info(f"Sent {len(notifications)} project achievement notifications")
