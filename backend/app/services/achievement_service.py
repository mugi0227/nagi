"""
Achievement generation service.

Generates AI-powered achievement summaries from completed tasks.
"""

from __future__ import annotations

import json
from datetime import datetime
from typing import Optional
from uuid import uuid4

from app.core.logger import logger
from app.interfaces.achievement_repository import IAchievementRepository
from app.interfaces.llm_provider import ILLMProvider
from app.interfaces.task_repository import ITaskRepository
from app.models.achievement import (
    SKILL_CATEGORIES,
    Achievement,
    SkillAnalysis,
    SkillExperience,
    TaskSnapshot,
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


def _build_task_snapshots_prompt(tasks: list[TaskSnapshot]) -> str:
    """Build task snapshot list section for the prompt."""
    lines = ["## 完了タスク一覧", ""]

    for i, task in enumerate(tasks, 1):
        lines.append(f"### タスク {i}")
        lines.append(f"- タイトル: {task.title}")
        if task.description:
            lines.append(f"- 説明: {task.description[:500]}")
        if task.completion_note:
            lines.append(f"- 達成メモ: {task.completion_note[:500]}")
        lines.append("")

    return "\n".join(lines)


def _format_bullet_list(items: list[str]) -> str:
    if not items:
        return "なし"
    return "\n".join([f"- {item}" for item in items])


def _build_task_snapshots(tasks: list[Task]) -> list[TaskSnapshot]:
    return [
        TaskSnapshot(
            id=task.id,
            title=task.title,
            description=task.description,
            project_id=task.project_id,
            completed_at=task.completed_at or task.updated_at,
            completion_note=task.completion_note,
        )
        for task in tasks
    ]


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

## JSON出力例（この形式で返してください）
{{
  "summary": "今週は要件整理と実装を進め、品質改善にも貢献しました。",
  "growth_points": ["API設計の理解が深まった", "見積もり精度が上がった"],
  "skill_analysis": {{
    "domain_skills": [
      {{ "category": "バックエンド", "experience_count": 3 }}
    ],
    "soft_skills": [
      {{ "category": "問題解決", "experience_count": 2 }}
    ],
    "work_types": [
      {{ "category": "実装", "experience_count": 4 }}
    ],
    "strengths": ["バックエンド設計"],
    "growth_areas": ["テスト設計"]
  }},
  "next_suggestions": ["テスト戦略の学習", "レビュー効率化の工夫"]
}}
"""
    return prompt


def _generate_achievement_prompt_with_edits(achievement: Achievement) -> str:
    """Generate the prompt for achievement regeneration with user edits."""
    period_str = achievement.period_label or (
        f"{achievement.period_start.strftime('%Y/%m/%d')} - {achievement.period_end.strftime('%Y/%m/%d')}"
    )
    task_snapshots = achievement.task_snapshots

    prompt = f"""あなたはキャリアコーチです。以下の完了タスク一覧とユーザーの編集内容を踏まえて、
達成項目を読みやすく整理し、完成版としてまとめ直してください。

## 対象期間
{period_str}

## 完了タスク数
{len(task_snapshots)}件

{_build_task_snapshots_prompt(task_snapshots)}

{_build_skill_categories_prompt()}

## ユーザーの編集内容（これを尊重して反映）

### サマリー
{achievement.summary}

### 成長ポイント
{_format_bullet_list(achievement.growth_points)}

### 強み
{_format_bullet_list(achievement.skill_analysis.strengths)}

### 伸びしろ
{_format_bullet_list(achievement.skill_analysis.growth_areas)}

### 次への提案
{_format_bullet_list(achievement.next_suggestions)}

### 追記
{achievement.append_note or "なし"}

## 指示
- 編集内容と追記を優先して、言い回しを整えてください
- 内容の欠落や矛盾がないように整理してください
- 日本語で、前向きなトーンにしてください

回答はJSON形式で返してください。

## JSON出力例（この形式で返してください）
{{
  "summary": "今週は要件整理と実装を進め、品質改善にも貢献しました。",
  "growth_points": ["API設計の理解が深まった", "見積もり精度が上がった"],
  "skill_analysis": {{
    "domain_skills": [
      {{ "category": "バックエンド", "experience_count": 3 }}
    ],
    "soft_skills": [
      {{ "category": "問題解決", "experience_count": 2 }}
    ],
    "work_types": [
      {{ "category": "実装", "experience_count": 4 }}
    ],
    "strengths": ["バックエンド設計"],
    "growth_areas": ["テスト設計"]
  }},
  "next_suggestions": ["テスト戦略の学習", "レビュー効率化の工夫"]
}}
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
    task_snapshots = _build_task_snapshots(completed_tasks)

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
        task_snapshots=task_snapshots,
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
    if not isinstance(ai_skill_analysis, dict):
        return SkillAnalysis()

    def _coerce_items(raw_items: object) -> list[SkillExperience]:
        items = raw_items if isinstance(raw_items, list) else []
        results: list[SkillExperience] = []
        for item in items:
            if isinstance(item, dict):
                category = item.get("category", "")
                try:
                    count = int(item.get("experience_count", 0))
                except (TypeError, ValueError):
                    count = 0
            elif isinstance(item, str):
                category = item
                count = 1
            else:
                continue
            percentage = (count / total_tasks * 100) if total_tasks > 0 else 0
            results.append(SkillExperience(
                category=category,
                experience_count=count,
                percentage=round(percentage, 1),
            ))
        return results

    strengths = ai_skill_analysis.get("strengths", [])
    if isinstance(strengths, str):
        strengths = [strengths]
    elif not isinstance(strengths, list):
        strengths = []

    growth_areas = ai_skill_analysis.get("growth_areas", [])
    if isinstance(growth_areas, str):
        growth_areas = [growth_areas]
    elif not isinstance(growth_areas, list):
        growth_areas = []

    return SkillAnalysis(
        domain_skills=_coerce_items(ai_skill_analysis.get("domain_skills", [])),
        soft_skills=_coerce_items(ai_skill_analysis.get("soft_skills", [])),
        work_types=_coerce_items(ai_skill_analysis.get("work_types", [])),
        strengths=strengths,
        growth_areas=growth_areas,
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
        task_snapshots=[],
        generation_type=generation_type,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    return await achievement_repo.create(user_id, achievement)


def _generate_review_questions(tasks: list[Task]) -> list[dict]:
    """
    Generate review questions based on completed tasks.

    Returns questions that help users reflect on their achievements.
    Used for interactive achievement generation flow.
    """
    questions = []

    # Tasks without completion notes
    tasks_without_notes = [t for t in tasks if not t.completion_note]
    if tasks_without_notes:
        # Pick up to 3 representative tasks
        sample_tasks = tasks_without_notes[:3]
        task_titles = [t.title for t in sample_tasks]
        questions.append({
            "id": "completion_notes",
            "question": "以下のタスクについて、工夫したことや学んだことがあれば教えてください",
            "context": "、".join(task_titles),
            "options": [
                "特になし",
                "新しい発見があった",
                "効率的な方法を見つけた",
                "難しかったが乗り越えた",
            ],
            "allow_multiple": True,
        })

    # General reflection question
    questions.append({
        "id": "highlight",
        "question": "この期間で一番印象に残っている成果は何ですか？",
        "options": [
            "特になし",
            "大きなタスクを完了した",
            "新しいスキルを習得した",
            "困難を乗り越えた",
            "チームに貢献できた",
        ],
        "allow_multiple": False,
    })

    # Challenge question
    questions.append({
        "id": "challenge",
        "question": "予想より難しかったこと・うまくいかなかったことはありますか？",
        "options": [
            "特になし",
            "時間が足りなかった",
            "技術的に難しかった",
            "調整が大変だった",
            "モチベーション維持が難しかった",
        ],
        "allow_multiple": True,
    })

    # Growth question
    if len(tasks) >= 3:
        questions.append({
            "id": "growth",
            "question": "この期間で成長を感じたことはありますか？",
            "options": [
                "特になし",
                "作業スピードが上がった",
                "クオリティが上がった",
                "新しいことに挑戦できた",
                "効率的に進められるようになった",
            ],
            "allow_multiple": True,
        })

    return questions


async def generate_review_questions(
    task_repo: ITaskRepository,
    user_id: str,
    period_start: datetime,
    period_end: datetime,
) -> dict:
    """
    Generate review questions for achievement generation.

    Args:
        task_repo: Task repository
        user_id: User ID
        period_start: Period start datetime
        period_end: Period end datetime

    Returns:
        Dictionary with questions and task info
    """
    # Fetch completed tasks in the period
    completed_tasks = await task_repo.list_completed_in_period(
        user_id=user_id,
        period_start=period_start,
        period_end=period_end,
    )

    if not completed_tasks:
        return {
            "questions": [],
            "task_count": 0,
            "message": "この期間に完了したタスクはありません",
        }

    questions = _generate_review_questions(completed_tasks)

    return {
        "questions": questions,
        "task_count": len(completed_tasks),
        "tasks_preview": [
            {
                "id": str(t.id),
                "title": t.title,
                "has_completion_note": bool(t.completion_note),
            }
            for t in completed_tasks[:10]  # Preview first 10
        ],
    }


def _generate_achievement_prompt_with_answers(
    tasks: list[Task],
    period_start: datetime,
    period_end: datetime,
    period_label: Optional[str] = None,
    user_answers: Optional[dict] = None,
) -> str:
    """Generate the prompt for achievement generation with user answers."""
    base_prompt = _generate_achievement_prompt(
        tasks=tasks,
        period_start=period_start,
        period_end=period_end,
        period_label=period_label,
    )

    if not user_answers:
        return base_prompt

    # Add user answers section
    answer_lines = ["", "## ユーザーからの振り返り回答", ""]

    if user_answers.get("highlight"):
        answer_lines.append(f"- 印象に残った成果: {user_answers['highlight']}")

    if user_answers.get("challenge"):
        challenges = user_answers["challenge"]
        if isinstance(challenges, list):
            answer_lines.append(f"- 難しかったこと: {', '.join(challenges)}")
        else:
            answer_lines.append(f"- 難しかったこと: {challenges}")

    if user_answers.get("growth"):
        growth = user_answers["growth"]
        if isinstance(growth, list):
            answer_lines.append(f"- 成長を感じたこと: {', '.join(growth)}")
        else:
            answer_lines.append(f"- 成長を感じたこと: {growth}")

    if user_answers.get("completion_notes"):
        notes = user_answers["completion_notes"]
        if isinstance(notes, list):
            answer_lines.append(f"- タスクについての振り返り: {', '.join(notes)}")
        else:
            answer_lines.append(f"- タスクについての振り返り: {notes}")

    if user_answers.get("freeform"):
        answer_lines.append(f"- 自由回答: {user_answers['freeform']}")

    answer_section = "\n".join(answer_lines)

    # Insert before the response format instruction
    insert_point = base_prompt.rfind("回答はJSON形式で返してください。")
    if insert_point != -1:
        return base_prompt[:insert_point] + answer_section + "\n\n" + base_prompt[insert_point:]

    return base_prompt + answer_section


async def generate_achievement_with_answers(
    llm_provider: ILLMProvider,
    task_repo: ITaskRepository,
    achievement_repo: IAchievementRepository,
    user_id: str,
    period_start: datetime,
    period_end: datetime,
    period_label: Optional[str] = None,
    user_answers: Optional[dict] = None,
    generation_type: GenerationType = GenerationType.MANUAL,
) -> Achievement:
    """
    Generate an achievement summary with user-provided answers.

    Args:
        llm_provider: LLM provider for AI generation
        task_repo: Task repository
        achievement_repo: Achievement repository
        user_id: User ID
        period_start: Period start datetime
        period_end: Period end datetime
        period_label: Optional human-readable period label
        user_answers: Dictionary of user answers to review questions
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
        return await _create_empty_achievement(
            achievement_repo=achievement_repo,
            user_id=user_id,
            period_start=period_start,
            period_end=period_end,
            period_label=period_label,
            generation_type=generation_type,
        )

    # Generate AI analysis with user answers
    prompt = _generate_achievement_prompt_with_answers(
        tasks=completed_tasks,
        period_start=period_start,
        period_end=period_end,
        period_label=period_label,
        user_answers=user_answers,
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
    task_snapshots = _build_task_snapshots(completed_tasks)

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
        task_snapshots=task_snapshots,
        generation_type=generation_type,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )

    # Save to repository
    saved = await achievement_repo.create(user_id, achievement)
    return saved


async def summarize_achievement_with_edits(
    llm_provider: ILLMProvider,
    achievement_repo: IAchievementRepository,
    achievement: Achievement,
) -> Achievement:
    """Summarize an achievement using current edits and append notes."""
    prompt = _generate_achievement_prompt_with_edits(achievement)

    response_text = generate_text(
        llm_provider=llm_provider,
        prompt=prompt,
        temperature=0.3,
        max_output_tokens=2000,
        response_mime_type="application/json",
    )

    ai_result = _parse_ai_response(response_text)

    summary = ai_result.get("summary")
    if not isinstance(summary, str) or not summary.strip():
        summary = achievement.summary

    growth_points = ai_result.get("growth_points")
    if not isinstance(growth_points, list):
        growth_points = achievement.growth_points

    next_suggestions = ai_result.get("next_suggestions")
    if not isinstance(next_suggestions, list):
        next_suggestions = achievement.next_suggestions

    raw_skill_analysis = ai_result.get("skill_analysis")
    if isinstance(raw_skill_analysis, dict):
        skill_analysis = _build_skill_analysis(raw_skill_analysis, len(achievement.task_snapshots))
    else:
        skill_analysis = achievement.skill_analysis

    return await achievement_repo.update(
        user_id=achievement.user_id,
        achievement_id=achievement.id,
        summary=summary,
        growth_points=growth_points,
        next_suggestions=next_suggestions,
        skill_analysis=skill_analysis,
    )


async def check_and_auto_generate(
    llm_provider: ILLMProvider,
    task_repo: ITaskRepository,
    achievement_repo: IAchievementRepository,
    user_id: str,
) -> Optional[Achievement]:
    """
    Check if auto-generation is needed and generate if so.

    Auto-generates weekly achievement if:
    - The latest achievement does not cover the most recent Friday period
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

    now = datetime.utcnow()

    # Calculate last Friday 00:00 UTC
    days_since_friday = (now.weekday() - 4) % 7  # 4 = Friday
    if days_since_friday == 0 and now.hour < 1:
        days_since_friday = 7
    last_friday = (now - timedelta(days=days_since_friday)).replace(
        hour=0, minute=0, second=0, microsecond=0
    )

    # Get latest achievement
    latest = await achievement_repo.get_latest(user_id)

    # Determine period
    if latest:
        # Skip if latest achievement already covers this period
        if latest.period_end >= last_friday:
            return None

        period_start = latest.period_end
    else:
        # First time: use last 7 days from last_friday
        period_start = last_friday - timedelta(days=7)

    period_end = last_friday

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
