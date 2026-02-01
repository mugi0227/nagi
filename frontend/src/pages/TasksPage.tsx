import { useState, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FaPlus, FaFilter } from 'react-icons/fa';
import { KanbanBoard } from '../components/tasks/KanbanBoard';
import { ViewModeToggle, getStoredViewMode, setStoredViewMode, type ViewMode } from '../components/common/ViewModeToggle';
import { useTaskModal } from '../hooks/useTaskModal';
import { tasksApi } from '../api/tasks';
import type { Task, TaskStatus, TaskUpdate } from '../api/types';
import './TasksPage.css';

const PAGE_SIZE = 100;
const TEXT = {
  pageLabel: 'ページ',
  prev: '前へ',
  next: '次へ',
  showing: '表示',
  countUnit: '件',
  filterMyTasks: '個人タスクのみ',
  filterAll: '全タスク',
};

export function TasksPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [showPersonalOnly, setShowPersonalOnly] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(getStoredViewMode);

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    setStoredViewMode(mode);
  };
  const offset = (page - 1) * PAGE_SIZE;

  const { data: allTasks = [], isLoading, error, isFetching } = useQuery({
    queryKey: ['tasks', 'page', page, PAGE_SIZE, 'exclude-meetings'],
    queryFn: () => tasksApi.getAll({
      limit: PAGE_SIZE,
      offset,
      includeDone: true,
      excludeMeetings: true,
    }),
    placeholderData: (previousData) => previousData,
  });

  // Filter tasks based on showPersonalOnly toggle
  const tasks = useMemo(() => {
    if (!showPersonalOnly) return allTasks;
    return allTasks.filter(task => !task.project_id);
  }, [allTasks, showPersonalOnly]);

  const hasNext = allTasks.length === PAGE_SIZE;

  // Use the unified task modal hook
  const taskModal = useTaskModal({
    tasks,
    onRefetch: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: TaskUpdate }) =>
      tasksApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['top3'] });
      queryClient.invalidateQueries({ queryKey: ['today-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['schedule'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: tasksApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['top3'] });
      queryClient.invalidateQueries({ queryKey: ['today-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['schedule'] });
    },
  });

  const handleUpdateStatus = async (taskId: string, newStatus: TaskStatus) => {
    // Prevent completing a task if it has incomplete dependencies
    if (newStatus === 'DONE') {
      const task = tasks.find(t => t.id === taskId);
      if (task?.dependency_ids && task.dependency_ids.length > 0) {
        const missingDeps = task.dependency_ids.filter(depId => !tasks.find(t => t.id === depId));
        const fetchedDeps = missingDeps.length
          ? await Promise.all(
            missingDeps.map(depId =>
              tasksApi.getById(depId).catch(() => null)
            )
          )
          : [];
        const allDeps = [
          ...task.dependency_ids
            .map(depId => tasks.find(t => t.id === depId))
            .filter(Boolean),
          ...fetchedDeps.filter(Boolean),
        ] as Task[];

        const hasPendingDependencies = allDeps.some(depTask => depTask.status !== 'DONE');

        if (hasPendingDependencies) {
          alert('このタスクを完了するには、先に依存しているタスクを完了してください。');
          return;
        }
      }
    }
    updateMutation.mutate({ id: taskId, data: { status: newStatus } });
  };

  if (error) {
    return (
      <div className="tasks-page">
        <div className="error-state">
          タスクの取得に失敗しました。バックエンドサーバーが起動しているか確認してください。
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="tasks-page">
        <div className="loading-state">読み込み中...</div>
      </div>
    );
  }

  return (
    <div className="tasks-page">
      <div className="page-header">
        <h2 className="page-title">タスク</h2>
        <div className="header-actions">
          <button
            type="button"
            className={`filter-toggle-btn ${showPersonalOnly ? 'active' : ''}`}
            onClick={() => setShowPersonalOnly(!showPersonalOnly)}
            title={showPersonalOnly ? TEXT.filterAll : TEXT.filterMyTasks}
          >
            <FaFilter />
            {showPersonalOnly ? TEXT.filterMyTasks : TEXT.filterAll}
          </button>
          <span className="task-total">{TEXT.showing} {tasks.length}{TEXT.countUnit}</span>
          <div className="pagination-controls">
            <button
              type="button"
              className="pagination-btn"
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={page <= 1 || isFetching}
            >
              {TEXT.prev}
            </button>
            <span className="pagination-info">{TEXT.pageLabel} {page}</span>
            <button
              type="button"
              className="pagination-btn"
              onClick={() => setPage((prev) => prev + 1)}
              disabled={!hasNext || isFetching}
            >
              {TEXT.next}
            </button>
          </div>
          <ViewModeToggle value={viewMode} onChange={handleViewModeChange} />
          <button className="primary-btn" onClick={() => taskModal.openCreateForm()}>
            <FaPlus />
            新規タスク
          </button>
        </div>
      </div>

      <KanbanBoard
        tasks={tasks}
        onUpdateTask={handleUpdateStatus}
        onDeleteTask={(taskId) => deleteMutation.mutate(taskId)}
        onTaskClick={taskModal.openTaskDetail}
        compact={viewMode === 'compact'}
      />

      {taskModal.renderModals()}
    </div>
  );
}
