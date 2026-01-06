# Phase機能 統合ガイド

## 概要

Phase機能により、プロジェクト管理が4階層の構造になりました：

```
Project (プロジェクト)
  └─ Phase (フェーズ)
      └─ Task (タスク)
          └─ Subtask (サブタスク)
```

## 実装済み機能 ✅

### バックエンド（完全実装）

#### 1. データモデル
- **Phase Model**: `backend/app/models/phase.py`
  - PhaseBase, PhaseCreate, PhaseUpdate, Phase, PhaseWithTaskCount
  - PhaseStatus enum (ACTIVE, COMPLETED, ARCHIVED)
- **Task Model拡張**: `backend/app/models/task.py`
  - `phase_id: Optional[UUID]` フィールド追加

#### 2. データベース
- `phases` テーブル作成済み
- `tasks.phase_id` カラム追加済み
- インデックス設定完了

#### 3. リポジトリ
- **IPhaseRepository**: `backend/app/interfaces/phase_repository.py`
- **SqlitePhaseRepository**: `backend/app/infrastructure/local/phase_repository.py`
  - CRUD操作完全実装
  - タスク数集計機能（total_tasks, completed_tasks, in_progress_tasks）

#### 4. API エンドポイント (`backend/app/api/phases.py`)
- `POST /api/phases` - フェーズ作成
- `GET /api/phases/{phase_id}` - フェーズ取得
- `GET /api/phases/project/{project_id}` - プロジェクトのフェーズ一覧（タスク数付き）
- `PATCH /api/phases/{phase_id}` - フェーズ更新
- `DELETE /api/phases/{phase_id}` - フェーズ削除

**動作確認済み**: すべてのエンドポイントをテストし、正常動作を確認

### フロントエンド（部分実装）

#### 1. 型定義・APIクライアント
- **TypeScript型**: `frontend/src/api/types.ts`
  ```typescript
  interface Phase {
    id: string;
    user_id: string;
    project_id: string;
    name: string;
    description?: string;
    status: PhaseStatus; // 'ACTIVE' | 'COMPLETED' | 'ARCHIVED'
    order_in_project: number;
    start_date?: string;
    end_date?: string;
    created_at: string;
    updated_at: string;
  }

  interface PhaseWithTaskCount extends Phase {
    total_tasks: number;
    completed_tasks: number;
    in_progress_tasks: number;
  }
  ```

- **APIクライアント**: `frontend/src/api/phases.ts`
  ```typescript
  export const phasesApi = {
    create: (data: PhaseCreate) => api.post<Phase>('/phases', data),
    getById: (id: string) => api.get<Phase>(`/phases/${id}`),
    listByProject: (projectId: string) => api.get<PhaseWithTaskCount[]>(`/phases/project/${projectId}`),
    update: (id: string, data: PhaseUpdate) => api.patch<Phase>(`/phases/${id}`, data),
    delete: (id: string) => api.delete(`/phases/${id}`),
  };
  ```

#### 2. UIコンポーネント
- **PhaseList**: `frontend/src/components/phases/PhaseList.tsx`
  - フェーズ一覧表示
  - 作成・編集・削除
  - 順序変更（上下移動）
  - タスク数表示

- **ProjectTasksView**: `frontend/src/components/projects/ProjectTasksView.tsx`
  - Kanban/Ganttビュー切り替え
  - Phase管理パネル（開閉可能）
  - 既存のKanbanBoard統合

## 未実装機能（今後のタスク）

### 1. ProjectDetailPageへの統合 🔄

**目的**: プロジェクト詳細ページでPhase管理とビュー切り替えを可能にする

