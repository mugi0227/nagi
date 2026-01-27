import { useState, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FaPlus, FaFilter } from 'react-icons/fa';
import { AnimatePresence } from 'framer-motion';
import { KanbanBoard } from '../components/tasks/KanbanBoard';
import { TaskDetailModal } from '../components/tasks/TaskDetailModal';
import { TaskFormModal } from '../components/tasks/TaskFormModal';
import { tasksApi } from '../api/tasks';
import type { Task, TaskStatus, TaskCreate, TaskUpdate } from '../api/types';
import './TasksPage.css';

const PAGE_SIZE = 100;
const TEXT = {
  pageLabel: '\u30da\u30fc\u30b8',
  prev: '\u524d\u3078',
  next: '\u6b21\u3078',
  showing: '\u8868\u793a',
  countUnit: '\u4ef6',
  filterMyTasks: '\u500b\u4eba\u30bf\u30b9\u30af\u306e\u307f',
  filterAll: '\u5168\u30bf\u30b9\u30af',
};

export function TasksPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [showPersonalOnly, setShowPersonalOnly] = useState(false);
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
    // Show only tasks that are not associated with a project
    return allTasks.filter(task => !task.project_id);
  }, [allTasks, showPersonalOnly]);

  const hasNext = allTasks.length === PAGE_SIZE;
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [taskToEdit, setTaskToEdit] = useState<Task | undefined>(undefined);
  const [initialFormData, setInitialFormData] = useState<Partial<TaskCreate> | undefined>(undefined);

  const createMutation = useMutation({
    mutationFn: tasksApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['top3'] });
      queryClient.invalidateQueries({ queryKey: ['today-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['schedule'] });
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

  // Fetch subtasks when a task is selected
  const { data: subtasks = [] } = useQuery({
    queryKey: ['subtasks', selectedTask?.id],
    queryFn: () => selectedTask ? tasksApi.getSubtasks(selectedTask.id) : Promise.resolve([]),
    enabled: !!selectedTask,
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

  const handleTaskCheck = async (taskId: string) => {
    const task = tasks.find(t => t.id === taskId) || subtasks.find(t => t.id === taskId);
    if (!task) return;

    const newStatus = task.status === 'DONE' ? 'TODO' : 'DONE';

    // If marking as done, check dependencies
    if (newStatus === 'DONE' && task.dependency_ids && task.dependency_ids.length > 0) {
      const allDeps = await Promise.all(
        task.dependency_ids.map(depId =>
          tasks.find(t => t.id === depId) ||
          subtasks.find(t => t.id === depId) ||
          tasksApi.getById(depId).catch(() => null)
        )
      );

      const hasPendingDependencies = allDeps.some(depTask => depTask && depTask.status !== 'DONE');

      if (hasPendingDependencies) {
        alert('このタスクを完了するには、先に依存しているタスクを完了してください。');
        return;
      }
    }

    // Optimistic update for selectedTask if it matches
    if (selectedTask?.id === taskId) {
      setSelectedTask(prev => prev ? { ...prev, status: newStatus } : null);
    }

    updateMutation.mutate({ id: taskId, data: { status: newStatus } }, {
      onSuccess: () => {
        // Invalidate queries to refresh subtasks and tasks list
        queryClient.invalidateQueries({ queryKey: ['subtasks', selectedTask?.id] });
      }
    });
  };

  const handleTaskClick = (task: Task) => {
    setSelectedTask(task);
  };

  const handleCloseModal = () => {
    setSelectedTask(null);
  };

  const handleOpenCreateForm = () => {
    setTaskToEdit(undefined);
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setTaskToEdit(undefined);
  };

  const handleSubmitForm = (data: TaskCreate | TaskUpdate) => {
    if (taskToEdit) {
      updateMutation.mutate({ id: taskToEdit.id, data: data as TaskUpdate });
    } else {
      createMutation.mutate(data as TaskCreate);
    }
    handleCloseForm();
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
          <button className="primary-btn" onClick={handleOpenCreateForm}>
            <FaPlus />
            新規タスク
          </button>
        </div>
      </div>
      <KanbanBoard
        tasks={tasks}
        onUpdateTask={handleUpdateStatus}
        onDeleteTask={(taskId) => deleteMutation.mutate(taskId)}
        onTaskClick={handleTaskClick}
      />

      <AnimatePresence>
        {selectedTask && (
          <TaskDetailModal
            task={selectedTask}
            subtasks={subtasks}
            allTasks={tasks}
            onClose={handleCloseModal}
            onEdit={(task) => {
              setTaskToEdit(task);
              setIsFormOpen(true);
              setSelectedTask(null);
            }}
            onTaskCheck={handleTaskCheck}
            onProgressChange={(taskId, progress) => {
              updateMutation.mutate({ id: taskId, data: { progress } });
            }}
            onStatusChange={(taskId, status) => {
              // 楽観的更新: selectedTask のステータスを即座に更新
              setSelectedTask(prev => prev ? { ...prev, status: status as Task['status'] } : null);
              updateMutation.mutate({ id: taskId, data: { status: status as 'TODO' | 'IN_PROGRESS' | 'WAITING' | 'DONE' } });
            }}
            onCreateSubtask={(parentTaskId) => {
              // 新規サブタスク作成モード: task=undefined, initialData に parent_id を設定
              setTaskToEdit(undefined);
              setInitialFormData({ parent_id: parentTaskId });
              setSelectedTask(null);
              setIsFormOpen(true);
            }}
            onActionItemsCreated={() => {
              queryClient.invalidateQueries({ queryKey: ['tasks'] });
              queryClient.invalidateQueries({ queryKey: ['subtasks'] });
            }}
          />


        )}
      </AnimatePresence>

      <AnimatePresence>
        {isFormOpen && (
          <TaskFormModal
            task={taskToEdit}
            initialData={initialFormData}
            allTasks={tasks}
            onClose={() => {
              handleCloseForm();
              setInitialFormData(undefined);
            }}
            onSubmit={handleSubmitForm}
            isSubmitting={createMutation.isPending || updateMutation.isPending}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
