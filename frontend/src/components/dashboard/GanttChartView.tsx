import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { FaChevronDown, FaChevronRight } from 'react-icons/fa';
import { StepNumber } from '../common/StepNumber';
import type { ScheduleDay, TaskScheduleInfo, TaskStatus } from '../../api/types';
import './GanttChartView.css';

interface GanttChartViewProps {
  days: ScheduleDay[];
  tasks: TaskScheduleInfo[];
  taskDetailsCache: Record<string, { status: TaskStatus; is_fixed_time?: boolean; progress?: number }>;
  statusOverrides: Record<string, TaskStatus>;
  projectNameById: Record<string, string>;
  getCapacityForDate: (date: Date) => number;
  onTaskClick?: (taskId: string) => void;
}

interface GanttBar {
  startIndex: number;
  endIndex: number;
  progress: number;
  status: TaskStatus;
  isFixedTime: boolean;
  isSplit: boolean;
}

interface GanttTask extends GanttBar {
  id: string;
  title: string;
  parentId?: string;
  parentTitle?: string;
  orderInParent?: number;
  projectId?: string;
  totalMinutes: number;
}

interface ParentAggregate extends GanttBar {
  taskId?: string;
}

interface GanttParentGroup {
  id: string;
  title: string;
  projectId?: string;
  phaseId: string;
  children: GanttTask[];
  aggregate: ParentAggregate;
  childCount: number;
}

interface GanttPhaseGroup {
  id: string;
  title: string;
  parents: GanttParentGroup[];
}

interface GanttProjectGroup {
  id: string;
  title: string;
  phases: GanttPhaseGroup[];
}

type GanttRow =
  | { type: 'project'; id: string; title: string; depth: number }
  | { type: 'phase'; id: string; title: string; depth: number }
  | { type: 'parent'; id: string; title: string; depth: number; bar: ParentAggregate; childCount: number; isExpanded: boolean }
  | { type: 'task'; id: string; title: string; depth: number; bar: GanttTask; stepNumber?: number };

const TEXT = {
  empty: 'スケジュールがありません',
  taskLabel: 'タスク',
  projectUnassigned: 'プロジェクトなし',
  projectUnknown: 'プロジェクト不明',
  phasePlaceholder: 'フェーズ(将来実装)',
  parentUnknown: '親タスク不明',
  countUnit: '件',
  openSubtasks: 'サブタスクを開く',
  closeSubtasks: 'サブタスクを閉じる',
};

const DEFAULT_PHASE_ID = 'phase:placeholder';
const PROJECT_UNASSIGNED_ID = 'project:unassigned';

const formatDayLabel = (dateStr: string) => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' });
};

const formatWeekday = (dateStr: string) => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('ja-JP', { weekday: 'short' });
};

const isWeekend = (dateStr: string) => {
  const date = new Date(dateStr);
  const day = date.getDay();
  return day === 0 || day === 6;
};

const isToday = (dateStr: string) => {
  const today = new Date().toISOString().slice(0, 10);
  return dateStr === today;
};

