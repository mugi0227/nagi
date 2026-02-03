import { useEffect, useMemo, useState } from 'react';
import { useTodayTasks } from '../../hooks/useTodayTasks';
import { useTasks } from '../../hooks/useTasks';
import { useProjects } from '../../hooks/useProjects';
import { useCapacitySettings } from '../../hooks/useCapacitySettings';
import { StepNumber } from '../common/StepNumber';
import { tasksApi } from '../../api/tasks';
import type { Task } from '../../api/types';
import { sortTasksByStepNumber } from '../../utils/taskSort';
import { userStorage } from '../../utils/userStorage';
import { useTimezone } from '../../hooks/useTimezone';
import { toDateKey, todayInTimezone } from '../../utils/dateTime';
import { PostponePopover } from './PostponePopover';
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

interface TodayTasksCardProps {
  /** タスククリック時のコールバック（モーダル表示は親に委譲） */
  onTaskClick?: (task: Task) => void;
}

export function TodayTasksCard({ onTaskClick }: TodayTasksCardProps) {
  const timezone = useTimezone();
  const { data, isLoading, error } = useTodayTasks();
  const { tasks: allTasks, updateTask } = useTasks();
  const { projects } = useProjects();
  const { getCapacityForDate } = useCapacitySettings();
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

  const projectMap = useMemo(() => {
    const map = new Map<string, string>();
    projects.forEach(project => map.set(project.id, project.name));
    return map;
  }, [projects]);

  const dateLabel = data?.today || toDateKey(todayInTimezone(timezone).toJSDate(), timezone);
  const lockInfo = lockInfoState?.date === dateLabel && Array.isArray(lockInfoState.taskIds)
    ? lockInfoState
    : null;

  const todayTasks = useMemo(() => data?.today_tasks ?? [], [data?.today_tasks]);
  const todayAllocations = useMemo(() => data?.today_allocations ?? [], [data?.today_allocations]);

  // Clean up stale lock info
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
    onTaskClick?.(task);
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

  const allocatedMinutes = data?.total_estimated_minutes ?? 0;
  const meetingMinutes = data?.meeting_minutes ?? 0;
  const displayCapacityMinutes = Math.max(
    0,
    Math.round(getCapacityForDate(todayInTimezone(timezone).toJSDate()) * 60)
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
  const totalCommittedMinutes = displayAllocatedMinutes + meetingMinutes;
  const meetingMinutesWithin = Math.min(meetingMinutes, displayCapacityMinutes);
  const taskMinutesWithin = Math.min(
    displayAllocatedMinutes,
    Math.max(0, displayCapacityMinutes - meetingMinutesWithin),
  );
  const taskPercent = displayCapacityMinutes
    ? Math.min(100, Math.round((taskMinutesWithin / displayCapacityMinutes) * 100))
    : 0;
  const meetingPercent = displayCapacityMinutes
    ? Math.min(100, Math.round((meetingMinutesWithin / displayCapacityMinutes) * 100))
    : 0;
  const isOverflow = totalCommittedMinutes > displayCapacityMinutes || (data?.overflow ?? false);

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
  const allocatedLabel = formatMinutes(displayAllocatedMinutes);
  const capacityTotalLabel = formatMinutes(displayCapacityMinutes);
  const meetingLabel = formatMinutes(meetingMinutes);
  const capacityLabel = meetingMinutes > 0
    ? `タスク${allocatedLabel} + 会議${meetingLabel} / ${capacityTotalLabel}`
    : `${allocatedLabel} / ${capacityTotalLabel}`;

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
            {capacityLabel}
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
          className={`capacity-bar-tasks ${isOverflow ? 'overflow' : ''}`}
          style={{ width: `${taskPercent}%` }}
        />
        {meetingPercent > 0 && (
          <div
            className="capacity-bar-meetings"
            style={{ width: `${meetingPercent}%` }}
          />
        )}
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
            const projectName = focusTask.project_id
              ? projectMap.get(focusTask.project_id)
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
                  {(projectName || parentTitle) && (
                    <div className="focus-context">
                      {projectName && <span className="focus-project">{projectName}</span>}
                      {projectName && parentTitle && <span className="context-separator">/</span>}
                      {parentTitle && <span className="focus-parent-text">{parentTitle}</span>}
                    </div>
                  )}
                  <div className="focus-meta">
                    {formatMinutes(focusTask.estimated_minutes || 0)}
                    {allocation && ` / 目標${Math.round(allocation.ratio * 100)}%`}
                  </div>
                </div>
                {!isDone && (
                  <PostponePopover
                    taskId={focusTask.id}
                    className="focus-postpone"
                  />
                )}
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
                    <div className="group-header">
                      {(() => {
                        const firstTask = group.tasks[0];
                        const projName = firstTask?.project_id ? projectMap.get(firstTask.project_id) : null;
                        return projName ? `${projName} / ${group.parentTitle}` : group.parentTitle;
                      })()}
                    </div>
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
                const projName = task.project_id
                  ? projectMap.get(task.project_id)
                  : null;
                return (
                  <TaskItemRow
                    key={task.id}
                    task={task}
                    dependencyStatus={dependencyStatusByTaskId.get(task.id)}
                    stepNumber={stepNumberByTaskId.get(task.id)}
                    parentTitle={parentTitle ?? undefined}
                    projectName={projName ?? undefined}
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
    </div>
  );
}

// Task Item Row Component
type TaskItemRowProps = {
  task: Task;
  dependencyStatus?: { blocked: boolean; reason?: string };
  parentTitle?: string;
  projectName?: string;
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
  projectName,
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
        {!hideParent && (projectName || parentTitle) && (
          <div className="task-context">
            {projectName && <span className="task-project">{projectName}</span>}
            {projectName && parentTitle && <span className="context-separator">/</span>}
            {parentTitle && <span className="task-parent-text">{parentTitle}</span>}
          </div>
        )}
      </div>
      <div className="task-meta">
        {actualPercent > 0 && actualPercent < 100 && (
          <span className="task-progress-badge">{actualPercent}%</span>
        )}
        <span className="task-time">{formatMinutes(task.estimated_minutes || 0)}</span>
      </div>
      {!isDone && (
        <PostponePopover
          taskId={task.id}
        />
      )}
    </div>
  );
}
