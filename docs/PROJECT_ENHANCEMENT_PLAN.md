# プロジェクト機能 強化開発計画（完全版）

## 目的
個人・チームのプロジェクト運用を、既存の強み（チェックイン/フェーズ/マイルストーン/タスク/スケジュール/メモリー）を残したまま、AIが能動的に支援する体験へ進化させる。

## 参照UI
- デモUI: `demo/project-dashboard-demo.html`
- 想定タブ: ダッシュボード / チーム / タイムライン / ボード / ガント

---

## 既存機能の棚卸し（必ず残す・移植する要素）

### UI/UX（現状のProjectDetailPage中心）
- プロジェクト概要（進捗率、完了/総タスク数）
- KPI表示（project.kpi_config を反映）
- チェックイン投稿（weekly/issue/general）
- チェックイン要約（期間指定・LLM要約・保存）
- 保存済みチェックインサマリー（Memoryタグ `checkin_summary`）
- ブロッカー一覧
- タスク一覧（担当者、期限、ステータス、依存関係）
- メンバー管理（招待、ロール変更、削除）
- 定例会議一覧（固定時間タスク + 議事録導線）
- スケジュール概要（ScheduleOverviewCard）
- プロジェクトREADME/コンテキスト表示

### データモデル/バックエンド
- Task / Assignment / Blocker / Member / Invitation
- Phase / Milestone（Phase API・Milestone API 既存）
- Check-in（作成/一覧/要約/保存）
- KPIテンプレート/設定（ProjectKpiConfig）
- AIフェーズ分解・フェーズ内タスク分解
- Recurring Meeting（チェックイン集約/アジェンダ生成）

---

## 課題（現状）
- UIが1ページに集約されて散漫、体験が断片的
- デモUIにある「タブ構造」「活動フィード」「AI提案」などが未統合
- チーム負荷、依存関係、ガント/ボードの可視化が不足
- 既存機能（チェックイン/フェーズ/マイルストーン/定例会議）がデモUIの主要導線から欠落

---

## 情報設計（タブ構成：デモUI準拠）

### 1. ダッシュボード
- KPIカード（既存KPI + 進捗バー）
- AI提案（遅延/ボトルネック/負荷偏り）
- 優先タスク（今日/今週のTop N）
- チェックイン投稿 + 直近サマリー
- ブロッカー一覧（Open件数バッジ）
- アクティビティフィード（タスク/チェックイン/ブロッカー/コメント）
- スケジュール概要（次の会議、締切）

### 2. チーム
- メンバーカード（担当数/進行中/完了、役割、稼働率）
- 負荷バー（色分け）
- 招待・ロール変更・削除
- 「チェックイン未投稿」可視化

### 3. タイムライン
- Phase/Milestone進捗タイムライン
- 重要イベント（チェックイン要約、リリース目標）
- AIフェーズ分解の結果表示・登録導線

### 4. ボード（カンバン）
- TODO / IN_PROGRESS / REVIEW / DONE 列
- タスク優先度・期限・担当者・依存状態
- WIP制限や遅延強調

### 5. ガント
- Phase/Milestone/Task の時間軸表示
- 依存関係ハイライト、クリティカルパス表示
- ドラッグで期限調整（将来）

---

## 既存機能の配置マップ（抜け漏れ防止）

| 既存機能 | 既定タブ | 備考 |
| --- | --- | --- |
| KPI表示 | ダッシュボード | 既存KPIをカード化 |
| チェックイン投稿/要約/保存 | ダッシュボード | 直近要約 + 保存済み一覧 |
| ブロッカー | ダッシュボード / ボード | Open件数バッジ + 列内表示 |
| メンバー/招待/ロール | チーム | 招待導線を集約 |
| 定例会議/議事録 | ダッシュボード | 近日の会議を表示 |
| スケジュール概要 | ダッシュボード | ScheduleOverviewCardを再利用 |
| フェーズ/マイルストーン | タイムライン / ガント | 既存APIを流用 |
| タスク一覧/割当 | ボード | 状態列で管理 |
| プロジェクトREADME/コンテキスト | ダッシュボード | 右カラムまたは下部 |