export function GanttChartView({
  days,
  tasks,
  taskDetailsCache,
  statusOverrides,
  projectNameById,
  getCapacityForDate,
  onTaskClick,
}: GanttChartViewProps) {
  const [expandedParents, setExpandedParents] = useState<Set<string>>(() => new Set());

  const dayMeta = useMemo(() => (
    days.map(day => {
      const date = new Date(`${day.date}T00:00:00`);
      const capacityHours = getCapacityForDate(date);
      const isOffDay = capacityHours <= 0;
      return {
        date: day.date,
        label: formatDayLabel(day.date),
        weekday: formatWeekday(day.date),
        isWeekend: isWeekend(day.date),
        isToday: isToday(day.date),
        isOffDay,
      };
    })
  ), [days, getCapacityForDate]);

  const dateIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    days.forEach((day, index) => {
      map.set(day.date, index);
    });
    return map;
  }, [days]);

  const taskDaysMap = useMemo(() => {
    const map = new Map<string, Set<number>>();
    days.forEach((day, index) => {
      day.task_allocations.forEach(allocation => {
        if (!map.has(allocation.task_id)) {
          map.set(allocation.task_id, new Set());
        }
        map.get(allocation.task_id)!.add(index);
      });
    });
    return map;
  }, [days]);

  const ganttTasks = useMemo(() => {
    const result: GanttTask[] = [];

    tasks.forEach(task => {
      const taskDetails = taskDetailsCache[task.task_id];
      const status = statusOverrides[task.task_id] ?? taskDetails?.status ?? 'TODO';
      const isFixedTime = taskDetails?.is_fixed_time ?? false;
      const progress = taskDetails?.progress ?? 0;

      let startIndex = 0;
      let endIndex = days.length - 1;

      if (task.planned_start) {
        const startDateStr = task.planned_start.slice(0, 10);
        startIndex = dateIndexMap.get(startDateStr) ?? 0;
      }

      if (task.planned_end) {
        const endDateStr = task.planned_end.slice(0, 10);
        endIndex = dateIndexMap.get(endDateStr) ?? days.length - 1;
      }

      startIndex = Math.max(0, Math.min(startIndex, days.length - 1));
      endIndex = Math.max(startIndex, Math.min(endIndex, days.length - 1));

      const taskDays = taskDaysMap.get(task.task_id);
      const isSplit = Boolean(
        taskDays
        && taskDays.size > 1
        && (endIndex - startIndex + 1) > taskDays.size
      );

      result.push({
        id: task.task_id,
        title: task.title,
        startIndex,
        endIndex,
        progress,
        parentId: task.parent_id,
        parentTitle: task.parent_title,
        orderInParent: task.order_in_parent,
        isFixedTime,
        status,
        isSplit,
        projectId: task.project_id,
        totalMinutes: task.total_minutes ?? 0,
      });
    });

    result.sort((a, b) => {
      if (a.startIndex !== b.startIndex) return a.startIndex - b.startIndex;
      return a.title.localeCompare(b.title);
    });

    return result;
  }, [tasks, days.length, dateIndexMap, taskDetailsCache, statusOverrides, taskDaysMap]);

  const parentGroups = useMemo(() => {
    const groups: GanttParentGroup[] = [];
    const parentIdToChildren = new Map<string, GanttTask[]>();
    const taskById = new Map<string, GanttTask>();

    ganttTasks.forEach(task => {
      taskById.set(task.id, task);
      if (!task.parentId) return;
      if (!parentIdToChildren.has(task.parentId)) {
        parentIdToChildren.set(task.parentId, []);
      }
      parentIdToChildren.get(task.parentId)!.push(task);
    });

    const getAggregateStatus = (items: GanttTask[]) => {
      if (items.length === 0) return 'TODO';
      if (items.every(item => item.status === 'DONE')) return 'DONE';
      if (items.some(item => item.status === 'IN_PROGRESS')) return 'IN_PROGRESS';
      if (items.some(item => item.status === 'WAITING')) return 'WAITING';
      return 'TODO';
    };

    const getAggregateProgress = (items: GanttTask[], status: TaskStatus) => {
      if (items.length === 0) return 0;
      if (status === 'DONE') return 100;
      let totalWeight = 0;
      let weighted = 0;
      items.forEach(item => {
        const weight = item.totalMinutes > 0 ? item.totalMinutes : 1;
        totalWeight += weight;
        weighted += item.progress * weight;
      });
      return totalWeight ? Math.round(weighted / totalWeight) : 0;
    };

    const getAggregateSplit = (items: GanttTask[]) => {
      const daySet = new Set<number>();
      items.forEach(item => {
        const daysForTask = taskDaysMap.get(item.id);
        daysForTask?.forEach(dayIndex => daySet.add(dayIndex));
      });
      if (daySet.size <= 1) return false;
      const indices = Array.from(daySet);
      const min = Math.min(...indices);
      const max = Math.max(...indices);
      return (max - min + 1) > daySet.size;
    };

    const buildAggregate = (items: GanttTask[], taskId?: string): ParentAggregate => {
      if (items.length === 0) {
        return {
          startIndex: 0,
          endIndex: 0,
          progress: 0,
          status: 'TODO',
          isFixedTime: false,
          isSplit: false,
          taskId,
        };
      }
      const startIndex = Math.min(...items.map(item => item.startIndex));
      const endIndex = Math.max(...items.map(item => item.endIndex));
      const status = getAggregateStatus(items);
      const progress = getAggregateProgress(items, status);
      const isFixedTime = items.every(item => item.isFixedTime);
      const isSplit = getAggregateSplit(items);
      return {
        startIndex,
        endIndex,
        progress: Math.min(100, Math.max(0, progress)),
        status,
        isFixedTime,
        isSplit,
        taskId,
      };
    };

    const sortChildren = (a: GanttTask, b: GanttTask) => {
      const aOrder = a.orderInParent ?? Number.POSITIVE_INFINITY;
      const bOrder = b.orderInParent ?? Number.POSITIVE_INFINITY;
      if (aOrder !== bOrder) return aOrder - bOrder;
      if (a.startIndex !== b.startIndex) return a.startIndex - b.startIndex;
      return a.title.localeCompare(b.title);
    };

    parentIdToChildren.forEach((children, parentId) => {
      children.sort(sortChildren);
      const parentTask = taskById.get(parentId);
      const aggregateItems = parentTask ? [parentTask, ...children] : children;
      const projectId = parentTask?.projectId ?? children[0]?.projectId;
      const title = parentTask?.title ?? children[0]?.parentTitle ?? TEXT.parentUnknown;
      groups.push({
        id: parentId,
        title,
        projectId,
        phaseId: DEFAULT_PHASE_ID,
        children,
        aggregate: buildAggregate(aggregateItems, parentTask?.id),
        childCount: children.length,
      });
    });

    ganttTasks.forEach(task => {
      if (task.parentId || parentIdToChildren.has(task.id)) return;
      groups.push({
        id: task.id,
        title: task.title,
        projectId: task.projectId,
        phaseId: DEFAULT_PHASE_ID,
        children: [],
        aggregate: buildAggregate([task], task.id),
        childCount: 0,
      });
    });

    groups.sort((a, b) => {
      if (a.aggregate.startIndex !== b.aggregate.startIndex) {
        return a.aggregate.startIndex - b.aggregate.startIndex;
      }
      return a.title.localeCompare(b.title);
    });

    return groups;
  }, [ganttTasks, taskDaysMap]);

  const projectGroups = useMemo(() => {
    const map = new Map<string, GanttProjectGroup>();

    const resolveProjectTitle = (projectId?: string) => {
      if (!projectId) return TEXT.projectUnassigned;
      return projectNameById[projectId] ?? TEXT.projectUnknown;
    };

    parentGroups.forEach(parent => {
      const projectId = parent.projectId ?? PROJECT_UNASSIGNED_ID;
      if (!map.has(projectId)) {
        map.set(projectId, {
          id: projectId,
          title: resolveProjectTitle(parent.projectId),
          phases: [],
        });
      }
      const projectGroup = map.get(projectId)!;
      let phaseGroup = projectGroup.phases.find(phase => phase.id === parent.phaseId);
      if (!phaseGroup) {
        phaseGroup = {
          id: parent.phaseId,
          title: TEXT.phasePlaceholder,
          parents: [],
        };
        projectGroup.phases.push(phaseGroup);
      }
      phaseGroup.parents.push(parent);
    });

    const projects = Array.from(map.values());
    projects.forEach(project => {
      project.phases.forEach(phase => {
        phase.parents.sort((a, b) => {
          if (a.aggregate.startIndex !== b.aggregate.startIndex) {
            return a.aggregate.startIndex - b.aggregate.startIndex;
          }
          return a.title.localeCompare(b.title);
        });
      });
    });

    projects.sort((a, b) => {
      if (a.id === PROJECT_UNASSIGNED_ID) return 1;
      if (b.id === PROJECT_UNASSIGNED_ID) return -1;
      return a.title.localeCompare(b.title);
    });

    return projects;
  }, [parentGroups, projectNameById]);

  const parentIdSet = useMemo(() => {
    const set = new Set<string>();
    parentGroups.forEach(group => set.add(group.id));
    return set;
  }, [parentGroups]);

  const visibleExpandedParents = useMemo(() => {
    const next = new Set<string>();
    expandedParents.forEach(id => {
      if (parentIdSet.has(id)) next.add(id);
    });
    return next;
  }, [expandedParents, parentIdSet]);

  const rows = useMemo(() => {
    const result: GanttRow[] = [];
    projectGroups.forEach(project => {
      result.push({
        type: 'project',
        id: project.id,
        title: project.title,
        depth: 0,
      });
      project.phases.forEach(phase => {
        result.push({
          type: 'phase',
          id: `${project.id}:${phase.id}`,
          title: phase.title,
          depth: 1,
        });
        phase.parents.forEach(parent => {
          const isExpanded = visibleExpandedParents.has(parent.id);
          result.push({
            type: 'parent',
            id: parent.id,
            title: parent.title,
            depth: 2,
            bar: parent.aggregate,
            childCount: parent.childCount,
            isExpanded,
          });
          if (isExpanded) {
            parent.children.forEach((child) => {
              const stepNumber = child.orderInParent;
              result.push({
                type: 'task',
                id: child.id,
                title: child.title,
                depth: 3,
                bar: child,
                stepNumber,
              });
            });
          }
        });
      });
    });
    return result;
  }, [projectGroups, visibleExpandedParents]);

  const getBarClass = (bar: GanttBar, isAggregate: boolean) => {
    const classes = ['gantt-bar'];
    if (isAggregate) classes.push('aggregate');
    if (bar.status === 'DONE') classes.push('done');
    if (bar.isFixedTime) classes.push('meeting');
    if (bar.isSplit) classes.push('split');
    return classes.join(' ');
  };

  const toggleParent = (parentId: string) => {
    setExpandedParents(prev => {
      const next = new Set(prev);
      if (next.has(parentId)) {
        next.delete(parentId);
      } else {
        next.add(parentId);
      }
      return next;
    });
  };

  if (days.length === 0) {
    return <div className="gantt-empty">{TEXT.empty}</div>;
  }

  return (
    <div
      className="gantt-container"
      style={{ '--days': dayMeta.length } as CSSProperties}
    >
      <div className="gantt-header">
        <div className="gantt-header-label gantt-tree-cell">{TEXT.taskLabel}</div>
        {dayMeta.map(day => (
          <div
            key={day.date}
            className={[
              'gantt-header-day',
              day.isWeekend ? 'weekend' : '',
              day.isToday ? 'today' : '',
              day.isOffDay ? 'offday' : '',
            ].join(' ')}
          >
            <span className="gantt-day-label">{day.label}</span>
            <span className="gantt-weekday">{day.weekday}</span>
          </div>
        ))}
      </div>

      <div className="gantt-body">
        {rows.map(row => {
          const rowKey = `${row.type}-${row.id}`;
          const hasBar = row.type === 'parent' || row.type === 'task';
          const bar = hasBar ? row.bar : null;
          const stepNumber = row.type === 'task' ? row.stepNumber : undefined;
          const clickableId = row.type === 'task'
            ? row.id
            : row.type === 'parent'
              ? row.bar.taskId
              : undefined;
          const isClickable = Boolean(clickableId && onTaskClick);
          const isDone = bar?.status === 'DONE';

          return (
            <div
              key={rowKey}
              className={[
                'gantt-row',
                row.type,
                hasBar ? 'has-bar' : 'no-bar',
                isDone ? 'done' : '',
              ].join(' ')}
            >
              <div
                className={[
                  'gantt-tree-cell',
                  isClickable ? 'clickable' : '',
                  isDone ? 'done' : '',
                ].join(' ')}
                style={{ '--depth': row.depth } as CSSProperties}
                onClick={isClickable ? () => onTaskClick?.(clickableId!) : undefined}
                role={isClickable ? 'button' : undefined}
                title={row.title}
              >
                {row.type === 'parent' && row.childCount > 0 && (
                  <button
                    type="button"
                    className="gantt-toggle"
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleParent(row.id);
                    }}
                    aria-label={row.isExpanded ? TEXT.closeSubtasks : TEXT.openSubtasks}
                    aria-expanded={row.isExpanded}
                  >
                    {row.isExpanded ? <FaChevronDown /> : <FaChevronRight />}
                  </button>
                )}
                {row.type === 'parent' && row.childCount === 0 && (
                  <span className="gantt-toggle-placeholder" />
                )}
                {row.type === 'task' && row.bar.isFixedTime && (
                  <span className="gantt-meeting-icon">📅</span>
                )}
                {row.type === 'task' && stepNumber != null && (
                  <StepNumber stepNumber={stepNumber} className="small" />
                )}
                <span className="gantt-task-title">{row.title}</span>
                {row.type === 'parent' && row.childCount > 0 && (
                  <span className="gantt-subtask-count">{row.childCount}{TEXT.countUnit}</span>
                )}
              </div>
              <div className="gantt-task-bars">
                <div className="gantt-day-grid">
                  {dayMeta.map(day => (
                    <span
                      key={`${rowKey}-${day.date}`}
                      className={[
                        'gantt-day-cell',
                        day.isWeekend ? 'weekend' : '',
                        day.isToday ? 'today' : '',
                        day.isOffDay ? 'offday' : '',
                      ].join(' ')}
                    />
                  ))}
                </div>
                {bar && (
                  <div className="gantt-bar-layer">
                    <div
                      className={getBarClass(bar, row.type === 'parent')}
                      style={{
                        gridColumn: `${bar.startIndex + 1} / ${bar.endIndex + 2}`,
                      }}
                      onClick={
                        isClickable
                          ? () => onTaskClick?.(clickableId!)
                          : undefined
                      }
                      title={`${row.title} (${bar.progress}%)`}
                    >
                      {bar.progress > 0 && bar.status !== 'DONE' && (
                        <div
                          className="gantt-bar-progress"
                          style={{ width: `${bar.progress}%` }}
                        />
                      )}
                    </div>
                  </div>
                )}
                <div className="gantt-offday-overlay">
                  {dayMeta.map((day, index) => (
                    // Render offday background OR today highlight
                    (day.isOffDay || day.isToday) ? (
                      <span
                        key={`${rowKey}-${day.date}-overlay`}
                        className={[
                          'gantt-day-overlay',
                          day.isOffDay ? 'offday' : '',
                          day.isToday ? 'today' : '',
                        ].join(' ')}
                        style={{ gridColumn: `${index + 1} / ${index + 2}` }}
                      />
                    ) : null
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
