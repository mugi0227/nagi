# プロジェクト機能強化 開発計画

## 概要

複数人でのプロジェクト管理をAIで最大限効率化するための機能強化計画。

**デモUI**: [demo/project-dashboard-demo.html](../demo/project-dashboard-demo.html)
- ブラウザで開いて改善後のUIイメージを確認可能
- 5つのタブ（ダッシュボード、チーム、タイムライン、ボード、ガント）

---

## 現状の課題

| 課題 | 詳細 |
|------|------|
| UIが散漫 | ProjectDetailPageに機能が詰め込まれすぎ |
| AIが受動的 | ボタンを押したときだけ動く |
| チーム状況が見えない | 誰が何をしているか不明 |
| スケジューラが個人向け | チーム全体の負荷分散なし |
| 未使用機能あり | Blocker、Milestone進捗などが活用されていない |

---

## 開発フェーズ

### Phase 1: UI整理と可視化（優先度: 高）

#### 1.1 プロジェクトサマリーダッシュボード
**目的**: 「今何をすべきか」を一目で把握

**実装内容**:
- [ ] KPIカード（4つ横並び）
- [ ] AI提案セクション（プロアクティブ通知）
- [ ] 今日の優先タスクリスト（Top5）
- [ ] ブロッカー一覧（件数バッジ付き）
- [ ] アクティビティフィード

**対象ファイル**:
```
frontend/src/pages/ProjectDetailPage.tsx  # リファクタリング
frontend/src/components/dashboard/
  ├── ProjectKpiCards.tsx        # 新規
  ├── AiSuggestionsPanel.tsx     # 新規
  ├── PriorityTaskList.tsx       # 新規
  ├── BlockerList.tsx            # 新規
  └── ActivityFeed.tsx           # 新規
```

**API追加**:
```
GET /projects/{id}/dashboard-summary
  - kpis: KPI計算結果
  - ai_suggestions: AI提案リスト
  - priority_tasks: 優先タスク
  - blockers: オープンブロッカー
  - recent_activities: 最近のアクティビティ
```

---

#### 1.2 チームビュー
**目的**: メンバーの負荷状況を可視化

**実装内容**:
- [ ] メンバーカード（アバター、担当数、進行中、完了数）
- [ ] 負荷バー（%, 色分け: 緑/黄/赤）
- [ ] メンバー招待カード

**対象ファイル**:
```
frontend/src/components/team/
  ├── TeamView.tsx              # 新規
  ├── TeamMemberCard.tsx        # 新規
  └── WorkloadBar.tsx           # 新規
```

**API追加**:
```
GET /projects/{id}/team-workload
  - members: [{
      user_id, display_name,
      assigned_count, in_progress_count, done_count,
      workload_percent, workload_minutes
    }]
```

**バックエンド実装**:
```python
# backend/app/services/team_workload_service.py
def calculate_member_workload(project_id, member_id, week_start, week_end):
    """
    メンバーの週間負荷を計算
    - 割り当てタスクのestimated_minutesを合計
    - capacity_hoursと比較してパーセント算出
    """
```

---

#### 1.3 アクティビティフィード
**目的**: チームの動きをリアルタイムで把握

**実装内容**:
- [ ] アクティビティログのDB保存
- [ ] フィード表示（アイコン、テキスト、時刻）
- [ ] フィルタ（タスク完了/コメント/割り当て/AI提案）

**対象ファイル**:
```
backend/app/models/activity.py                    # 新規
backend/app/infrastructure/local/activity_repository.py  # 新規
backend/app/api/activities.py                     # 新規
frontend/src/components/activity/ActivityFeed.tsx # 新規
```

**アクティビティ種別**:
```python
class ActivityType(str, Enum):
    TASK_CREATED = "task_created"
    TASK_COMPLETED = "task_completed"
    TASK_ASSIGNED = "task_assigned"
    COMMENT_ADDED = "comment_added"
    BLOCKER_CREATED = "blocker_created"
    BLOCKER_RESOLVED = "blocker_resolved"
    CHECKIN_POSTED = "checkin_posted"
    AI_SUGGESTION = "ai_suggestion"
```

---

### Phase 2: AI強化（優先度: 高）

#### 2.1 プロアクティブ提案エンジン
**目的**: AIが自動で問題を検知し提案

**実装内容**:
- [ ] 遅延検知（期限超過、進捗遅れ）
- [ ] ボトルネック検出（依存関係のクリティカルパス）
- [ ] リスケジュール提案
- [ ] 負荷分散提案

**対象ファイル**:
```
backend/app/services/ai_suggestion_service.py     # 新規
backend/app/services/critical_path_analyzer.py    # 新規
```

