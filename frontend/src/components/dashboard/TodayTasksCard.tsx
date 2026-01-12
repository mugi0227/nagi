import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence } from 'framer-motion';
import { useTodayTasks } from '../../hooks/useTodayTasks';
import { useTasks } from '../../hooks/useTasks';
import { useCapacitySettings } from '../../hooks/useCapacitySettings';
import { TaskDetailModal } from '../tasks/TaskDetailModal';
import { TaskFormModal } from '../tasks/TaskFormModal';
import { StepNumber } from '../common/StepNumber';
import { tasksApi } from '../../api/tasks';
import type { Task, TaskCreate, TaskUpdate } from '../../api/types';
import { sortTasksByStepNumber } from '../../utils/taskSort';
import { userStorage } from '../../utils/userStorage';
import './TodayTasksCard.css';

const LOCK_STORAGE_KEY = 'todayTasksLock';

const TEXT = {
  title: '今日のタスク',
  nextAction: 'Next Action',
  fetchError: '今日のタスクの取得に失敗しました',
  loading: '読み込み中...',
  dependencyAlert: '依存タスクが完了していないため完了できません',
  locked: 'Locked',
  lock: 'Lock',
  unlock: 'Unlock',
  empty: '今日のタスクはありません',
  parentUnknown: '親タスク不明',
};

const formatMinutes = (minutes: number) => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours && mins) return `${hours}h ${mins}m`;
  if (hours) return `${hours}h`;
  return `${mins}m`;
};

type TodayTaskGroup = {
  key: string;
  parentId?: string;
  parentTitle?: string | null;
  tasks: Task[];
};

type TodayTasksLock = {
  date: string;
  taskIds: string[];
  allocations?: Record<string, TodayTaskAllocationSnapshot>;
  taskSnapshots?: Record<string, TodayTaskSnapshot>;
};

type TodayTaskAllocationSnapshot = {
  allocated_minutes: number;
  total_minutes: number;
  ratio: number;
};

type TodayTaskSnapshot = {
  title: string;
  parent_id?: string;
  parent_title?: string | null;
};