---

## 追加/拡張機能（新規 or 強化）

### アクティビティフィード
- DB保存 + API提供
- タイプ: TASK_CREATED / TASK_COMPLETED / TASK_ASSIGNED / COMMENT_ADDED / BLOCKER_CREATED / CHECKIN_POSTED / AI_SUGGESTION

### チーム負荷
- 週次のestimated_minutes合算
- capacityと比較した負荷率
- フェーズ単位の積み上げ表（フェーズ×メンバー）
- フェーズ期間と現在日付から動的にキャパを算出して超過を可視化
- バッファ残量の可視化（CCPM観点）

### AI提案エンジン
- 遅延検知・依存ボトルネック検知
- 自動リスケジュール（承認必須）
- 負荷再配分提案

### 権限管理
- OWNER/ADMIN/MEMBER
- 招待/削除/削除権限の整理

### コメント/通知
- タスクコメント、通知（アプリ内/Slack/メール）

---

## 実装難所と意思決定ポイント（現状APIでは難しい部分）

### 1. 自動リスケジュール/計画 vs 実績
**現状**: スケジュールは `GET /tasks/schedule` で毎回再計算されるため、基準となる「計画（ベースライン）」が保存されない。  
**課題**: 「計画と現実の差分」「AIが提案したリスケジュール」を比較しづらい。

**方針候補**:
- **A. ベースライン保存（推奨）**  
  `schedule_snapshot` を保存するAPIを追加し、計画を固定する。  
  - 例: `POST /projects/{id}/schedule-snapshots`（現行スケジュールの保存）  
  - 例: `GET /projects/{id}/schedule-diff?snapshot_id=...`
- **B. タスクに計画日付を持たせる**  
  `planned_start/planned_end` をタスクに保存。計画更新と実績を比較できるが、DB変更が大きい。
- **C. まずはプレビューのみ**  
  AI提案はUI上で「提案のみ」表示し、保存はしない（最小実装）。

→ Aを採用

#### ベースライン再生成（B案寄り）の具体フロー
**目的**: `start_not_before` などの物理制約を維持しつつ、計画の履歴と差分を管理する。

**流れ**:
1. スケジューラで「計画案」を生成（現行ロジック/パラメータ）  
2. 生成結果を `schedule_snapshot` として保存（計画の版）  
3. 承認時に「アクティブなベースライン」を切り替え  
4. UIは「現実（タスク実績）」と「アクティブなベースライン」を比較して表示  

**保存内容（例）**:
- 入力: capacity設定、filter条件、algorithm_version、作成日時/作成者
- 出力: planned_start/planned_end、日次割当、未割当理由
- CCPM系メトリクス: クリティカルチェーン、バッファ総量、消費率

**API案（例）**:
- `POST /projects/{id}/schedule-snapshots` ・・・現行スケジュールを保存
- `GET /projects/{id}/schedule-snapshots` ・・・履歴一覧
- `POST /projects/{id}/schedule-snapshots/{snapshot_id}/activate` ・・・ベースライン切替
- `GET /projects/{id}/schedule-diff?snapshot_id=...` ・・・差分取得

**補足**:
- `start_not_before` は物理制約として保持し、ベースライン生成で変更しない  
- リスケジュール「適用」は、タスク更新ではなく **ベースラインの版切替** として扱う  

### 2. AIリスケジュール提案の適用
**現状**: スケジュールは自動計算のみで、適用先のデータが無い。  
**課題**: 「承認→反映」の操作ができない。

**方針候補**:
- **A. 提案＝タスク期限の更新**  
  提案を受け入れたら `due_date/start_not_before` を更新する。
- **B. 提案＝ベースライン再生成**  
  ベースラインを新しく保存し、「新しい計画」として扱う。