**提案ロジック**:
```python
# ai_suggestion_service.py
class AiSuggestionService:
    async def analyze_project(self, project_id) -> list[AiSuggestion]:
        suggestions = []

        # 1. 遅延タスク検出
        overdue_tasks = await self._find_overdue_tasks(project_id)
        if overdue_tasks:
            suggestions.append(AiSuggestion(
                type="RESCHEDULE",
                title="期限調整の提案",
                description=f"{len(overdue_tasks)}件のタスクが遅延中",
                action="reschedule",
                payload={"task_ids": [t.id for t in overdue_tasks]}
            ))

        # 2. ボトルネック検出
        bottlenecks = await self._find_bottlenecks(project_id)
        if bottlenecks:
            suggestions.append(AiSuggestion(
                type="BOTTLENECK",
                title="ボトルネック検出",
                description=f"タスク「{bottlenecks[0].title}」に{len(bottlenecks[0].dependents)}件が依存",
                action="reassign",
                payload={"task_id": bottlenecks[0].id}
            ))

        # 3. 負荷偏り検出
        workload_issues = await self._find_workload_imbalance(project_id)
        ...

        return suggestions
```

**クリティカルパス分析**:
```python
# critical_path_analyzer.py
def find_critical_path(tasks: list[Task]) -> list[UUID]:
    """
    依存関係グラフからクリティカルパス（最長経路）を算出
    - DAG構築
    - 各タスクの最早開始時刻(ES)、最遅開始時刻(LS)を計算
    - ES == LS のタスクがクリティカルパス上
    """
```

---

#### 2.2 自動リスケジュール
**目的**: 遅延時に自動で期限を再調整

**実装内容**:
- [ ] 遅延タスクの新期限提案
- [ ] 依存タスクの連鎖更新
- [ ] ユーザー承認フロー

**対象ファイル**:
```
backend/app/services/reschedule_service.py        # 新規
frontend/src/components/ai/RescheduleModal.tsx    # 新規
```

---

#### 2.3 AI負荷分散提案
**目的**: チーム全体の負荷を最適化

**実装内容**:
- [ ] メンバー間のタスク移動提案
- [ ] スキルマッチング考慮（オプション）

**ロジック**:
```python
def suggest_rebalance(project_id) -> list[RebalanceSuggestion]:
    """
    1. 各メンバーの負荷を計算
    2. 閾値超過メンバーを特定（>100%）
    3. 空きのあるメンバーを特定（<70%）
    4. 移動可能なタスクを選定（依存関係なし、スキル適合）
    5. 提案を生成
    """
```

---

### Phase 3: コラボレーション強化（優先度: 中）

#### 3.1 権限管理の実装
**目的**: OWNER/ADMIN/MEMBERの役割を機能させる

**実装内容**:
- [ ] APIエンドポイントに権限チェック追加
- [ ] UIで権限に応じた表示制御

**権限マトリクス**:
| 操作 | OWNER | ADMIN | MEMBER |
|------|-------|-------|--------|
| プロジェクト削除 | ○ | × | × |
| メンバー招待 | ○ | ○ | × |
| タスク作成 | ○ | ○ | ○ |
| タスク割り当て | ○ | ○ | △（自分のみ） |
| チェックイン投稿 | ○ | ○ | ○ |

**実装**:
```python
# backend/app/api/deps.py
async def require_project_role(
    project_id: UUID,
    user: CurrentUser,
    required_roles: list[ProjectRole]
) -> ProjectMember:
    member = await member_repo.get_by_user(project_id, user.id)
    if not member or member.role not in required_roles:
        raise HTTPException(403, "Permission denied")
    return member

# 使用例
@router.delete("/{project_id}")
async def delete_project(
    project_id: UUID,
    member: Annotated[ProjectMember, Depends(
        lambda: require_project_role(project_id, [ProjectRole.OWNER])
    )]
):
    ...
```

---

#### 3.2 タスクコメント機能
**目的**: タスク単位でのコミュニケーション

**実装内容**:
- [ ] コメントモデル追加
- [ ] コメントAPI
- [ ] タスク詳細モーダルにコメントセクション
- [ ] @メンション（オプション）

**対象ファイル**:
```
backend/app/models/comment.py                     # 新規
backend/app/infrastructure/local/comment_repository.py  # 新規
backend/app/api/comments.py                       # 新規
frontend/src/components/tasks/TaskComments.tsx    # 新規
```

**モデル**:
```python
class Comment(BaseModel):
    id: UUID
    task_id: UUID
    author_id: str
    author_display_name: str
    content: str
    created_at: datetime
    updated_at: datetime
```

---

#### 3.3 通知システム
**目的**: 重要なイベントをメンバーに通知

**実装内容**:
- [ ] アプリ内通知（ベルアイコン）
- [ ] Slack連携（オプション）
- [ ] メール通知（オプション）

**通知トリガー**:
- タスク割り当て時
- コメント追加時
- ブロッカー作成時
- AI提案生成時
- 期限24時間前

---

### Phase 4: 可視化強化（優先度: 中）

#### 4.1 ガントチャート改善
**目的**: フェーズ/マイルストーン/タスクの時系列表示