export function TodayTasksCard() {
  const { data, isLoading, error } = useTodayTasks();
  const { tasks: allTasks, updateTask, createTask, isCreating, isUpdating, refetch } = useTasks();
  const { getCapacityForDate } = useCapacitySettings();
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [openedParentTask, setOpenedParentTask] = useState<Task | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [taskToEdit, setTaskToEdit] = useState<Task | undefined>(undefined);
  const [lockInfoState, setLockInfoState] = useState<TodayTasksLock | null>(() => {
    const raw = userStorage.get(LOCK_STORAGE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as TodayTasksLock;
    } catch {
      return null;
    }
  });
  const [dependencyCache, setDependencyCache] = useState<Record<string, Task>>({});

  const parentMap = useMemo(() => {
    const map = new Map<string, Task>();
    allTasks.forEach(task => map.set(task.id, task));
    return map;
  }, [allTasks]);

  const { data: subtasks = [] } = useQuery({
    queryKey: ['subtasks', selectedTask?.id || openedParentTask?.id],
    queryFn: () => {
      const targetId = openedParentTask?.id || selectedTask?.id;
      return targetId ? tasksApi.getSubtasks(targetId) : Promise.resolve([]);
    },
    enabled: !!(selectedTask || openedParentTask),
  });

  const dateLabel = data?.today || new Date().toISOString().slice(0, 10);
  const lockInfo = lockInfoState?.date === dateLabel && Array.isArray(lockInfoState.taskIds)
    ? lockInfoState
    : null;

  useEffect(() => {
    if (lockInfo) return;
    const raw = userStorage.get(LOCK_STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as TodayTasksLock;
      if (parsed?.date !== dateLabel || !Array.isArray(parsed.taskIds)) {
        userStorage.remove(LOCK_STORAGE_KEY);
      }
    } catch {
      userStorage.remove(LOCK_STORAGE_KEY);
    }
  }, [lockInfo, dateLabel]);

  const handleTaskClick = (task: Task) => {
    if (task.parent_id) {
      const parent = allTasks.find(t => t.id === task.parent_id);
      if (parent) {
        setOpenedParentTask(parent);
        setSelectedTask(task);
      } else {
        tasksApi.getById(task.parent_id)
          .then(parentTask => {
            setOpenedParentTask(parentTask);
            setSelectedTask(task);
          })
          .catch(err => {
            console.error('Failed to fetch parent task:', err);
            setSelectedTask(task);
          });
      }
    } else {
      setSelectedTask(task);
      setOpenedParentTask(null);
    }
  };

  const handleCloseModal = () => {
    setSelectedTask(null);
    setOpenedParentTask(null);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setTaskToEdit(undefined);
  };

  const handleSubmitForm = (taskData: TaskCreate | TaskUpdate) => {
    if (taskToEdit) {
      updateTask(taskToEdit.id, taskData as TaskUpdate);
    } else {
      createTask(taskData as TaskCreate);
    }
    handleCloseForm();
  };

  const handleTaskCheck = async (taskId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();

    const localTask = allTasks.find(t => t.id === taskId)
      || effectiveTodayTasks.find(t => t.id === taskId);

    if (localTask?.status === 'DONE') {
      updateTask(taskId, { status: 'TODO' });
      return;
    }

    const task = localTask ?? await tasksApi.getById(taskId).catch(() => null);
    if (!task) return;

    if (task.dependency_ids && task.dependency_ids.length > 0) {
      const missingDeps = task.dependency_ids.filter(depId => !allTasks.find(t => t.id === depId));
      const fetchedDeps = missingDeps.length
        ? await Promise.all(
          missingDeps.map(depId =>
            tasksApi.getById(depId).catch(() => null)
          )
        )
        : [];
      const allDeps = [
        ...task.dependency_ids
          .map(depId => allTasks.find(t => t.id === depId))
          .filter(Boolean),
        ...fetchedDeps.filter(Boolean),
      ] as Task[];

      const hasMissingDependencies = fetchedDeps.some(depTask => !depTask);
      const hasPendingDependencies = hasMissingDependencies
        || allDeps.some(depTask => depTask.status !== 'DONE');

      if (hasPendingDependencies) {
        alert(TEXT.dependencyAlert);
        return;
      }
    }

    updateTask(taskId, { status: 'DONE' });
  };

  const todayTasks = useMemo(() => data?.today_tasks ?? [], [data?.today_tasks]);
  const todayAllocations = useMemo(() => data?.today_allocations ?? [], [data?.today_allocations]);
  const allocatedMinutes = data?.total_estimated_minutes ?? 0;
  const displayCapacityMinutes = Math.max(
    0,
    Math.round(getCapacityForDate(new Date()) * 60)
  );

  const allocationMap = useMemo(() => {
    const map = new Map<string, TodayTaskAllocationSnapshot>();
    todayAllocations.forEach(allocation => {
      map.set(allocation.task_id, {
        allocated_minutes: allocation.allocated_minutes,
        total_minutes: allocation.total_minutes,
        ratio: allocation.ratio,
      });
    });
    return map;
  }, [todayAllocations]);

  const lockedAllocationMap = useMemo(() => {
    if (!lockInfo?.allocations) return null;
    const map = new Map<string, TodayTaskAllocationSnapshot>();
    Object.entries(lockInfo.allocations).forEach(([taskId, allocation]) => {
      map.set(taskId, allocation);
    });
    return map;
  }, [lockInfo]);

  const lockedTasks = useMemo(() => {
    if (!lockInfo) return null;
    const map = new Map(allTasks.map(task => [task.id, task]));
    return lockInfo.taskIds.map(taskId => map.get(taskId)).filter(Boolean) as Task[];
  }, [lockInfo, allTasks]);

  const effectiveTodayTasks = lockInfo ? (lockedTasks ?? []) : todayTasks;
  const allocationSource = lockInfo ? lockedAllocationMap : allocationMap;
  const displayAllocatedMinutes = allocationSource && allocationSource.size > 0
    ? effectiveTodayTasks.reduce((sum, task) => {
      const allocation = allocationSource.get(task.id);
      if (allocation) return sum + allocation.allocated_minutes;
      return sum + (task.estimated_minutes ?? 0);
    }, 0)
    : (lockInfo
      ? effectiveTodayTasks.reduce((sum, task) => sum + (task.estimated_minutes ?? 0), 0)
      : allocatedMinutes);
  const capacityPercent = displayCapacityMinutes
    ? Math.min(100, Math.round((displayAllocatedMinutes / displayCapacityMinutes) * 100))
    : 0;
  const isOverflow = capacityPercent > 100 || (data?.overflow ?? false);

  useEffect(() => {
    const tasksForDependencyScan = lockInfo ? (lockedTasks ?? []) : todayTasks;
    const knownIds = new Set<string>([
      ...allTasks.map(task => task.id),
      ...Object.keys(dependencyCache),
    ]);
    const missingIds = new Set<string>();
    tasksForDependencyScan.forEach(task => {
      (task.dependency_ids || []).forEach(depId => {
        if (!knownIds.has(depId)) {
          missingIds.add(depId);
        }
      });
    });
    if (missingIds.size === 0) return;
    Promise.all(
      Array.from(missingIds).map(depId =>
        tasksApi.getById(depId).catch(() => null)
      )
    ).then(results => {
      const updates: Record<string, Task> = {};
      results.forEach(task => {
        if (task) updates[task.id] = task;
      });
      if (Object.keys(updates).length) {
        setDependencyCache(prev => ({ ...prev, ...updates }));
      }
    });
  }, [lockInfo, lockedTasks, todayTasks, allTasks, dependencyCache]);

  const dependencyStatusByTaskId = (() => {
    const map = new Map<string, { blocked: boolean; reason?: string }>();
    const taskMap = new Map<string, Task>([
      ...allTasks.map(task => [task.id, task] as [string, Task]),
      ...Object.values(dependencyCache).map(task => [task.id, task] as [string, Task]),
    ]);

    effectiveTodayTasks.forEach(task => {
      if (!task.dependency_ids || task.dependency_ids.length === 0) return;
      const blockingTitles: string[] = [];
      let hasMissing = false;
      task.dependency_ids.forEach(depId => {
        const depTask = taskMap.get(depId);
        if (!depTask) {
          hasMissing = true;
          return;
        }
        if (depTask.status !== 'DONE') {
          blockingTitles.push(depTask.title);
        }
      });
      if (hasMissing || blockingTitles.length > 0) {
        const reason = blockingTitles.length > 0
          ? blockingTitles.join(', ')
          : '依存タスクを取得できません';
        map.set(task.id, { blocked: true, reason });
      }
    });
    return map;
  })();

  // Group tasks by parent (Option B style)
  const groupedTodayTasks = (() => {
    const groups: TodayTaskGroup[] = [];
    const tasksByParent = new Map<string, Task[]>();
    const standaloneOrder: { type: 'standalone' | 'group'; key: string; task?: Task }[] = [];

    // First pass: collect tasks by parent
    effectiveTodayTasks.forEach(task => {
      const parentId = task.parent_id;
      if (parentId) {
        if (!tasksByParent.has(parentId)) {
          tasksByParent.set(parentId, []);
          standaloneOrder.push({ type: 'group', key: parentId });
        }
        tasksByParent.get(parentId)!.push(task);
      } else {
        standaloneOrder.push({ type: 'standalone', key: task.id, task });
      }
    });

    // Second pass: create groups maintaining order
    standaloneOrder.forEach(item => {
      if (item.type === 'standalone' && item.task) {
        groups.push({
          key: `task-${item.task.id}`,
          tasks: [item.task],
        });
      } else if (item.type === 'group') {
        const tasks = tasksByParent.get(item.key) || [];
        if (tasks.length > 0) {
          const parentTitle = parentMap.get(item.key)?.title || TEXT.parentUnknown;
          // Sort tasks by step number [1], [2], [3], etc.
          const sortedTasks = sortTasksByStepNumber(tasks);
          groups.push({
            key: `parent-${item.key}`,
            parentId: item.key,
            parentTitle,
            tasks: sortedTasks,
          });
        }
      }
    });

    return groups;
  })();

  const stepNumberByTaskId = (() => {
    const map = new Map<string, number>();
    groupedTodayTasks.forEach(group => {
      if (!group.parentId) return;
      group.tasks.forEach((task) => {
        if (task.order_in_parent != null) {
          map.set(task.id, task.order_in_parent);
        }
      });
    });
    return map;
  })();

  // Get first UNBLOCKED task for Focus section (Next Action)
  // Skip tasks that are blocked by dependencies
  const focusTask = (() => {
    for (const task of effectiveTodayTasks) {
      // Skip if task is blocked by dependencies
      if (dependencyStatusByTaskId.get(task.id)?.blocked) {
        continue;
      }
      // Skip if task is already done
      if (task.status === 'DONE') {
        continue;
      }
      return task;
    }
    // If all tasks are blocked or done, return the first one anyway
    return effectiveTodayTasks[0] || null;
  })();

  const restGroups = (() => {
    if (!focusTask) return groupedTodayTasks;

    // Remove focus task from groups
    return groupedTodayTasks.map(group => ({
      ...group,
      tasks: group.tasks.filter(t => t.id !== focusTask.id),
    })).filter(group => group.tasks.length > 0);
  })();

  const focusStepNumber = focusTask ? stepNumberByTaskId.get(focusTask.id) : undefined;

  const isLocked = Boolean(lockInfo);

  const handleToggleLock = () => {
    if (isLocked) {
      userStorage.remove(LOCK_STORAGE_KEY);
      setLockInfoState(null);
      return;
    }

    const taskIds = todayTasks.map(task => task.id);
    const allocationSnapshot: Record<string, TodayTaskAllocationSnapshot> = {};
    todayAllocations.forEach(allocation => {
      allocationSnapshot[allocation.task_id] = {
        allocated_minutes: allocation.allocated_minutes,
        total_minutes: allocation.total_minutes,
        ratio: allocation.ratio,
      };
    });
    const taskSnapshot: Record<string, TodayTaskSnapshot> = {};
    todayTasks.forEach(task => {
      taskSnapshot[task.id] = {
        title: task.title,
        parent_id: task.parent_id,
        parent_title: task.parent_id
          ? (parentMap.get(task.parent_id)?.title || TEXT.parentUnknown)
          : null,
      };
    });
    const payload: TodayTasksLock = {
      date: dateLabel,
      taskIds,
      allocations: allocationSnapshot,
      taskSnapshots: taskSnapshot,
    };
    userStorage.set(LOCK_STORAGE_KEY, JSON.stringify(payload));
    setLockInfoState(payload);
  };

  // Helper to get progress values (placeholder until progress field is added)
  const getProgressValues = (task: Task) => {
    const allocation = allocationSource?.get(task.id);
    const targetPercent = allocation ? Math.round(allocation.ratio * 100) : 100;
    // TODO: Use task.progress when available
    const actualPercent = task.status === 'DONE' ? 100 : (task.progress ?? 0);
    return { targetPercent, actualPercent };
  };

  if (error) {
    return (
      <div className="today-tasks-card">
        <div className="card-header">
          <div className="today-header">
            <h3>{TEXT.title}</h3>
          </div>
        </div>
        <div className="error-message">{TEXT.fetchError}</div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="today-tasks-card">
        <div className="card-header">
          <div className="today-header">
            <h3>{TEXT.title}</h3>
          </div>
        </div>
        <div className="loading-state">{TEXT.loading}</div>
      </div>
    );
  }

  return (
    <div className="today-tasks-card">
      {/* Header */}
      <div className="card-header">
        <div className="today-header">
          <h3>{TEXT.title}</h3>
          <span className="today-date">{dateLabel}</span>
        </div>
        <div className="today-actions">
          <span className="capacity-text">
            {formatMinutes(displayAllocatedMinutes)} / {formatMinutes(displayCapacityMinutes)}
          </span>
          <button
            type="button"
            className={`lock-btn ${isLocked ? 'locked' : ''}`}
            onClick={handleToggleLock}
            disabled={!todayTasks.length && !isLocked}
          >
            {isLocked ? TEXT.locked : TEXT.lock}
          </button>
        </div>
      </div>

      {/* Capacity Bar */}
      <div className="capacity-bar-wrapper">
        <div
          className={`capacity-bar-fill ${isOverflow ? 'overflow' : ''}`}
          style={{ width: `${Math.min(capacityPercent, 100)}%` }}
        />
      </div>

      {/* Focus Section (1st task) */}
      {focusTask && (
        <div className="focus-section">
          <div className="focus-label">{TEXT.nextAction}</div>
          {(() => {
            const { targetPercent, actualPercent } = getProgressValues(focusTask);
            const isDone = focusTask.status === 'DONE';
            const isBlocked = dependencyStatusByTaskId.get(focusTask.id)?.blocked;
            const parentTitle = focusTask.parent_id
              ? parentMap.get(focusTask.parent_id)?.title
              : null;
            const allocation = allocationSource?.get(focusTask.id);

            return (
              <div
                className="focus-item"
                onClick={() => handleTaskClick(focusTask)}
              >
                <div
                  className="progress-actual"
                  style={{ width: `${actualPercent}%` }}
                />
                <div
                  className="progress-target-line"
                  style={{ left: `${targetPercent}%` }}
                />
                <div
                  className={`focus-checkbox ${isDone ? 'checked' : ''}`}
                  onClick={(e) => handleTaskCheck(focusTask.id, e)}
                />
                <div className="focus-content">
                  <div className={`focus-title ${isDone ? 'done' : ''}`}>
                    {focusStepNumber != null && (
                      <StepNumber stepNumber={focusStepNumber} />
                    )}
                    {focusTask.title}
                    {isBlocked && <span className="lock-icon">🔒</span>}
                  </div>
                  {parentTitle && (
                    <div className="focus-parent">{parentTitle}</div>
                  )}
                  <div className="focus-meta">
                    {formatMinutes(focusTask.estimated_minutes || 0)}
                    {allocation && ` / 目標${Math.round(allocation.ratio * 100)}%`}
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Task List Section */}
      <div className="task-list-section">
        <div className="task-list">
          {effectiveTodayTasks.length === 0 ? (
            <div className="empty-state">
              <p>{TEXT.empty}</p>
            </div>
          ) : restGroups.length === 0 ? null : (
            restGroups.map(group => {
              // Grouped tasks (multiple tasks with same parent)
              if (group.parentId && group.tasks.length > 1) {
                return (
                  <div key={group.key} className="task-group">
                    <div className="group-header">{group.parentTitle}</div>
                    {group.tasks.map(task => (
                      <TaskItemRow
                        key={task.id}
                        task={task}
                        dependencyStatus={dependencyStatusByTaskId.get(task.id)}
                        stepNumber={stepNumberByTaskId.get(task.id)}
                        onCheck={handleTaskCheck}
                        onClick={handleTaskClick}
                        getProgressValues={getProgressValues}
                        hideParent
                      />
                    ))}
                  </div>
                );
              }

              // Single task or standalone
              return group.tasks.map(task => {
                const parentTitle = task.parent_id
                  ? parentMap.get(task.parent_id)?.title
                  : null;
                return (
                  <TaskItemRow
                    key={task.id}
                    task={task}
                    dependencyStatus={dependencyStatusByTaskId.get(task.id)}
                    stepNumber={stepNumberByTaskId.get(task.id)}
                    parentTitle={parentTitle ?? undefined}
                    onCheck={handleTaskCheck}
                    onClick={handleTaskClick}
                    getProgressValues={getProgressValues}
                  />
                );
              });
            })
          )}
        </div>
      </div>

      <AnimatePresence>
        {selectedTask && (
          <TaskDetailModal
            task={openedParentTask || selectedTask}
            subtasks={subtasks}
            allTasks={allTasks}
            initialSubtask={openedParentTask ? selectedTask : null}
            onClose={handleCloseModal}
            onEdit={(task) => {
              setTaskToEdit(task);
              setIsFormOpen(true);
              handleCloseModal();
            }}
            onProgressChange={(taskId, progress) => {
              updateTask(taskId, { progress });
            }}
            onTaskCheck={handleTaskCheck}
            onActionItemsCreated={() => {
              refetch();
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isFormOpen && (
          <TaskFormModal
            task={taskToEdit}
            allTasks={allTasks}
            onClose={handleCloseForm}
            onSubmit={handleSubmitForm}
            isSubmitting={isCreating || isUpdating}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// Task Item Row Component
type TaskItemRowProps = {
  task: Task;
  dependencyStatus?: { blocked: boolean; reason?: string };
  parentTitle?: string;
  hideParent?: boolean;
  stepNumber?: number;
  onCheck: (taskId: string, e?: React.MouseEvent) => void;
  onClick: (task: Task) => void;
  getProgressValues: (task: Task) => { targetPercent: number; actualPercent: number };
};

function TaskItemRow({
  task,
  dependencyStatus,
  parentTitle,
  hideParent,
  stepNumber,
  onCheck,
  onClick,
  getProgressValues,
}: TaskItemRowProps) {
  const { targetPercent, actualPercent } = getProgressValues(task);
  const isDone = task.status === 'DONE';
  const isBlocked = dependencyStatus?.blocked;

  return (
    <div
      className={`task-item-wrapper ${isBlocked ? 'blocked' : ''}`}
      onClick={() => onClick(task)}
    >
      <div
        className="progress-actual"
        style={{ width: `${actualPercent}%` }}
      />
      <div
        className="progress-target-line"
        style={{ left: `${targetPercent}%` }}
      />
      <div
        className={`task-checkbox ${isDone ? 'checked' : ''}`}
        onClick={(e) => onCheck(task.id, e)}
      />
      <div className="task-content">
        <div className={`task-title ${isDone ? 'done' : ''}`}>
          {stepNumber != null && (
            <StepNumber stepNumber={stepNumber} />
          )}
          <span>{task.title}</span>
          {isBlocked && <span className="lock-icon">🔒</span>}
        </div>
        {!hideParent && parentTitle && (
          <div className="task-parent">{parentTitle}</div>
        )}
      </div>
      <div className="task-meta">
        {actualPercent > 0 && actualPercent < 100 && (
          <span className="task-progress-badge">{actualPercent}%</span>
        )}
        <span className="task-time">{formatMinutes(task.estimated_minutes || 0)}</span>
      </div>
    </div>
  );
}
