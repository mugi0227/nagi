"""
Achievement model definitions.

Achievements are AI-generated summaries of user accomplishments,
skills growth, and learning based on completed tasks.
"""

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.enums import GenerationType


class SkillExperience(BaseModel):
    """Skill experience for a specific category."""

    category: str = Field(..., description="スキルカテゴリ名")
    experience_count: int = Field(0, ge=0, description="経験タスク数")
    percentage: float = Field(0.0, ge=0.0, le=100.0, description="全体に対する割合")


class SkillAnalysis(BaseModel):
    """AI-analyzed skill breakdown."""

    # Domain skills (専門領域)
    domain_skills: list[SkillExperience] = Field(
        default_factory=list,
        description="専門領域別の経験（テクノロジー、ビジネス、クリエイティブ等）",
    )

    # Soft skills (ソフトスキル)
    soft_skills: list[SkillExperience] = Field(
        default_factory=list,
        description="ソフトスキル別の経験（コミュニケーション、リーダーシップ等）",
    )

    # Work types (作業タイプ)
    work_types: list[SkillExperience] = Field(
        default_factory=list,
        description="作業タイプ別の経験（新規開発、改善、問題対応等）",
    )

    # AI-detected strengths and growth areas
    strengths: list[str] = Field(
        default_factory=list,
        description="AIが検出した強み",
    )
    growth_areas: list[str] = Field(
        default_factory=list,
        description="AIが検出した伸びしろ・成長余地",
    )


class AchievementBase(BaseModel):
    """Base achievement fields."""

    period_start: datetime = Field(..., description="対象期間の開始日時")
    period_end: datetime = Field(..., description="対象期間の終了日時")
    period_label: Optional[str] = Field(None, description="期間ラベル（例: 2024年上期）")


class AchievementCreate(AchievementBase):
    """Schema for creating a new achievement."""

    generation_type: GenerationType = Field(
        GenerationType.MANUAL,
        description="生成タイプ (AUTO=週次自動 / MANUAL=手動生成)",
    )


class Achievement(AchievementBase):
    """Complete achievement model with all fields."""

    id: UUID
    user_id: str = Field(..., description="ユーザーID")

    # AI-generated content
    summary: str = Field(..., description="達成サマリー（全体の要約）")
    growth_points: list[str] = Field(
        default_factory=list,
        description="成長ポイント（箇条書き）",
    )
    skill_analysis: SkillAnalysis = Field(
        default_factory=SkillAnalysis,
        description="スキル分析結果",
    )
    next_suggestions: list[str] = Field(
        default_factory=list,
        description="次への提案・アドバイス",
    )

    # Statistics
    task_count: int = Field(0, ge=0, description="対象タスク数")
    project_ids: list[UUID] = Field(
        default_factory=list,
        description="関連プロジェクトID一覧",
    )

    # Metadata
    generation_type: GenerationType = Field(
        GenerationType.MANUAL,
        description="生成タイプ",
    )
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class AchievementWithTasks(Achievement):
    """Achievement with associated completed tasks."""

    from app.models.task import Task

    completed_tasks: list[Task] = Field(
        default_factory=list,
        description="対象期間に完了したタスク一覧",
    )


# Skill category definitions (for AI classification)
SKILL_CATEGORIES = {
    "domain": {
        "technology": {
            "label": "テクノロジー",
            "subcategories": [
                "フロントエンド",
                "バックエンド",
                "インフラ",
                "データ",
                "セキュリティ",
                "AI・機械学習",
                "モバイル",
                "DevOps",
            ],
        },
        "business": {
            "label": "ビジネス",
            "subcategories": [
                "営業",
                "マーケティング",
                "企画・戦略",
                "財務・経理",
                "法務",
                "経営",
            ],
        },
        "creative": {
            "label": "クリエイティブ",
            "subcategories": [
                "デザイン",
                "ライティング",
                "動画・映像",
                "ブランディング",
                "UX/UI",
            ],
        },
        "operations": {
            "label": "オペレーション",
            "subcategories": [
                "人事・採用",
                "カスタマーサポート",
                "物流・サプライチェーン",
                "品質管理",
                "総務",
            ],
        },
        "professional": {
            "label": "専門職",
            "subcategories": [
                "研究開発",
                "コンサルティング",
                "教育・トレーニング",
                "医療・ヘルスケア",
                "金融",
            ],
        },
    },
    "soft_skills": [
        "コミュニケーション",
        "プレゼンテーション",
        "交渉・折衝",
        "リーダーシップ",
        "マネジメント",
        "メンタリング",
        "問題解決",
        "分析・リサーチ",
        "クリエイティブ思考",
        "プロジェクト管理",
        "時間管理",
        "優先順位付け",
        "チームワーク",
        "適応力・柔軟性",
    ],
    "work_types": [
        "新規立ち上げ",
        "改善・最適化",
        "問題対応・トラブルシュート",
        "調査・分析",
        "ドキュメント作成",
        "レビュー・チェック",
        "調整・コーディネーション",
        "報告・プレゼン",
        "企画・計画",
        "実装・制作",
    ],
}
