import { useState } from 'react';
import { FaPlus, FaRepeat } from 'react-icons/fa6';
import { FaPen, FaTrash, FaToggleOn, FaToggleOff, FaEraser, FaSyncAlt } from 'react-icons/fa';
import type { RecurringTask, RecurringTaskCreate, RecurringTaskUpdate } from '../../api/types';
import { useRecurringTasks } from '../../hooks/useRecurringTasks';
import { RecurringTaskForm } from './RecurringTaskForm';
import './RecurringTaskList.css';

const WEEKDAY_LABELS = ['月', '火', '水', '木', '金', '土', '日'];

function frequencyLabel(task: RecurringTask): string {
  switch (task.frequency) {
    case 'daily':
      return '毎日';
    case 'weekly':
      return `毎週${task.weekday != null ? WEEKDAY_LABELS[task.weekday] + '曜日' : ''}`;
    case 'biweekly':
      return `隔週${task.weekday != null ? WEEKDAY_LABELS[task.weekday] + '曜日' : ''}`;
    case 'monthly':
      return `毎月${task.day_of_month ?? ''}日`;
    case 'bimonthly':
      return `隔月${task.day_of_month ?? ''}日`;
    case 'custom':
      return `${task.custom_interval_days ?? '?'}日ごと`;
    default:
      return task.frequency;
  }
}

interface RecurringTaskListProps {
  projectId?: string;
}

export function RecurringTaskList({ projectId }: RecurringTaskListProps = {}) {
  const [showForm, setShowForm] = useState(false);
  const [editingTask, setEditingTask] = useState<RecurringTask | null>(null);
  const [showInactive, setShowInactive] = useState(false);

  const {
    recurringTasks,
    isLoading,
    createRecurringTask,
    updateRecurringTask,
    deleteRecurringTask,
    deleteGeneratedTasks,
    generateTasks,
  } = useRecurringTasks(projectId, showInactive);

  const handleCreate = async (data: RecurringTaskCreate | RecurringTaskUpdate) => {
    const payload = { ...data, project_id: projectId } as RecurringTaskCreate;
    await createRecurringTask(payload);
    setShowForm(false);
  };

  const handleUpdate = async (data: RecurringTaskCreate | RecurringTaskUpdate) => {
    if (!editingTask) return;
    await updateRecurringTask({ id: editingTask.id, data: data as RecurringTaskUpdate });
    setEditingTask(null);
  };

  const handleToggleActive = async (task: RecurringTask) => {
    await updateRecurringTask({
      id: task.id,
      data: { is_active: !task.is_active },
    });
  };

  const handleDelete = async (id: string) => {
    if (!confirm('この定期タスク定義を削除しますか？既に生成されたタスクは残ります。')) return;
    await deleteRecurringTask(id);
  };

  const handleDeleteGenerated = async (task: RecurringTask) => {
    if (!confirm(`「${task.title}」の生成済みタスクをすべて削除しますか？`)) return;
    const result = await deleteGeneratedTasks(task.id);
    alert(`${result.deleted_count}件のタスクを削除しました。`);
  };

  const handleGenerate = async (task: RecurringTask) => {
    const result = await generateTasks(task.id);
    alert(`${result.created_count}件作成、${result.skipped_count}件スキップ`);
  };

  if (isLoading) {
    return <div className="rt-list-loading">読み込み中...</div>;
  }

  return (
    <div className="rt-list">
      <div className="rt-list-header">
        <div className="rt-list-title">
          <FaRepeat />
          <span>定期タスク</span>
          <span className="rt-list-count">{recurringTasks.length}件</span>
        </div>
        <div className="rt-list-actions">
          <label className="rt-inactive-toggle">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={e => setShowInactive(e.target.checked)}
            />
            無効も表示
          </label>
          <button className="rt-add-btn" onClick={() => setShowForm(true)}>
            <FaPlus />
            追加
          </button>
        </div>
      </div>

      {recurringTasks.length === 0 ? (
        <div className="rt-list-empty">
          定期タスクはまだありません。「追加」ボタンから作成できます。
        </div>
      ) : (
        <div className="rt-list-items">
          {recurringTasks.map(task => (
            <div
              key={task.id}
              className={`rt-list-item ${!task.is_active ? 'inactive' : ''}`}
            >
              <div className="rt-item-main">
                <span className="rt-item-title">{task.title}</span>
                <span className="rt-item-freq">{frequencyLabel(task)}</span>
                {task.estimated_minutes && (
                  <span className="rt-item-est">{task.estimated_minutes}分</span>
                )}
              </div>
              <div className="rt-item-actions">
                <button
                  className="rt-item-btn"
                  onClick={() => handleToggleActive(task)}
                  title={task.is_active ? '無効にする' : '有効にする'}
                >
                  {task.is_active ? <FaToggleOn className="rt-toggle-on" /> : <FaToggleOff />}
                </button>
                <button
                  className="rt-item-btn"
                  onClick={() => handleGenerate(task)}
                  title="タスクを再生成"
                >
                  <FaSyncAlt />
                </button>
                <button
                  className="rt-item-btn"
                  onClick={() => handleDeleteGenerated(task)}
                  title="生成済みタスクを一括削除"
                >
                  <FaEraser />
                </button>
                <button
                  className="rt-item-btn"
                  onClick={() => setEditingTask(task)}
                  title="編集"
                >
                  <FaPen />
                </button>
                <button
                  className="rt-item-btn delete"
                  onClick={() => handleDelete(task.id)}
                  title="削除"
                >
                  <FaTrash />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <RecurringTaskForm
          projectId={projectId}
          onSubmit={handleCreate}
          onCancel={() => setShowForm(false)}
        />
      )}

      {editingTask && (
        <RecurringTaskForm
          projectId={projectId}
          initial={editingTask}
          onSubmit={handleUpdate}
          onCancel={() => setEditingTask(null)}
        />
      )}
    </div>
  );
}
