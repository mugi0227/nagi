# ベースライン/スナップショット機能 実装TODO

> 他のAgent/開発者との共有用ドキュメント

## 概要

スケジュールのベースライン（計画）を保存し、実績との差分を比較できるようにする機能。
CCPM（クリティカルチェーン・プロジェクトマネジメント）のバッファ管理も導入。

**デモHTML**: [demo/project-dashboard-demo.html](../demo/project-dashboard-demo.html) - 完成イメージを確認できます

**詳細計画**: [docs/PROJECT_ENHANCEMENT_PLAN.md](./PROJECT_ENHANCEMENT_PLAN.md)

---

## 決定済み方針

| 項目 | 決定内容 |
|------|---------|
| アプローチ | A案: `schedule_snapshot` を保存して計画を固定・履歴化 |
| 管理単位 | プロジェクト単位でベースラインを管理 |
| アクティブ化 | スナップショット作成時に**自動でアクティブ化**（旧との差分を通知） |
| 切替方式 | `activate` で有効なベースラインを切替（1プロジェクト1つだけ有効） |
| リスケジュール | タスク更新ではなく「ベースライン再生成→切替」 |
| 物理制約 | `start_not_before` は物理制約として維持 |
| 見積なしタスク | 依存関係計算は「見積済みタスクのみ対象」、未見積は対象外 |
| バッファ比率 | プロジェクト設定で調整可能（**デフォルト50%**） |

---

## 実装TODO

### Phase 1: バックエンド - モデル & リポジトリ

- [x] **1-1. Pydanticモデル作成**
  - ファイル: `backend/app/models/schedule_snapshot.py` (新規)
  - モデル一覧:
    - `SnapshotTaskScheduleInfo` - タスク毎のplanned_start/end
    - `SnapshotDayAllocation` - 日次割当
    - `PhaseBufferInfo` - フェーズ毎のバッファ情報
    - `ScheduleSnapshotCreate` - 作成リクエスト
    - `ScheduleSnapshot` - 完全なスナップショット
    - `ScheduleSnapshotSummary` - 一覧用サマリー
    - `TaskScheduleDiff` - タスク差分
    - `PhaseScheduleDiff` - フェーズ差分
    - `ScheduleDiff` - 全体差分

- [x] **1-2. ORMモデル追加**
  - ファイル: `backend/app/infrastructure/local/database.py` (編集)
  - 追加内容: `ScheduleSnapshotORM` クラス
  - カラム: id, user_id, project_id, name, is_active, start_date, tasks_json, days_json, phase_buffers_json, total_buffer_minutes, consumed_buffer_minutes, capacity_hours, capacity_by_weekday, max_days, created_at, updated_at

- [x] **1-3. リポジトリインターフェース**
  - ファイル: `backend/app/interfaces/schedule_snapshot_repository.py` (新規)
  - メソッド: create, get, list_by_project, get_active, activate, delete

- [x] **1-4. リポジトリ実装 (SQLite)**
  - ファイル: `backend/app/infrastructure/local/schedule_snapshot_repository.py` (新規)

---

### Phase 2: バックエンド - CCPMサービス

- [x] **2-1. CCPMサービス作成**
  - ファイル: `backend/app/services/ccpm_service.py` (新規)
  - 機能:
    - `_find_critical_chain()` - DAGから最長パス算出
    - `calculate_phase_buffers()` - フェーズ毎のバッファ計算
    - `filter_for_ccpm()` - 見積済み/未見積タスク分離
  - バッファ計算式: `バッファ = クリティカルチェーン長 × バッファ比率`
  - ステータス判定:
    - healthy: 消費 < 33%
    - warning: 消費 < 67%
    - critical: 消費 >= 67%

---

### Phase 3: バックエンド - API

- [x] **3-1. スナップショットAPI作成**
  - ファイル: `backend/app/api/schedule_snapshots.py` (新規)
  - エンドポイント:
    ```
    POST   /projects/{project_id}/schedule-snapshots          # 作成
    GET    /projects/{project_id}/schedule-snapshots          # 一覧
    GET    /projects/{project_id}/schedule-snapshots/{id}     # 詳細
    POST   /projects/{project_id}/schedule-snapshots/{id}/activate  # 有効化
    DELETE /projects/{project_id}/schedule-snapshots/{id}     # 削除
    GET    /projects/{project_id}/schedule-snapshots/diff     # 差分取得
    ```

