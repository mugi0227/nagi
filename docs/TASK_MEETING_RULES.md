# タスク・会議のルール

このドキュメントでは、タスクと会議の取得・表示に関するルールをまとめています。

## 1. タスク取得の3層構造

| レイヤー | 条件 | 取得方法 |
|---------|------|----------|
| **Inbox（個人タスク）** | `project_id = NULL` | `list_personal_tasks()` |
| **Assigned（担当タスク）** | `assignment.assignee_id = user` | `list_for_assignee()` |
| **My Tasks** | 上記2つの合算 | Inbox ∪ Assigned |

### タスク取得フロー

```
GET /api/tasks
├── project_id指定あり
│   └── プロジェクト内タスクのみ返却
└── project_id指定なし（My Tasks）
    ├── only_meetings=true
    │   └── ユーザーの全会議を返却（プロジェクト関係なく）
    └── only_meetings=false
        ├── Assigned: assignment.assignee_id=user のタスク
        ├── Personal: project_id=NULL のタスク
        └── 両方を合算して返却
```

## 2. 会議（is_fixed_time）のルール

### 会議の識別

| フィールド | 説明 |
|------------|------|
| `is_fixed_time` | `true` で会議タスクとして識別 |
| `start_time` | 開始時刻（必須） |
| `end_time` | 終了時刻（必須、start_time より後） |
| `location` | 場所（オプション） |
| `attendees` | 参加者リスト（オプション） |
| `meeting_notes` | 議事録（オプション） |

### 会議の特別な扱い

| 項目 | 説明 |
|------|------|
| **スケジュール計算** | 通常タスクとは別枠で処理。容量計算から除外 |
| **表示ルール** | `only_meetings=true` で全プロジェクトの会議を取得可能 |
| **優先度** | 会議作成時は自動で `importance=HIGH`, `urgency=HIGH` |
| **エネルギー** | 会議は `energy_level=LOW`（受動的参加） |

### 会議とスケジューラーの関係

```
スケジューラー対象タスク
├── status != DONE/WAITING
├── NOT is_parent_task（親タスクは除外）
└── NOT is_fixed_time（会議は除外）

会議は別途 get_meetings_for_day() で処理
└── available_minutes = capacity_minutes - meeting_minutes
```

## 3. 担当者（Assignment）のルール

### タスク表示条件

| シナリオ | 表示されるか |
|---------|-------------|
| 自分が作成した個人タスク（Inbox） | 表示される |
| 自分が担当者に割り当てられたタスク | 表示される |
| プロジェクトタスクで担当者未割当 | **表示されない** |
| 会議（`only_meetings`クエリ時） | プロジェクト関係なく表示される |

### Assignment関連メソッド

| メソッド | 説明 |
|---------|------|
| `list_for_assignee(user_id)` | 自分が担当者のタスクを取得 |
| `list_all_for_user(user_id)` | 自分が作成した全割当を取得 |
| `assign_multiple()` | 1タスクに複数担当者を設定 |

## 4. フィルタパラメータ

### GET /api/tasks のパラメータ

| パラメータ | デフォルト | 説明 |
|-----------|-----------|------|
| `project_id` | なし | 指定時：プロジェクト内タスクのみ |
| `status` | なし | 指定時：そのステータスのみ |
| `include_done` | `false` | `true`でDONEも含める |
| `only_meetings` | `false` | `true`で会議のみ取得 |
| `exclude_meetings` | `false` | `true`で会議を除外 |
| `limit` | 100 | 最大取得件数 |
| `offset` | 0 | ページネーション |

### GET /api/tasks/today のパラメータ

| パラメータ | デフォルト | 説明 |
|-----------|-----------|------|
| `capacity_hours` | 8.0 | 1日の作業可能時間 |
| `buffer_hours` | 0 | バッファ時間（容量から差し引く） |
| `capacity_by_weekday` | なし | 曜日別容量（7要素配列） |
| `filter_by_assignee` | `false` | `true`で担当タスクのみ |

## 5. スケジューラーのルール

### 対象タスクの条件

```python
# スケジュール対象
status not in [DONE, WAITING]
AND NOT is_parent_task
AND NOT is_fixed_time

# 除外されるタスク
- DONE: 完了済み
- WAITING: 待機中
- 親タスク: サブタスク単位でスケジュール
- 会議: 別枠で容量計算
- 依存タスク未完了: ブロック扱い
```

### Top3タスクの選出ロジック

1. ブロック状態でないタスクを抽出
2. スコア計算: `importance × 10 + urgency × 8`
3. 同スコアなら期限日が早い順
4. 同期限なら作成日時が早い順
5. 上位3件を選出

## 6. 定例会議（RecurringMeeting）

### 自動生成の仕組み

```
RecurringMeeting（定例設定）
├── frequency: WEEKLY / BIWEEKLY
├── weekday: 0-6（月-日）
├── anchor_date: 起点日付
└── ensure_upcoming_meetings()
    └── 30日先まで会議タスクを自動生成
```

### 定例会議のフィールド

| フィールド | 説明 |
|------------|------|
| `frequency` | WEEKLY（毎週）/ BIWEEKLY（隔週） |
| `weekday` | 曜日（0=月, 6=日） |
| `anchor_date` | 起点日付（隔週計算の基準） |
| `start_time` | 開始時刻 |
| `duration_minutes` | 会議時間 |
| `agenda_window_days` | アジェンダ参照期間（デフォルト7日） |

---

## 更新履歴

- 2026-01-15: 初版作成
  - タスク取得の3層構造を文書化
  - 会議の特別な扱いを明記
  - `only_meetings`で全プロジェクトの会議を取得するよう変更
