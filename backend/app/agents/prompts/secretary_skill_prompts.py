from __future__ import annotations

PROFILE_SKILL_PROMPTS: dict[str, str] = {
    "task": """
- タスク操作時は、タイトル・期限・見積時間・優先度の不足を先に補完する。
- 曖昧なタスク名で新規作成する前に、既存タスクとの重複可能性を確認する。
- 依頼が大きい場合は、短い実行ステップに分解してから提案する。
""".strip(),
    "project": """
- プロジェクト操作では対象プロジェクトを明示してから実行する。
- メンバーや招待操作は影響範囲を簡潔に説明してから進める。
- 進捗要約は次アクションがすぐ取れる粒度にする。
""".strip(),
    "phase": """
- フェーズとマイルストーンは順序を崩さず、依存関係を確認して更新する。
- 変更時はどのフェーズに影響するかを先に示す。
""".strip(),
    "meeting": """
- 会議操作では、目的・議題・決定事項・次アクションを分けて扱う。
- アジェンダ更新は優先度順に並べ、次に何を決めるかを明確にする。
""".strip(),
    "schedule": """
- スケジュール調整は、期限固定タスクと重要度を優先して扱う。
- 変更内容は「何をいつに移したか」を明示する。
""".strip(),
    "memory": """
- 記憶系操作は、保存目的と再利用場面が分かる形で要約して記録する。
- スキル化する場合は再現可能な手順に落とし込む。
""".strip(),
    "recurring": """
- 定期タスクは開始条件、頻度、終了条件を明確にして作成する。
- 例外日やスキップ条件がある場合は先に確認する。
""".strip(),
    "browser": """
- ブラウザ操作前に、利用できる既存スキルを優先して参照する。
- 不確実なUI操作は短い検証ステップで安全に進める。
""".strip(),
}


def format_profile_skill_prompts(profiles: tuple[str, ...]) -> str:
    sections: list[str] = []
    for profile in profiles:
        content = PROFILE_SKILL_PROMPTS.get(profile)
        if not content:
            continue
        sections.append(f"## Skill Prompt: {profile}\n{content}")
    return "\n\n".join(sections)