- [x] **3-2. DI設定追加**
  - ファイル: `backend/app/api/deps.py` (編集)
  - 追加: `get_schedule_snapshot_repository` 依存

- [x] **3-3. ルーター登録**
  - ファイル: `backend/main.py` (編集)
  - 追加: `app.include_router(schedule_snapshots.router)`

---

### Phase 4: バックエンド - 差分サービス

- [x] **4-1. 差分計算サービス**
  - ファイル: `backend/app/services/schedule_diff_service.py` (新規)
  - タスクステータス種別:
    - `on_track` - ベースラインから±1日以内
    - `delayed` - 1日以上遅延
    - `ahead` - 1日以上前倒し
    - `new` - ベースラインに存在しない
    - `removed` - ベースラインにあるが現状にない
    - `completed` - 完了済み

---

### Phase 5: フロントエンド

- [x] **5-1. API追加**
  - ファイル: `frontend/src/api/scheduleSnapshots.ts` (新規)
  - 関数: create, list, get, activate, delete, getDiff

- [x] **5-2. ベースラインUI実装**
  - ファイル: `frontend/src/pages/ProjectDetailV2Page.tsx` (編集)
  - 追加コンポーネント:
    - 「ベースライン & バッファ」カード
    - バッファ残量ピル（%表示、色分け）
    - 差分サマリー表示
    - スナップショット管理モーダル
  - デモHTMLの「ベースライン & バッファ」セクション参照

- [x] **5-3. スタイル追加**
  - ファイル: `frontend/src/pages/ProjectDetailV2Page.css` (編集)
  - スタイル: `.buffer-pill`, `.baseline-row`, `.baseline-list` 等

---

## ファイル変更一覧

### 新規作成 (7ファイル)

| ファイル | 担当可能 | 依存 |
|---------|---------|------|
| `backend/app/models/schedule_snapshot.py` | Backend | なし |
| `backend/app/interfaces/schedule_snapshot_repository.py` | Backend | 1-1完了後 |
| `backend/app/infrastructure/local/schedule_snapshot_repository.py` | Backend | 1-2, 1-3完了後 |
| `backend/app/services/ccpm_service.py` | Backend | 1-1完了後 |
| `backend/app/services/schedule_diff_service.py` | Backend | 1-1完了後 |
| `backend/app/api/schedule_snapshots.py` | Backend | Phase1-2完了後 |
| `frontend/src/api/scheduleSnapshots.ts` | Frontend | Phase3完了後 |

### 編集 (5ファイル)

| ファイル | 変更内容 |
|---------|---------|
| `backend/app/infrastructure/local/database.py` | ScheduleSnapshotORM追加 |
| `backend/app/api/deps.py` | リポジトリDI追加 |
| `backend/main.py` | ルーター登録 |
| `frontend/src/pages/ProjectDetailV2Page.tsx` | ベースラインUI追加 |
| `frontend/src/pages/ProjectDetailV2Page.css` | スタイル追加 |

---

## 並列作業の可能性

以下は依存関係がないため**並列実行可能**:

```
[並列可能グループA - Phase1完了後]
├── backend/app/services/ccpm_service.py
└── backend/app/services/schedule_diff_service.py

[並列可能グループB - Phase3完了後]
├── frontend/src/api/scheduleSnapshots.ts
└── フロントエンドUI実装
```

---

## 参考情報

### 既存モデル参照

- `backend/app/models/schedule.py` - `ScheduleResponse`, `TaskScheduleInfo` の構造
- `backend/app/services/scheduler_service.py` - `build_schedule()` の戻り値

### PhaseBufferInfo フィールド

```python
phase_id: UUID
phase_name: str
total_buffer_minutes: int      # 総バッファ
consumed_buffer_minutes: int   # 消費済み
buffer_percentage: float       # 残りバッファ（%）
critical_chain_length_minutes: int  # クリティカルチェーン長
status: Literal["healthy", "warning", "critical"]
```

### デモHTML該当箇所

`demo/project-dashboard-demo.html` の以下を参照:
- ダッシュボードタブの「ベースライン & バッファ」カード (L1307-1332)
- チームタブの「フェーズ別 負荷積み上げ」テーブルのBuffer列 (L1379-1452)
- AI提案欄の「ベースライン更新」提案 (L1171-1185)

---

## 進捗管理

実装完了したら該当項目にチェックを入れてください。
質問がある場合は issue で共有お願いします。