**作業内容**:
```tsx
// frontend/src/pages/ProjectDetailPage.tsx

// 1. ProjectTasksViewをインポート
import { ProjectTasksView } from '../components/projects/ProjectTasksView';

// 2. 既存のKanbanBoard部分を置き換え
// Before:
<KanbanBoard
  tasks={tasks}
  onUpdateTask={...}
  ...
/>

// After:
<ProjectTasksView
  projectId={projectId!}
  tasks={tasks}
  onUpdateTask={(id, status) => {
    updateTask(id, { status });
    refetchTasks();
  }}
  onTaskClick={handleTaskClick}
  assigneeByTaskId={assigneeByTaskId}
  assignedMemberIdByTaskId={assignedMemberIdByTaskId}
  memberOptions={memberOptions}
  onAssign={handleAssign}
/>
```

**ファイル**: `frontend/src/pages/ProjectDetailPage.tsx` (line 607-625付近)

### 2. TaskFormModalへのphase_id選択機能追加 🔄

**目的**: タスク作成・編集時にフェーズを選択できるようにする

**作業内容**:
```tsx
// frontend/src/components/tasks/TaskFormModal.tsx

// 1. propsに phases を追加
interface TaskFormModalProps {
  task?: Task;
  phases?: PhaseWithTaskCount[];  // 追加
  // ... 既存のprops
}

// 2. フォームデータに phase_id を追加
const [formData, setFormData] = useState({
  // ... 既存のフィールド
  phase_id: task?.phase_id || initialData?.phase_id || '',
});

// 3. フォームにPhase選択ドロップダウンを追加
<div className="form-group">
  <label htmlFor="phase_id">フェーズ（任意）</label>
  <select
    id="phase_id"
    value={formData.phase_id}
    onChange={(e) => setFormData({ ...formData, phase_id: e.target.value })}
  >
    <option value="">フェーズなし</option>
    {phases?.map(phase => (
      <option key={phase.id} value={phase.id}>
        {phase.name} ({phase.total_tasks}タスク)
      </option>
    ))}
  </select>
</div>

// 4. submitData に phase_id を含める
const submitData: TaskCreate | TaskUpdate = {
  // ... 既存のフィールド
  phase_id: formData.phase_id || undefined,
};
```

### 3. ガントチャートのPhase対応 🔄

**目的**: ガントチャートでPhaseごとにタスクをグループ化して表示

**現状**:
- `GanttChartView.tsx` は既にPhaseの概念を持っている（プレースホルダー実装）
- `DEFAULT_PHASE_ID` と `TEXT.phasePlaceholder` が定義済み

**作業内容**:
```tsx
// frontend/src/components/dashboard/GanttChartView.tsx

// 1. PhaseWithTaskCount を props で受け取る
interface GanttChartViewProps {
  // ... 既存のprops
  phases?: PhaseWithTaskCount[];  // 追加
}

// 2. タスクをPhaseごとにグループ化するロジックを更新
// 現在: DEFAULT_PHASE_ID でダミーのフェーズを使用
// 変更後: 実際のphase_idに基づいてグループ化

const groupByPhase = (tasks: TaskScheduleInfo[]) => {
  const phaseMap = new Map<string, TaskScheduleInfo[]>();

  tasks.forEach(task => {
    const phaseId = task.phase_id || 'no-phase';
    if (!phaseMap.has(phaseId)) {
      phaseMap.set(phaseId, []);
    }
    phaseMap.get(phaseId)!.push(task);
  });

  return phaseMap;
};

// 3. Phase名の表示を実装
// プレースホルダーテキストを実際のPhase名に置き換え
```

### 4. Phaseフィルタリング機能 🔄

**目的**: 特定のPhaseのタスクのみを表示できるようにする

**実装場所**: `ProjectTasksView.tsx`

**作業内容**:
```tsx
// フィルタリング状態を追加
const [selectedPhaseId, setSelectedPhaseId] = useState<string | null>(null);

// フィルタリングされたタスク
const filteredTasks = selectedPhaseId
  ? tasks.filter(task => task.phase_id === selectedPhaseId)
  : tasks;

// UI要素
<div className="phase-filter">
  <select
    value={selectedPhaseId || ''}
    onChange={(e) => setSelectedPhaseId(e.target.value || null)}
  >
    <option value="">すべてのフェーズ</option>
    {phases.map(phase => (
      <option key={phase.id} value={phase.id}>
        {phase.name} ({phase.total_tasks})
      </option>
    ))}
  </select>
</div>

// KanbanBoardにフィルタリング済みタスクを渡す
<KanbanBoard tasks={filteredTasks} ... />
```