**実装内容**:
- [ ] フェーズのstart_date/end_dateをスケジューラ連携
- [ ] インタラクティブなバー（ドラッグで期限変更）
- [ ] クリティカルパスのハイライト

**対象ファイル**:
```
frontend/src/components/gantt/
  ├── GanttChart.tsx            # 新規
  ├── GanttRow.tsx              # 新規
  ├── GanttBar.tsx              # 新規
  └── GanttTimeline.tsx         # 新規
```

**ライブラリ候補**:
- `react-gantt-timeline` または自前実装

---

#### 4.2 依存関係グラフ
**目的**: タスク間の依存関係を視覚化

**実装内容**:
- [ ] DAGグラフ表示
- [ ] クリティカルパスのハイライト
- [ ] ブロック状態の可視化

**ライブラリ候補**:
- `react-flow` または `d3.js`

---

### Phase 5: 外部連携（優先度: 低）

#### 5.1 Slack連携
- [ ] Webhook通知
- [ ] Slashコマンドでチェックイン投稿
- [ ] Slack→タスク作成

#### 5.2 GitHub連携
- [ ] PR/Issueとタスク紐付け
- [ ] PRマージでタスク自動完了

#### 5.3 Google Calendar連携
- [ ] 定例会議の自動同期
- [ ] 期限のカレンダー表示

---

## 実装優先順位

### 最優先（Phase 1-2を並行）

```
Week 1-2:
├── 1.1 プロジェクトサマリーダッシュボード
├── 1.2 チームビュー
└── 2.1 プロアクティブ提案エンジン（基本）

Week 3-4:
├── 1.3 アクティビティフィード
├── 2.2 自動リスケジュール
└── 2.3 AI負荷分散提案
```

### 次優先（Phase 3）

```
Week 5-6:
├── 3.1 権限管理
├── 3.2 タスクコメント
└── 3.3 通知システム（アプリ内のみ）
```

### 後回し（Phase 4-5）

```
Week 7+:
├── 4.1 ガントチャート改善
├── 4.2 依存関係グラフ
└── 5.x 外部連携
```

---

## ファイル構成（最終形）

```
backend/
├── app/
│   ├── api/
│   │   ├── activities.py           # 新規
│   │   └── comments.py             # 新規
│   ├── models/
│   │   ├── activity.py             # 新規
│   │   ├── comment.py              # 新規
│   │   └── ai_suggestion.py        # 新規
│   ├── services/
│   │   ├── ai_suggestion_service.py      # 新規
│   │   ├── critical_path_analyzer.py     # 新規
│   │   ├── reschedule_service.py         # 新規
│   │   └── team_workload_service.py      # 新規
│   └── infrastructure/local/
│       ├── activity_repository.py        # 新規
│       └── comment_repository.py         # 新規

frontend/
├── src/
│   ├── components/
│   │   ├── dashboard/
│   │   │   ├── ProjectKpiCards.tsx       # 新規
│   │   │   ├── AiSuggestionsPanel.tsx    # 新規
│   │   │   ├── PriorityTaskList.tsx      # 新規
│   │   │   ├── BlockerList.tsx           # 新規
│   │   │   └── ActivityFeed.tsx          # 新規
│   │   ├── team/
│   │   │   ├── TeamView.tsx              # 新規
│   │   │   ├── TeamMemberCard.tsx        # 新規
│   │   │   └── WorkloadBar.tsx           # 新規
│   │   ├── gantt/
│   │   │   ├── GanttChart.tsx            # 新規
│   │   │   └── ...
│   │   ├── ai/
│   │   │   ├── RescheduleModal.tsx       # 新規
│   │   │   └── RebalanceModal.tsx        # 新規
│   │   └── tasks/
│   │       └── TaskComments.tsx          # 新規
│   └── pages/
│       └── ProjectDetailPage.tsx         # リファクタリング（タブ化）
```

---

## テスト方針

### ユニットテスト
- `critical_path_analyzer.py` - DAGアルゴリズムのテスト
- `ai_suggestion_service.py` - 各検出ロジックのテスト
- `team_workload_service.py` - 負荷計算のテスト

### E2Eテスト
- AI提案の生成→承認フロー
- チームビューの負荷表示
- アクティビティフィードの更新

---

## 注意事項

1. **既存機能を壊さない**: ProjectDetailPageのリファクタリングは段階的に
2. **パフォーマンス**: ダッシュボードのAPIは軽量に（N+1注意）
3. **モバイル対応**: チームビュー、ダッシュボードはレスポンシブに
4. **KISS原則**: 最初はシンプルに、必要に応じて拡張

---

## 参考リンク

- **デモUI**: [demo/project-dashboard-demo.html](../demo/project-dashboard-demo.html)
- **現状の実装**: [backend/app/api/projects.py](../backend/app/api/projects.py)
- **スケジューラ**: [backend/app/services/scheduler_service.py](../backend/app/services/scheduler_service.py)