→ Bを採用？
リスケジュールアルゴリズムを今まで同様とするかは一考の余地あり。
まず、スケジュールアルゴリズムについて、今のアルゴリズムだとタスクにかかる最短時間を並べるようなクリティカルチェーンっぽいものだけど、安心感のためには、予備時間がどのくらい残っているかも見れると嬉しい。ここはCCPMの考え方でやれるとよいかな。そしてそれは一目で見れるようにしたい。
フェーズごとにクリティカルチェーンと予備時間を計算する感じで、リスケジューリングのときは、予備時間を食べていく感じがいいのかなと思います。

### 3. クリティカルパス/依存ボトルネック
**現状**: 依存関係はあるが、見積時間が未設定なタスクが多いと精度が落ちる。  
**方針候補**:
- **A. 未見積タスクはデフォルト時間で計算**（精度より実用優先）
- **B. 見積があるタスクのみ対象にする**（信頼性優先）

→ 見積タスクのみ対象としつつ、未見積もりタスクとして計算対象外にしたものを明示する。AIで一斉見積もりボタンがあってもよさそう。

### 4. チーム負荷
**現状**: メンバーごとの稼働上限が未定義。  
**方針候補**:
- **A. 一律の稼働上限で簡易計算**（最短導入）
- **B. メンバーごとのキャパ設定を追加**（正確だがDB変更）

→ 細かくは将来実装だが、メンバーの基本工数の設定はできるようにしたい
トヨタ式の積み上げで負荷の可視化もしたい。（負荷は基本工数と相対的に見る）
フェーズ×メンバーの積み上げ表を用意し、フェーズ期間と現在日付から動的にキャパを見積もって超過を判断する。

### 5. アクティビティフィード
**現状**: イベントログの永続化がない。  
**方針候補**:
- **A. 新規イベントログをDB保存**（正確だが実装量多）
- **B. 既存データから擬似生成**（直近更新のタスク/チェックインのみ）

→ Aを採用
---

## 変更予定ファイル（案）

### Frontend
```
frontend/src/pages/ProjectDetailPage.tsx  # タブ構成へ再編
frontend/src/components/project-tabs/
  ├── DashboardTab.tsx
  ├── TeamTab.tsx
  ├── TimelineTab.tsx
  ├── BoardTab.tsx
  └── GanttTab.tsx
frontend/src/components/activity/
  └── ActivityFeed.tsx
frontend/src/components/team/
  ├── TeamView.tsx
  ├── TeamMemberCard.tsx
  └── WorkloadBar.tsx
frontend/src/components/dashboard/
  ├── ProjectKpiCards.tsx
  ├── AiSuggestionsPanel.tsx
  ├── PriorityTaskList.tsx
  ├── BlockerList.tsx
  └── CheckinPanel.tsx
```

### Backend
```
backend/app/models/activity.py
backend/app/services/team_workload_service.py
backend/app/services/ai_suggestion_service.py
backend/app/services/critical_path_analyzer.py
backend/app/services/reschedule_service.py
backend/app/api/activities.py
backend/app/api/dashboard.py
```

---

## API・データ設計（既存 + 新規）

### 既存（活用）
- `GET /projects/{id}`（KPI含む）
- `GET /projects/{id}/checkins`
- `POST /projects/{id}/checkins`
- `POST /projects/{id}/checkins/summary`
- `POST /projects/{id}/checkins/summary/save`
- `GET /projects/{id}/members` / `POST /projects/{id}/members`
- `GET /projects/{id}/blockers`
- `GET /phases/project/{project_id}`
- `GET /milestones/project/{project_id}`
- `POST /projects/{id}/phase-breakdown`

### 新規（追加）
- `GET /projects/{id}/dashboard-summary`
  - kpis, ai_suggestions, priority_tasks, blockers, checkins_summary, upcoming_meetings
- `GET /projects/{id}/team-workload`
- `GET /projects/{id}/activities`

---

## 実装フェーズ（優先順）

### Phase 0: V2ページの土台
- 新規ページ `ProjectDetailV2Page` を作成し、既存ページとは分離
- ルーティングは `/projects/:id/v2`（仮）で導線を確保
- 既存APIを再利用し、UI骨格（タブ/レイアウト）だけ先に実装

