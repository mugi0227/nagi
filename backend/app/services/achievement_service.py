"""
Achievement generation service.

Generates AI-powered achievement summaries from completed tasks.
"""

from __future__ import annotations

import json
from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4

from app.core.logger import logger
from app.interfaces.achievement_repository import IAchievementRepository
from app.interfaces.llm_provider import ILLMProvider
from app.interfaces.task_repository import ITaskRepository
from app.models.achievement import (
    Achievement,
    SkillAnalysis,
    SkillExperience,
    SKILL_CATEGORIES,
)
from app.models.enums import GenerationType
from app.models.task import Task
from app.services.llm_utils import generate_text


# JSON schema for AI response
ACHIEVEMENT_RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "summary": {
            "type": "string",
            "description": "達成内容の全体サマリー（2-3文）",
        },
        "growth_points": {
            "type": "array",
            "items": {"type": "string"},
            "description": "成長ポイント（箇条書き、3-5項目）",
        },
        "skill_analysis": {
            "type": "object",
            "properties": {
                "domain_skills": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "category": {"type": "string"},
                            "experience_count": {"type": "integer"},
                        },
                    },
                    "description": "専門領域別の経験タスク数",
                },
                "soft_skills": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "category": {"type": "string"},
                            "experience_count": {"type": "integer"},
                        },
                    },
                    "description": "ソフトスキル別の経験タスク数",
                },
                "work_types": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "category": {"type": "string"},
                            "experience_count": {"type": "integer"},
                        },
                    },
                    "description": "作業タイプ別の経験タスク数",
                },
                "strengths": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "検出された強み（2-3項目）",
                },
                "growth_areas": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "伸びしろ・成長余地（2-3項目）",
                },
            },
        },
        "next_suggestions": {
            "type": "array",
            "items": {"type": "string"},
            "description": "次への提案・アドバイス（2-3項目）",
        },
    },
    "required": ["summary", "growth_points", "skill_analysis", "next_suggestions"],
}


def _build_skill_categories_prompt() -> str:
    """Build skill categories section for the prompt."""
    lines = ["## スキルカテゴリ（分類に使用）", ""]

    # Domain skills
    lines.append("### 専門領域（domain_skills）")
    for domain_key, domain_info in SKILL_CATEGORIES["domain"].items():
        label = domain_info["label"]
        subcats = ", ".join(domain_info["subcategories"])
        lines.append(f"- {label}: {subcats}")
    lines.append("")

    # Soft skills
    lines.append("### ソフトスキル（soft_skills）")
    lines.append(", ".join(SKILL_CATEGORIES["soft_skills"]))
    lines.append("")

    # Work types
    lines.append("### 作業タイプ（work_types）")
    lines.append(", ".join(SKILL_CATEGORIES["work_types"]))

    return "\n".join(lines)


def _build_tasks_prompt(tasks: list[Task]) -> str:
    """Build task list section for the prompt."""
    lines = ["## 完了タスク一覧", ""]

    for i, task in enumerate(tasks, 1):
        lines.append(f"### タスク {i}")
        lines.append(f"- タイトル: {task.title}")
        if task.description:
            lines.append(f"- 説明: {task.description[:500]}")
        if task.purpose:
            lines.append(f"- 目的: {task.purpose}")
        if task.completion_note:
            lines.append(f"- 達成メモ: {task.completion_note}")
        lines.append("")

    return "\n".join(lines)


def _generate_achievement_prompt(
    tasks: list[Task],
    period_start: datetime,
    period_end: datetime,
    period_label: Optional[str] = None,
) -> str:
    """Generate the prompt for achievement generation."""
    period_str = period_label or f"{period_start.strftime('%Y/%m/%d')} - {period_end.strftime('%Y/%m/%d')}"

    prompt = f"""あなたはキャリアコーチです。以下の完了タスク一覧を分析し、ユーザーの達成内容と成長をまとめてください。

## 対象期間
{period_str}

## 完了タスク数
{len(tasks)}件

{_build_tasks_prompt(tasks)}

{_build_skill_categories_prompt()}

## 分析の指示

1. **サマリー（summary）**: 期間中の達成内容を2-3文で要約してください。具体的な成果に言及してください。

2. **成長ポイント（growth_points）**: 経験を通じて得られた成長を3-5項目で挙げてください。
   - 具体的なスキルや知識の習得
   - 経験値の蓄積
   - 新しい挑戦や領域の開拓

3. **スキル分析（skill_analysis）**:
   - 各タスクを上記カテゴリに分類し、経験タスク数をカウント
   - 複数のカテゴリに該当する場合は両方にカウント
   - 強み: 特に経験が多い/深い領域を2-3つ
   - 伸びしろ: まだ経験が少ない/これから伸ばせる領域を2-3つ

4. **次への提案（next_suggestions）**: キャリア形成の観点から、次に取り組むと良いことを2-3項目で提案してください。
   - 強みをさらに伸ばす方向
   - 弱点を補強する方向
   - 新しい挑戦の方向

## 注意点
- ポジティブなトーンで、達成感を感じられるように書いてください
- 具体的な行動や成果に言及してください
- タスクが少ない場合でも、できる範囲で分析してください
- 日本語で回答してください

回答はJSON形式で返してください。
"""
    return prompt