### 5. Phase進捗の可視化 🔄

**目的**: Phaseごとの進捗状況を視覚的に表示

**実装案**:
- PhaseListにプログレスバー追加
- 完了率の計算: `completed_tasks / total_tasks * 100`
- 色分け: ACTIVE=青, COMPLETED=緑, ARCHIVED=グレー

## API使用例

### フェーズの作成
```typescript
const newPhase = await phasesApi.create({
  project_id: 'project-uuid',
  name: 'Phase 1: 要件定義',
  description: 'プロジェクトの要件を定義する',
  order_in_project: 1,
});
```

### プロジェクトのフェーズ一覧取得
```typescript
const phases = await phasesApi.listByProject('project-uuid');
// phases[0].total_tasks, phases[0].completed_tasks が取得できる
```

### フェーズの更新
```typescript
await phasesApi.update('phase-uuid', {
  status: 'COMPLETED',
  end_date: new Date().toISOString(),
});
```

### タスクにフェーズを設定
```typescript
await tasksApi.update('task-uuid', {
  phase_id: 'phase-uuid',
});
```

## データフロー

```
1. ユーザーがPhaseを作成
   ↓
2. phasesApi.create() でバックエンドにPOST
   ↓
3. PhaseRepositoryがデータベースに保存
   ↓
4. フロントエンドがフェーズ一覧を再取得
   ↓
5. PhaseListコンポーネントが更新される
   ↓
6. ユーザーがタスクにPhaseを割り当て
   ↓
7. tasksApi.update() でphase_idを更新
   ↓
8. フェーズのタスク数が自動更新される
```

## コンポーネント構造

```
ProjectDetailPage
  └─ ProjectTasksView
      ├─ PhaseList (フェーズ管理パネル)
      │   └─ PhaseItem × N
      └─ KanbanBoard (カンバンビュー)
          └─ KanbanColumn × 4
              └─ KanbanCard × N
```

## 注意事項

1. **Phase削除時の動作**
   - Phaseを削除しても、そのPhaseに属していたタスクは削除されない
   - タスクの`phase_id`が`null`になる
   - 必要に応じて警告メッセージを表示すること

2. **順序の管理**
   - `order_in_project` は1から始まる連番
   - 順序変更時は複数のPhaseの`order_in_project`を更新する必要がある
   - 現在のPhaseListは単純な±1の更新のみ実装

3. **タスク数の整合性**
   - `PhaseWithTaskCount`のタスク数は動的に計算される
   - キャッシュは不要（常に最新の値が返される）

## 今後の拡張案

- [ ] Phase間のタスク移動（ドラッグ&ドロップ）
- [ ] Phaseテンプレート機能
- [ ] Phaseごとの期間設定と進捗トラッキング
- [ ] Phaseのマイルストーン設定
- [ ] クリティカルパス分析
- [ ] Phaseごとのメンバー割り当て統計

## 参考ファイル

### バックエンド
- `backend/app/models/phase.py` - データモデル
- `backend/app/api/phases.py` - APIエンドポイント
- `backend/app/infrastructure/local/phase_repository.py` - リポジトリ実装

### フロントエンド
- `frontend/src/api/phases.ts` - APIクライアント
- `frontend/src/components/phases/PhaseList.tsx` - Phase管理UI
- `frontend/src/components/projects/ProjectTasksView.tsx` - ビュー統合
- `frontend/src/pages/ProjectDetailPage.tsx` - 統合先ページ

## テスト済みAPI

すべてのPhase APIエンドポイントは手動テスト済み：
- ✅ フェーズ作成
- ✅ フェーズ一覧取得（タスク数付き）
- ✅ フェーズ更新
- ✅ フェーズ削除
- ✅ タスクへのphase_id設定
- ✅ タスク数の自動集計

---

最終更新: 2026-01-06