### Phase 0.5: 既存機能の移植
- 既存機能（チェックイン/メンバー/ブロッカー/スケジュール）をV2へ移植
- コンポーネント分割と責務整理
- v1/v2の差分が出ないことを確認

### Phase 1: ダッシュボード/チーム拡張
- KPIカード/優先タスク/チェックイン要約
- チーム負荷可視化（新API）
- Activity Feed（新API）

### Phase 2: AI強化
- 遅延検知/ボトルネック検知
- 自動リスケジュール提案
- 負荷再配分提案

### Phase 3: コラボ機能強化
- コメント/通知
- 権限チェック

### Phase 4: 可視化強化
- タイムライン（Phase/Milestone）
- ガント（クリティカルパス）
- 依存関係グラフ

### Phase 5: 移行/削除
- V2をデフォルト表示に切替
- v1ページを段階的に削除（ルーティング/依存コンポーネントを整理）

---

## 実装状況（現時点）

### 完了・移植済み
- V2ページ作成とルーティング追加（`/projects/:id/v2`）
- デモUI準拠のタブ構成（ダッシュボード/チーム/タイムライン/ボード/ガント）
- ダッシュボード: KPIカード、優先タスク、チェックイン投稿/要約/保存、ブロッカー、擬似アクティビティ、スケジュール
- チーム: メンバーカード、基本工数の設定UI、フェーズ×メンバー負荷表（フロント算出）
- タイムライン: フェーズ/マイルストーンの読み取り表示 + AIフェーズ生成導線
- ボード: 既存のタスク一覧UI/UX（`ProjectTasksView`）へ統合（Kanban + フェーズ管理）
- ガント: `ScheduleOverviewCard` をGantt表示で使用
- デモHTMLに近いレイアウト/カード構成へスタイル整形

### 進行中・暫定
- アクティビティフィードはフロント側の擬似生成（DB未実装）
- AI提案・ベースラインはUI上のプレースホルダー

---

## 今後やるべきこと（機能面）

### 1. ベースライン/リスケジュール基盤
- `schedule_snapshot` の保存・一覧・有効化・差分APIの実装
- ベースライン切替UIと差分プレビューUIの実装
- `start_not_before` を物理制約として維持した再生成フロー確定

### 2. AI提案エンジン（実装）
- 遅延検知/依存ボトルネック検知の計算ロジック
- リスケジュール案の生成と承認フロー（ベースライン再生成方式）
- 負荷再配分提案（担当者変更の候補生成）

### 3. アクティビティフィード（DB化）
- Activityモデル/API追加（`/projects/{id}/activities`）
- タスク/チェックイン/ブロッカー更新時のイベント記録

### 4. チーム負荷の精緻化
- メンバーごとの週次キャパをDBへ保存・API化
- フェーズ×メンバーの負荷算出をバックエンド化（正確性向上）

### 5. クリティカルチェーン/バッファ可視化
- CCPM用のクリティカルチェーン算出とバッファ残量表示
- ガント上のクリティカルパス強調

### 6. タスクステータスの整理
- デモUIの「REVIEW」列を採用するか決定
- 採用する場合は `TaskStatus` 追加とAPI/DB反映が必要

### 7. コメント/通知/権限
- コメント機能、通知（アプリ内/Slack/メール）
- 権限（OWNER/ADMIN/MEMBER）のUI制御とAPI連携

### 8. V2移行
- V2をデフォルト導線に切替
- v1ページを段階的に削除

---

## テスト方針
- ユニット: workload計算 / critical path / reschedule
- E2E: チェックイン投稿→要約→保存、AI提案→承認、タスク割当変更

---

## 注意事項
- 既存のチェックイン/フェーズ/マイルストーン/スケジュール機能は必ず保持
- 既存APIを活用し、後方互換を維持
- UI移行は段階的に実施（既存導線を壊さない）
- 実装はV2ページで行い、最終的にv1ページを削除する