async def generate_achievement(
    llm_provider: ILLMProvider,
    task_repo: ITaskRepository,
    achievement_repo: IAchievementRepository,
    user_id: str,
    period_start: datetime,
    period_end: datetime,
    period_label: Optional[str] = None,
    generation_type: GenerationType = GenerationType.MANUAL,
) -> Achievement:
    """
    Generate an achievement summary for a given period.

    Args:
        llm_provider: LLM provider for AI generation
        task_repo: Task repository
        achievement_repo: Achievement repository
        user_id: User ID
        period_start: Period start datetime
        period_end: Period end datetime
        period_label: Optional human-readable period label
        generation_type: AUTO or MANUAL

    Returns:
        Generated and saved Achievement
    """
    # Fetch completed tasks in the period
    completed_tasks = await task_repo.list_completed_in_period(
        user_id=user_id,
        period_start=period_start,
        period_end=period_end,
    )

    if not completed_tasks:
        # Create an empty achievement
        return await _create_empty_achievement(
            achievement_repo=achievement_repo,
            user_id=user_id,
            period_start=period_start,
            period_end=period_end,
            period_label=period_label,
            generation_type=generation_type,
        )

    # Generate AI analysis
    prompt = _generate_achievement_prompt(
        tasks=completed_tasks,
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

    # Calculate statistics
    project_ids = list(set(
        task.project_id for task in completed_tasks
        if task.project_id is not None
    ))

    # Build skill analysis with percentages
    skill_analysis = _build_skill_analysis(
        ai_result.get("skill_analysis", {}),
        len(completed_tasks),
    )

    # Create achievement
    achievement = Achievement(
        id=uuid4(),
        user_id=user_id,
        period_start=period_start,
        period_end=period_end,
        period_label=period_label,
        summary=ai_result.get("summary", "この期間の達成内容をまとめられませんでした。"),
        growth_points=ai_result.get("growth_points", []),
        skill_analysis=skill_analysis,
        next_suggestions=ai_result.get("next_suggestions", []),
        task_count=len(completed_tasks),
        project_ids=project_ids,
        generation_type=generation_type,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )

    # Save to repository
    saved = await achievement_repo.create(user_id, achievement)
    return saved


def _parse_ai_response(response_text: Optional[str]) -> dict:
    """Parse AI response JSON."""
    if not response_text:
        return {}

    try:
        # Clean up response if needed
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


def _build_skill_analysis(ai_skill_analysis: dict, total_tasks: int) -> SkillAnalysis:
    """Build SkillAnalysis with percentages calculated."""
    domain_skills = []
    for item in ai_skill_analysis.get("domain_skills", []):
        count = item.get("experience_count", 0)
        percentage = (count / total_tasks * 100) if total_tasks > 0 else 0
        domain_skills.append(SkillExperience(
            category=item.get("category", ""),
            experience_count=count,
            percentage=round(percentage, 1),
        ))

    soft_skills = []
    for item in ai_skill_analysis.get("soft_skills", []):
        count = item.get("experience_count", 0)
        percentage = (count / total_tasks * 100) if total_tasks > 0 else 0
        soft_skills.append(SkillExperience(
            category=item.get("category", ""),
            experience_count=count,
            percentage=round(percentage, 1),
        ))

    work_types = []
    for item in ai_skill_analysis.get("work_types", []):
        count = item.get("experience_count", 0)
        percentage = (count / total_tasks * 100) if total_tasks > 0 else 0
        work_types.append(SkillExperience(
            category=item.get("category", ""),
            experience_count=count,
            percentage=round(percentage, 1),
        ))

    return SkillAnalysis(
        domain_skills=domain_skills,
        soft_skills=soft_skills,
        work_types=work_types,
        strengths=ai_skill_analysis.get("strengths", []),
        growth_areas=ai_skill_analysis.get("growth_areas", []),
    )


async def _create_empty_achievement(
    achievement_repo: IAchievementRepository,
    user_id: str,
    period_start: datetime,
    period_end: datetime,
    period_label: Optional[str],
    generation_type: GenerationType,
) -> Achievement:
    """Create an achievement with no completed tasks."""
    achievement = Achievement(
        id=uuid4(),
        user_id=user_id,
        period_start=period_start,
        period_end=period_end,
        period_label=period_label,
        summary="この期間に完了したタスクはありませんでした。",
        growth_points=[],
        skill_analysis=SkillAnalysis(),
        next_suggestions=["タスクを追加して、日々の活動を記録していきましょう。"],
        task_count=0,
        project_ids=[],
        generation_type=generation_type,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    return await achievement_repo.create(user_id, achievement)


async def check_and_auto_generate(
    llm_provider: ILLMProvider,
    task_repo: ITaskRepository,
    achievement_repo: IAchievementRepository,
    user_id: str,
) -> Optional[Achievement]:
    """
    Check if auto-generation is needed and generate if so.

    Auto-generates weekly achievement if:
    - Last achievement was more than 7 days ago (or never)
    - There are new DONE tasks since last achievement

    Args:
        llm_provider: LLM provider
        task_repo: Task repository
        achievement_repo: Achievement repository
        user_id: User ID

    Returns:
        Generated Achievement if created, None otherwise
    """
    from datetime import timedelta

    # Get latest achievement
    latest = await achievement_repo.get_latest(user_id)

    # Determine period
    now = datetime.utcnow()
    if latest:
        # Check if it's been at least 7 days
        days_since = (now - latest.created_at).days
        if days_since < 7:
            return None  # Too soon

        period_start = latest.period_end
    else:
        # First time: use last 7 days
        period_start = now - timedelta(days=7)

    period_end = now

    # Check if there are new completed tasks
    completed_tasks = await task_repo.list_completed_in_period(
        user_id=user_id,
        period_start=period_start,
        period_end=period_end,
    )

    if not completed_tasks:
        return None  # No new completions

    # Generate weekly achievement
    return await generate_achievement(
        llm_provider=llm_provider,
        task_repo=task_repo,
        achievement_repo=achievement_repo,
        user_id=user_id,
        period_start=period_start,
        period_end=period_end,
        period_label=f"週次振り返り ({period_start.strftime('%m/%d')} - {period_end.strftime('%m/%d')})",
        generation_type=GenerationType.AUTO,
    )
