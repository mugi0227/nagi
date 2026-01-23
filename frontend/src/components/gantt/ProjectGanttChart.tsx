/**
 * ProjectGanttChart - カスタムプロジェクトガントチャート
 *
 * 機能:
 * - フェーズ → マイルストーン → タスクの階層表示
 * - バッファの可視化（フェーズ単位）
 * - 依存関係の矢印表示
 * - ドラッグ&ドロップでバー移動
 * - 日/週/月表示モード
 * - 月ヘッダー表示
 */

import React, { useMemo, useState, useCallback, useRef, useEffect, useLayoutEffect } from 'react';
import type { CSSProperties } from 'react';
import { DateTime } from 'luxon';
import { FaChevronDown, FaChevronRight, FaExpand, FaCompress, FaPlus, FaLink, FaSort } from 'react-icons/fa';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverEvent,
  useDroppable,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type {
  Task,
  Phase,
  Milestone,
  TaskUpdate,
} from '../../api/types';
import { useTimezone } from '../../hooks/useTimezone';
import { toDateKey, toDateTime, todayInTimezone } from '../../utils/dateTime';
import './ProjectGanttChart.css';

// ============================================
// Types
// ============================================

type ViewMode = 'day' | 'week' | 'month';
type BufferStatus = 'healthy' | 'warning' | 'critical';

interface ProjectGanttChartProps {
  tasks: Task[];
  phases: Phase[];
  milestones: Milestone[];
  onTaskUpdate?: (taskId: string, updates: { start_not_before?: string; due_date?: string }) => void;
  onPhaseUpdate?: (phaseId: string, updates: { start_date?: string; end_date?: string }) => void;
  onMilestoneUpdate?: (milestoneId: string, updates: { due_date?: string }) => void;
  onTaskClick?: (taskId: string) => void;
  onTaskCreate?: (phaseId?: string) => void;
  onBatchTaskUpdate?: (updates: Array<{ taskId: string; updates: Partial<TaskUpdate> }>) => void;
  onDependencyUpdate?: (taskId: string, newDependencyIds: string[]) => void;
  onMilestoneLink?: (taskId: string, milestoneId: string | null) => void;
  className?: string;
}

interface GanttBar {
  startIndex: number;
  endIndex: number;
  progress: number;
  status: string;
}

interface GanttRow {
  type: 'phase' | 'milestone' | 'task' | 'buffer';
  id: string;
  title: string;
  depth: number;
  phaseId?: string;
  bar?: GanttBar;
  bufferStatus?: BufferStatus;
  bufferPercentage?: number;
  bufferType?: 'ccpm' | 'fixed';
  milestoneDate?: DateTime;
  dependencyIds?: string[];
  isExpanded?: boolean;
  childCount?: number;
  linkedMilestoneId?: string;  // For tasks linked to milestones
  linkedMilestoneDateIndex?: number;  // Date index of the linked milestone (for visual marker)
  hasNoDate?: boolean;  // For undated items
}

interface MonthHeader {
  label: string;
  startIndex: number;
  span: number;
}

// ============================================
// Helpers
// ============================================

const formatMonthYear = (date: DateTime): string => {
  return date.setLocale('ja-JP').toLocaleString({ year: 'numeric', month: 'long' });
};

const formatDayLabel = (date: DateTime): string => {
  return date.day.toString();
};

const formatWeekday = (date: DateTime): string => {
  return date.setLocale('ja-JP').toLocaleString({ weekday: 'short' });
};

const isWeekend = (date: DateTime): boolean => {
  return date.weekday === 6 || date.weekday === 7;
};

const isToday = (date: DateTime, today: DateTime): boolean => {
  return date.hasSame(today, 'day');
};

const getBufferStatusColor = (status: BufferStatus): string => {
  switch (status) {
    case 'critical': return '#ef4444';
    case 'warning': return '#f59e0b';
    default: return '#10b981';
  }
};

const generateDateRange = (startDate: DateTime, days: number): DateTime[] => {
  const result: DateTime[] = [];
  let current = startDate.startOf('day');
  for (let i = 0; i < days; i++) {
    result.push(current);
    current = current.plus({ days: 1 });
  }
  return result;
};

// ============================================
// Droppable + Sortable Milestone Row Component
// ============================================

interface DroppableMilestoneRowProps {
  row: GanttRow;
  isDropTarget: boolean;
}

const DroppableMilestoneRow: React.FC<DroppableMilestoneRowProps> = ({
  row,
  isDropTarget,
}) => {
  // Use droppable for accepting tasks
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: `milestone-drop-${row.id}`,
    data: { type: 'milestone', milestoneId: row.id },
  });

  // Use sortable for reordering milestones
  const {
    attributes,
    listeners,
    setNodeRef: setSortableRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: row.id,
  });

  // Combine refs
  const setNodeRef = useCallback((node: HTMLElement | null) => {
    setDroppableRef(node);
    setSortableRef(node);
  }, [setDroppableRef, setSortableRef]);

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    '--depth': row.depth,
  } as CSSProperties;

  const classNames = [
    'pgantt-sidebar-row',
    'milestone',
    `depth-${row.depth}`,
    'draggable',
    isOver || isDropTarget ? 'drop-target' : '',
    isDragging ? 'dragging' : '',
    row.hasNoDate ? 'no-date' : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={classNames}
      {...attributes}
      {...listeners}
    >
      <span className="pgantt-milestone-icon">◆</span>
      {row.hasNoDate && <span className="pgantt-no-date-icon" title="期限未設定">⚠</span>}
      <span className="pgantt-row-title" title={row.title}>{row.title}</span>
    </div>
  );
};

// ============================================
// Sortable Row Component
// ============================================

interface SortableSidebarRowProps {
  row: GanttRow;
  isLinkMode: boolean;
  linkSourceTask: string | null;
  onTogglePhase: (phaseId: string) => void;
  onLinkModeClick: (taskId: string) => void;
  onTaskClick?: (taskId: string) => void;
  onTaskCreate?: (phaseId?: string) => void;
  isDragDisabled: boolean;
  isDropTarget?: boolean;  // For milestone drop target highlighting
}

const SortableSidebarRow: React.FC<SortableSidebarRowProps> = ({
  row,
  isLinkMode,
  linkSourceTask,
  onTogglePhase,
  onLinkModeClick,
  onTaskClick,
  onTaskCreate,
  isDragDisabled,
  isDropTarget,
}) => {
  // Tasks and milestones are draggable for reordering
  const isDraggableType = row.type === 'task' || row.type === 'milestone';
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: row.id,
    disabled: isDragDisabled || !isDraggableType,
  });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    '--depth': row.depth,
  } as CSSProperties;

  const handleClick = () => {
    if (row.type === 'phase') {
      onTogglePhase(row.id);
    } else if (row.type === 'task' && isLinkMode) {
      onLinkModeClick(row.id);
    } else if (row.type === 'task' && onTaskClick) {
      onTaskClick(row.id);
    }
  };

  // Tasks and milestones are fully draggable (not just via handle)
  // In link mode, disable task drag to allow clicks for linking
  const canDrag = isDraggableType && !isDragDisabled && !(row.type === 'task' && isLinkMode);
  const dragProps = canDrag ? { ...attributes, ...listeners } : {};

  const classNames = [
    'pgantt-sidebar-row',
    row.type,
    `depth-${row.depth}`,
    row.type === 'task' ? 'clickable' : '',
    isDraggableType ? 'draggable' : '',
    row.linkedMilestoneId ? 'milestone-linked' : '',
    isLinkMode && linkSourceTask === row.id ? 'link-source' : '',
    isDragging ? 'dragging' : '',
    isDropTarget ? 'drop-target' : '',
    row.hasNoDate ? 'no-date' : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={classNames}
      onClick={handleClick}
      {...dragProps}
    >
      {row.type === 'phase' && (
        <span className="pgantt-toggle">
          {row.isExpanded ? <FaChevronDown size={10} /> : <FaChevronRight size={10} />}
        </span>
      )}
      {row.type === 'milestone' && <span className="pgantt-milestone-icon">◆</span>}
      {row.linkedMilestoneId && <span className="pgantt-linked-icon">└</span>}
      {row.hasNoDate && <span className="pgantt-no-date-icon" title="期限未設定">⚠</span>}
      <span className="pgantt-row-title" title={row.title}>{row.title}</span>
      {row.childCount !== undefined && row.childCount > 0 && (
        <span className="pgantt-child-count">{row.childCount}</span>
      )}
      {row.type === 'phase' && onTaskCreate && (
        <button
          className="pgantt-add-task-btn"
          onClick={(e) => {
            e.stopPropagation();
            onTaskCreate(row.id === 'unassigned' ? undefined : row.id);
          }}
          title="タスクを追加"
        >
          <FaPlus size={10} />
        </button>
      )}
    </div>
  );
};

// ============================================
// Component
// ============================================

export const ProjectGanttChart: React.FC<ProjectGanttChartProps> = ({
  tasks,
  phases,
  milestones,
  onTaskUpdate,
  onPhaseUpdate,
  onMilestoneUpdate,
  onTaskClick,
  onTaskCreate,
  onBatchTaskUpdate,
  onDependencyUpdate,
  onMilestoneLink,
  className,
}) => {
  const timezone = useTimezone();
  const today = useMemo(() => todayInTimezone(timezone), [timezone]);
  const [viewMode, setViewMode] = useState<ViewMode>('day');
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(() => new Set(phases.map(p => p.id)));
  const [showTaskList, setShowTaskList] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Phase 3: Task reordering state (frontend-only session state)
  const [taskOrderMap, setTaskOrderMap] = useState<Map<string, number>>(new Map());
  // Milestone reordering state (frontend-only session state)
  const [milestoneOrderMap, setMilestoneOrderMap] = useState<Map<string, number>>(new Map());

  // Phase 5: Link mode state
  const [isLinkMode, setIsLinkMode] = useState<boolean>(false);
  const [linkSourceTask, setLinkSourceTask] = useState<string | null>(null);

  // Phase 6: Milestone drop target state
  const [dropTargetMilestone, setDropTargetMilestone] = useState<string | null>(null);

  // Dependency deletion confirmation state
  const [pendingDeleteArrow, setPendingDeleteArrow] = useState<{ fromId: string; toId: string; x: number; y: number } | null>(null);

  // Dnd-kit sensors for sidebar reordering
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Require 8px drag before activating
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const [dragState, setDragState] = useState<{
    rowId: string;
    type: 'move' | 'resize-start' | 'resize-end';
    startX: number;
    originalStart: number;
    originalEnd: number;
    previewStart: number;
    previewEnd: number;
    // Dependent tasks preview (taskId -> { startDelta, endDelta })
    dependentPreviews: Map<string, { originalStart: number; originalEnd: number; previewStart: number; previewEnd: number }>;
  } | null>(null);

  const parseDate = useCallback(
    (dateStr: string | undefined): DateTime | null => {
      if (!dateStr) return null;
      const parsed = toDateTime(dateStr, timezone).startOf('day');
      return parsed.isValid ? parsed : null;
    },
    [timezone],
  );

  // 日付範囲の計算（前後3ヶ月 = 約180日）
  const dateRange = useMemo(() => {
    const allDates: DateTime[] = [];

    // フェーズの日付
    phases.forEach(p => {
      const start = parseDate(p.start_date);
      const end = parseDate(p.end_date);
      if (start) allDates.push(start);
      if (end) allDates.push(end);
    });

    // マイルストーンの日付
    milestones.forEach(m => {
      const due = parseDate(m.due_date);
      if (due) allDates.push(due);
    });

    // タスクの日付
    tasks.forEach(t => {
      const due = parseDate(t.due_date);
      const start = parseDate(t.start_not_before);
      if (due) allDates.push(due);
      if (start) allDates.push(start);
    });

    if (allDates.length === 0) {
      allDates.push(today);
    }

    const minMillis = Math.min(...allDates.map(d => d.toMillis()));
    const maxMillis = Math.max(...allDates.map(d => d.toMillis()));
    const minDate = DateTime.fromMillis(minMillis, { zone: timezone }).startOf('day');
    const maxDate = DateTime.fromMillis(maxMillis, { zone: timezone }).startOf('day');

    // 前後に余裕を持たせる（前1ヶ月、後2ヶ月）
    const rangeStart = minDate.minus({ days: 30 });
    const rangeEnd = maxDate.plus({ days: 60 });

    const days = Math.ceil(rangeEnd.diff(rangeStart, 'days').days) + 1;
    return generateDateRange(rangeStart, Math.max(days, 90));
  }, [phases, milestones, tasks, parseDate, timezone, today]);

  // 月ヘッダーの計算
  const monthHeaders = useMemo((): MonthHeader[] => {
    const headers: MonthHeader[] = [];
    let currentMonthKey = '';
    let startIndex = 0;

    dateRange.forEach((date, index) => {
      const monthKey = `${date.year}-${date.month}`;

      if (monthKey !== currentMonthKey) {
        if (currentMonthKey) {
          headers.push({
            label: formatMonthYear(dateRange[startIndex].startOf('month')),
            startIndex,
            span: index - startIndex,
          });
        }
        currentMonthKey = monthKey;
        startIndex = index;
      }
    });

    // ????????E????????????
    if (currentMonthKey) {
      headers.push({
        label: formatMonthYear(dateRange[startIndex].startOf('month')),
        startIndex,
        span: dateRange.length - startIndex,
      });
    }

    return headers;
  }, [dateRange]);

  // 日付→インデックスのマップ
  const dateIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    dateRange.forEach((date, index) => {
      const dateKey = date.toISODate();
      if (dateKey) {
        map.set(dateKey, index);
      }
    });
    return map;
  }, [dateRange]);

  // 日付文字列からインデックスを取得
  const getDateIndex = useCallback((dateStr: string | undefined): number => {
    if (!dateStr) return -1;
    const normalized = toDateKey(dateStr, timezone);
    return dateIndexMap.get(normalized) ?? -1;
  }, [dateIndexMap, timezone]);

  // Phase 4: Helper to find all dependent tasks recursively
  const findAllDependentTasks = useCallback((taskId: string, allTasks: Task[]): Task[] => {
    const dependents: Task[] = [];
    const visited = new Set<string>();

    const findDeps = (id: string) => {
      for (const task of allTasks) {
        if (task.dependency_ids?.includes(id) && !visited.has(task.id)) {
          visited.add(task.id);
          dependents.push(task);
          findDeps(task.id); // Recursively find dependents of dependents
        }
      }
    };

    findDeps(taskId);
    return dependents;
  }, []);

  // タスクをフェーズでグループ化
  const tasksByPhase = useMemo(() => {
    const map = new Map<string, Task[]>();
    tasks.forEach(t => {
      const phaseId = t.phase_id || 'unassigned';
      const list = map.get(phaseId) || [];
      list.push(t);
      map.set(phaseId, list);
    });
    return map;
  }, [tasks]);


  // マイルストーンをフェーズでグループ化
  const milestonesByPhase = useMemo(() => {
    const map = new Map<string, Milestone[]>();
    milestones.forEach(m => {
      const list = map.get(m.phase_id) || [];
      list.push(m);
      map.set(m.phase_id, list);
    });
    return map;
  }, [milestones]);

  // 行データの構築
  const rows = useMemo((): GanttRow[] => {
    const result: GanttRow[] = [];

    // フェーズ順にソート
    const sortedPhases = [...phases].sort((a, b) => a.order_in_project - b.order_in_project);

    sortedPhases.forEach(phase => {
      const isExpanded = expandedPhases.has(phase.id);
      const phaseTasks = tasksByPhase.get(phase.id) || [];
      const phaseMilestones = milestonesByPhase.get(phase.id) || [];

      // フェーズの日付範囲を計算
      let startIndex = -1;
      let endIndex = -1;

      if (phase.start_date && phase.end_date) {
        startIndex = getDateIndex(phase.start_date);
        endIndex = getDateIndex(phase.end_date);
      }

      // タスクとマイルストーンから推定（フェーズ日付がない場合）
      if (startIndex === -1 || endIndex === -1) {
        const indices: number[] = [];
        phaseTasks.forEach(t => {
          const si = getDateIndex(t.start_not_before);
          const ei = getDateIndex(t.due_date);
          if (si >= 0) indices.push(si);
          if (ei >= 0) indices.push(ei);
        });
        phaseMilestones.forEach(m => {
          const mi = getDateIndex(m.due_date);
          if (mi >= 0) indices.push(mi);
        });
        if (indices.length > 0) {
          startIndex = Math.min(...indices);
          endIndex = Math.max(...indices);
        } else {
          // デフォルト: 今日から2週間
          const todayIdx = dateIndexMap.get(today.toISODate() ?? '') ?? 0;
          startIndex = todayIdx;
          endIndex = todayIdx + 14;
        }
      }

      // 進捗計算
      const completedTasks = phaseTasks.filter(t => t.status === 'DONE').length;
      const progress = phaseTasks.length > 0 ? (completedTasks / phaseTasks.length) * 100 : 0;

      // フェーズ行
      result.push({
        type: 'phase',
        id: phase.id,
        title: phase.name,
        depth: 0,
        phaseId: phase.id,
        bar: { startIndex, endIndex, progress, status: 'phase' },
        isExpanded,
        childCount: phaseTasks.filter(t => !t.parent_id).length + phaseMilestones.length,
      });

      if (isExpanded) {
        // マイルストーン（ソート済み - カスタム順があれば優先、なければ期限順）
        const sortedMilestones = [...phaseMilestones].sort((a, b) => {
          const orderA = milestoneOrderMap.get(a.id);
          const orderB = milestoneOrderMap.get(b.id);

          // If both have custom order, use it
          if (orderA !== undefined && orderB !== undefined) {
            return orderA - orderB;
          }
          // If neither has custom order, sort by due_date
          if (orderA === undefined && orderB === undefined) {
            const dateA = parseDate(a.due_date)?.toMillis() ?? Infinity;
            const dateB = parseDate(b.due_date)?.toMillis() ?? Infinity;
            return dateA - dateB;
          }
          // Milestones with custom order come first
          return orderA !== undefined ? -1 : 1;
        });

        // 親タスク（サブタスクを持つか、親がないタスク）
        const parentTasks = phaseTasks.filter(t => !t.parent_id);

        // Phase 3 & 6: Sort tasks by custom order (taskOrderMap), fallback to due_date
        const sortedTasks = [...parentTasks].sort((a, b) => {
          const orderA = taskOrderMap.get(a.id);
          const orderB = taskOrderMap.get(b.id);

          // If both have custom order, use it
          if (orderA !== undefined && orderB !== undefined) {
            return orderA - orderB;
          }
          // If neither has custom order, sort by due_date
          if (orderA === undefined && orderB === undefined) {
            const dateA = parseDate(a.due_date)?.toMillis() ?? Infinity;
            const dateB = parseDate(b.due_date)?.toMillis() ?? Infinity;
            return dateA - dateB;
          }
          // Tasks with custom order come first
          return orderA !== undefined ? -1 : 1;
        });

        // Phase 6: Separate tasks linked to milestones
        const tasksLinkedToMilestones = new Map<string, Task[]>();
        const unlinkedTasks: Task[] = [];
        sortedTasks.forEach(task => {
          if (task.milestone_id) {
            const list = tasksLinkedToMilestones.get(task.milestone_id) || [];
            list.push(task);
            tasksLinkedToMilestones.set(task.milestone_id, list);
          } else {
            unlinkedTasks.push(task);
          }
        });

        // Add milestones with their linked tasks
        sortedMilestones.forEach(milestone => {
          const idx = getDateIndex(milestone.due_date);
          const hasNoDate = !milestone.due_date;
          // For undated milestones, show at today's position
          const todayIdx = dateIndexMap.get(today.toISODate() ?? '') ?? 0;
          const displayIdx = hasNoDate ? todayIdx : idx;

          // Always add milestone to rows (sidebar), even if date is out of range
          result.push({
            type: 'milestone',
            id: milestone.id,
            title: milestone.title,
            depth: 1,
            phaseId: phase.id,
            // bar is set for both dated and undated milestones
            bar: displayIdx >= 0
              ? { startIndex: displayIdx, endIndex: displayIdx, progress: milestone.status === 'COMPLETED' ? 100 : 0, status: 'milestone' }
              : undefined,
            milestoneDate: parseDate(milestone.due_date) || undefined,
            hasNoDate,
          });

          // Add tasks linked to this milestone (indented)
          const linkedTasks = tasksLinkedToMilestones.get(milestone.id) || [];
          linkedTasks.forEach(task => {
            const estimatedMinutes = task.estimated_minutes || 60;
            const startDateStr = task.start_not_before || task.created_at;
            let taskStartIndex = getDateIndex(startDateStr);
            let taskEndIndex = getDateIndex(task.due_date);
            const hasNoDate = !task.due_date && !task.start_not_before;

            // For undated tasks, show at today's position
            if (hasNoDate) {
              const todayIdx = dateIndexMap.get(today.toISODate() ?? '') ?? 0;
              taskStartIndex = todayIdx;
              taskEndIndex = todayIdx + 1;
            } else {
              if (taskStartIndex < 0 && taskEndIndex >= 0) {
                const estimatedDays = Math.max(1, Math.ceil(estimatedMinutes / (8 * 60)));
                taskStartIndex = Math.max(0, taskEndIndex - estimatedDays + 1);
              }
              if (taskEndIndex < 0) {
                taskEndIndex = taskStartIndex >= 0 ? taskStartIndex + 1 : -1;
              }
              if (taskStartIndex < 0) taskStartIndex = taskEndIndex;
              if (taskStartIndex < 0 || taskEndIndex < 0) return;
            }

            const subtasks = phaseTasks.filter(t => t.parent_id === task.id);

            result.push({
              type: 'task',
              id: task.id,
              title: task.title,
              depth: 2, // Extra indentation for milestone-linked tasks
              phaseId: phase.id,
              bar: {
                startIndex: Math.min(taskStartIndex, taskEndIndex),
                endIndex: Math.max(taskStartIndex, taskEndIndex),
                progress: task.progress ?? (task.status === 'DONE' ? 100 : 0),
                status: task.status,
              },
              dependencyIds: task.dependency_ids,
              childCount: subtasks.length > 0 ? subtasks.length : undefined,
              linkedMilestoneId: milestone.id,
              linkedMilestoneDateIndex: displayIdx >= 0 ? displayIdx : undefined,
              hasNoDate,
            });
          });
        });

        // Add unlinked tasks
        unlinkedTasks.forEach(task => {
            const estimatedMinutes = task.estimated_minutes || 60;

            // 着手日（start_not_before）または作成日（created_at）から期限（due_date）を表示
            const startDateStr = task.start_not_before || task.created_at;
            let taskStartIndex = getDateIndex(startDateStr);
            let taskEndIndex = getDateIndex(task.due_date);
            const hasNoDate = !task.due_date && !task.start_not_before;

            // For undated tasks, show at today's position
            if (hasNoDate) {
              const todayIdx = dateIndexMap.get(today.toISODate() ?? '') ?? 0;
              taskStartIndex = todayIdx;
              taskEndIndex = todayIdx + 1;
            } else {
              // 開始日がなく期限がある場合、見積時間から逆算
              if (taskStartIndex < 0 && taskEndIndex >= 0) {
                const estimatedDays = Math.max(1, Math.ceil(estimatedMinutes / (8 * 60)));
                taskStartIndex = Math.max(0, taskEndIndex - estimatedDays + 1);
              }

              // 期限がない場合、開始日+1
              if (taskEndIndex < 0) {
                taskEndIndex = taskStartIndex >= 0 ? taskStartIndex + 1 : -1;
              }

              if (taskStartIndex < 0) taskStartIndex = taskEndIndex;

              if (taskStartIndex < 0 || taskEndIndex < 0) return;
            }

            const subtasks = phaseTasks.filter(t => t.parent_id === task.id);
            const hasSubtasks = subtasks.length > 0;

            result.push({
              type: 'task',
              id: task.id,
              title: task.title,
              depth: 1,
              phaseId: phase.id,
              bar: {
                startIndex: Math.min(taskStartIndex, taskEndIndex),
                endIndex: Math.max(taskStartIndex, taskEndIndex),
                progress: task.progress ?? (task.status === 'DONE' ? 100 : 0),
                status: task.status,
              },
              dependencyIds: task.dependency_ids,
              childCount: hasSubtasks ? subtasks.length : undefined,
              hasNoDate,
            });
          });
      }
    });

    // 未割当タスク
    const unassignedTasks = tasks.filter(t => !t.phase_id && !t.parent_id);
    if (unassignedTasks.length > 0) {
      const isExpanded = expandedPhases.has('unassigned');

      // 未割当タスクの日付範囲
      const indices: number[] = [];
      unassignedTasks.forEach(t => {
        const si = getDateIndex(t.start_not_before);
        const ei = getDateIndex(t.due_date);
        if (si >= 0) indices.push(si);
        if (ei >= 0) indices.push(ei);
      });
      const minIdx = indices.length > 0 ? Math.min(...indices) : 0;
      const maxIdx = indices.length > 0 ? Math.max(...indices) : dateRange.length - 1;

      result.push({
        type: 'phase',
        id: 'unassigned',
        title: '📋 未割当タスク',
        depth: 0,
        bar: { startIndex: minIdx, endIndex: maxIdx, progress: 0, status: 'unassigned' },
        isExpanded,
        childCount: unassignedTasks.length,
      });

      if (isExpanded) {
        unassignedTasks.forEach(task => {
          let taskStartIndex = getDateIndex(task.start_not_before);
          let taskEndIndex = getDateIndex(task.due_date);
          const hasNoDate = !task.due_date && !task.start_not_before;

          // For undated tasks, show at today's position
          if (hasNoDate) {
            const todayIdx = dateIndexMap.get(today.toISODate() ?? '') ?? 0;
            taskStartIndex = todayIdx;
            taskEndIndex = todayIdx + 1;
          } else {
            if (taskStartIndex < 0 && taskEndIndex >= 0) {
              const estimatedDays = Math.max(1, Math.ceil((task.estimated_minutes || 60) / (8 * 60)));
              taskStartIndex = Math.max(0, taskEndIndex - estimatedDays + 1);
            }
            if (taskEndIndex < 0 && taskStartIndex >= 0) {
              taskEndIndex = taskStartIndex + 1;
            }
            if (taskStartIndex < 0) taskStartIndex = 0;
            if (taskEndIndex < 0) taskEndIndex = 1;
          }

          result.push({
            type: 'task',
            id: task.id,
            title: task.title,
            depth: 1,
            bar: {
              startIndex: Math.min(taskStartIndex, taskEndIndex),
              endIndex: Math.max(taskStartIndex, taskEndIndex),
              progress: task.progress ?? (task.status === 'DONE' ? 100 : 0),
              status: task.status,
            },
            dependencyIds: task.dependency_ids,
            hasNoDate,
          });
        });
      }
    }

    return result;
  }, [phases, tasks, milestones, expandedPhases, tasksByPhase, milestonesByPhase, dateRange, getDateIndex, dateIndexMap, taskOrderMap, milestoneOrderMap, parseDate, today]);

  // 依存関係の矢印データ
  const dependencyArrows = useMemo(() => {
    const arrows: { fromId: string; toId: string; fromIndex: number; toIndex: number; fromRow: number; toRow: number }[] = [];
    const rowIndexMap = new Map<string, number>();
    rows.forEach((row, index) => rowIndexMap.set(row.id, index));

    rows.forEach((row, rowIndex) => {
      if (row.type === 'task' && row.dependencyIds && row.bar) {
        const currentBar = row.bar;
        row.dependencyIds.forEach(depId => {
          const depRowIndex = rowIndexMap.get(depId);
          const depRow = rows.find(r => r.id === depId);
          if (depRowIndex !== undefined && depRow?.bar) {
            arrows.push({
              fromId: depId,
              toId: row.id,
              fromIndex: depRow.bar.endIndex,
              toIndex: currentBar.startIndex,
              fromRow: depRowIndex,
              toRow: rowIndex,
            });
          }
        });
      }
    });

    return arrows;
  }, [rows]);

  // 1日あたりの幅（ビューモードに応じて変化）
  const dayWidth = useMemo(() => {
    return viewMode === 'day' ? 40 : viewMode === 'week' ? 16 : 6;
  }, [viewMode]);

  // フェーズ展開/折りたたみ
  const togglePhase = useCallback((phaseId: string) => {
    setExpandedPhases(prev => {
      const next = new Set(prev);
      if (next.has(phaseId)) {
        next.delete(phaseId);
      } else {
        next.add(phaseId);
      }
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    const allIds = new Set(phases.map(p => p.id));
    if (tasks.some(t => !t.phase_id)) allIds.add('unassigned');
    setExpandedPhases(allIds);
  }, [phases, tasks]);

  const collapseAll = useCallback(() => {
    setExpandedPhases(new Set());
  }, []);

  // Phase 3: Sort tasks by due date (one-time action)
  // Groups by milestone, then sorts by due_date within each group
  const sortTasksByDueDate = useCallback(() => {
    // Group tasks by milestone_id
    const unlinkedTasks: Task[] = [];
    const tasksByMilestone = new Map<string, Task[]>();

    tasks.forEach(task => {
      if (task.milestone_id) {
        const list = tasksByMilestone.get(task.milestone_id) || [];
        list.push(task);
        tasksByMilestone.set(task.milestone_id, list);
      } else {
        unlinkedTasks.push(task);
      }
    });

    // Sort each group by due_date
    const sortByDue = (a: Task, b: Task) => {
      const dateA = a.due_date ? new Date(a.due_date).getTime() : Infinity;
      const dateB = b.due_date ? new Date(b.due_date).getTime() : Infinity;
      return dateA - dateB;
    };

    unlinkedTasks.sort(sortByDue);
    tasksByMilestone.forEach(list => list.sort(sortByDue));

    // Build ordered list: milestones in order, then unlinked tasks
    const orderedTasks: Task[] = [];

    // Add tasks grouped by milestone (milestone order based on milestone due_date)
    const sortedMilestoneIds = Array.from(tasksByMilestone.keys()).sort((a, b) => {
      const msA = milestones.find(m => m.id === a);
      const msB = milestones.find(m => m.id === b);
      const dateA = msA?.due_date ? new Date(msA.due_date).getTime() : Infinity;
      const dateB = msB?.due_date ? new Date(msB.due_date).getTime() : Infinity;
      return dateA - dateB;
    });

    sortedMilestoneIds.forEach(milestoneId => {
      const tasksInMilestone = tasksByMilestone.get(milestoneId) || [];
      orderedTasks.push(...tasksInMilestone);
    });

    // Add unlinked tasks at the end
    orderedTasks.push(...unlinkedTasks);

    // Update taskOrderMap
    const newOrderMap = new Map<string, number>();
    orderedTasks.forEach((task, index) => {
      newOrderMap.set(task.id, index);
    });
    setTaskOrderMap(newOrderMap);
  }, [tasks, milestones]);

  // Handle sidebar drag over for milestone highlighting
  const handleSidebarDragOver = useCallback((event: DragOverEvent) => {
    const { over } = event;
    if (over && String(over.id).startsWith('milestone-drop-')) {
      const milestoneId = (over.data.current as { milestoneId?: string })?.milestoneId;
      setDropTargetMilestone(milestoneId || null);
    } else {
      setDropTargetMilestone(null);
    }
  }, []);

  // Handle sidebar drag end for task/milestone reordering or milestone linking
  const handleSidebarDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;

    // Clear drop target
    setDropTargetMilestone(null);

    if (!over || active.id === over.id) return;

    // Check if dropping on a milestone (task -> milestone linking)
    if (String(over.id).startsWith('milestone-drop-')) {
      const milestoneId = (over.data.current as { milestoneId?: string })?.milestoneId;
      if (milestoneId && onMilestoneLink) {
        onMilestoneLink(active.id as string, milestoneId);
      }
      return;
    }

    // Determine if the dragged item is a task or milestone
    const activeRow = rows.find(r => r.id === active.id);
    const overRow = rows.find(r => r.id === over.id);

    if (!activeRow || !overRow) return;

    // Handle milestone reordering (milestone -> milestone)
    if (activeRow.type === 'milestone' && overRow.type === 'milestone') {
      const milestoneRows = rows.filter(r => r.type === 'milestone');
      const milestoneIds = milestoneRows.map(r => r.id);

      const oldIndex = milestoneIds.indexOf(active.id as string);
      const newIndex = milestoneIds.indexOf(over.id as string);

      if (oldIndex === -1 || newIndex === -1) return;

      // Reorder the array
      const reorderedIds = arrayMove(milestoneIds, oldIndex, newIndex);

      // Update the milestone order map
      const newOrderMap = new Map<string, number>();
      reorderedIds.forEach((id, index) => {
        newOrderMap.set(id, index);
      });
      setMilestoneOrderMap(newOrderMap);
      return;
    }

    // Handle task reordering (task -> task)
    if (activeRow.type === 'task' && overRow.type === 'task') {
      const taskRows = rows.filter(r => r.type === 'task');
      const taskIds = taskRows.map(r => r.id);

      const oldIndex = taskIds.indexOf(active.id as string);
      const newIndex = taskIds.indexOf(over.id as string);

      if (oldIndex === -1 || newIndex === -1) return;

      // Reorder the array
      const reorderedIds = arrayMove(taskIds, oldIndex, newIndex);

      // Update the task order map
      const newOrderMap = new Map<string, number>();
      reorderedIds.forEach((id, index) => {
        newOrderMap.set(id, index);
      });
      setTaskOrderMap(newOrderMap);
    }
  }, [rows, onMilestoneLink]);

  // Phase 5: Handle link mode task click
  const handleLinkModeClick = useCallback((taskId: string) => {
    if (!isLinkMode) return;

    if (!linkSourceTask) {
      // First click - select source
      setLinkSourceTask(taskId);
    } else if (linkSourceTask !== taskId) {
      // Second click - create dependency (source -> target)
      const targetTask = tasks.find(t => t.id === taskId);
      if (targetTask && onDependencyUpdate) {
        const newDependencies = [...(targetTask.dependency_ids || [])];
        if (!newDependencies.includes(linkSourceTask)) {
          newDependencies.push(linkSourceTask);
          onDependencyUpdate(taskId, newDependencies);
        }
      }
      setLinkSourceTask(null);
    }
  }, [isLinkMode, linkSourceTask, tasks, onDependencyUpdate]);

  // 今日の位置にスクロール
  useEffect(() => {
    if (scrollRef.current) {
      const todayIndex = dateIndexMap.get(today.toISODate() ?? '') ?? 0;
      const dayWidth = viewMode === 'day' ? 40 : viewMode === 'week' ? 16 : 6;
      const scrollPosition = Math.max(0, todayIndex * dayWidth - 200);
      scrollRef.current.scrollLeft = scrollPosition;
    }
  }, [dateIndexMap, viewMode]);

  // ドラッグ状態をrefで保持（最新の値にアクセスするため）
  const dragStateRef = useRef(dragState);
  useLayoutEffect(() => {
    dragStateRef.current = dragState;
  }, [dragState]);

  // ドラッグ中のイベントハンドラをrefで保持
  const handleMouseMoveRef = useRef<((e: MouseEvent) => void) | null>(null);
  const handleMouseUpRef = useRef<((e: MouseEvent) => void) | null>(null);

  // ドラッグ開始
  const handleDragStart = useCallback((
    e: React.MouseEvent,
    rowId: string,
    type: 'move' | 'resize-start' | 'resize-end',
    bar: GanttBar
  ) => {
    e.preventDefault();
    e.stopPropagation();

    // Find dependent tasks and their original positions for preview
    const dependentPreviews = new Map<string, { originalStart: number; originalEnd: number; previewStart: number; previewEnd: number }>();
    if (type === 'move') {
      const dependentTasks = findAllDependentTasks(rowId, tasks);
      dependentTasks.forEach(depTask => {
        const depRow = rows.find(r => r.id === depTask.id);
        if (depRow?.bar) {
          dependentPreviews.set(depTask.id, {
            originalStart: depRow.bar.startIndex,
            originalEnd: depRow.bar.endIndex,
            previewStart: depRow.bar.startIndex,
            previewEnd: depRow.bar.endIndex,
          });
        }
      });
    }

    const initialState = {
      rowId,
      type,
      startX: e.clientX,
      originalStart: bar.startIndex,
      originalEnd: bar.endIndex,
      previewStart: bar.startIndex,
      previewEnd: bar.endIndex,
      dependentPreviews,
    };

    setDragState(initialState);
    dragStateRef.current = initialState;

    // ドラッグ中のハンドラを定義
    const handleMouseMove = (moveEvent: MouseEvent) => {
      const currentState = dragStateRef.current;
      if (!currentState) return;

      const currentDayWidth = viewMode === 'day' ? 40 : viewMode === 'week' ? 16 : 6;
      const deltaX = moveEvent.clientX - currentState.startX;
      const deltaDays = Math.round(deltaX / currentDayWidth);

      let newStart = currentState.originalStart;
      let newEnd = currentState.originalEnd;

      if (currentState.type === 'move') {
        newStart += deltaDays;
        newEnd += deltaDays;
      } else if (currentState.type === 'resize-start') {
        newStart += deltaDays;
        if (newStart > currentState.originalEnd) newStart = currentState.originalEnd;
      } else if (currentState.type === 'resize-end') {
        newEnd += deltaDays;
        if (newEnd < currentState.originalStart) newEnd = currentState.originalStart;
      }

      // 範囲内に収める
      const maxIndex = dateRange.length - 1;
      newStart = Math.max(0, Math.min(newStart, maxIndex));
      newEnd = Math.max(0, Math.min(newEnd, maxIndex));

      // Note: Milestone linking is handled only via sidebar drag-and-drop (dnd-kit),
      // not via timeline bar dragging

      // Update dependent task previews
      const newDependentPreviews = new Map(currentState.dependentPreviews);
      if (currentState.type === 'move' && deltaDays !== 0) {
        currentState.dependentPreviews.forEach((preview, taskId) => {
          newDependentPreviews.set(taskId, {
            ...preview,
            previewStart: Math.max(0, Math.min(preview.originalStart + deltaDays, maxIndex)),
            previewEnd: Math.max(0, Math.min(preview.originalEnd + deltaDays, maxIndex)),
          });
        });
      }

      // プレビュー位置を更新
      const newState = {
        ...currentState,
        previewStart: newStart,
        previewEnd: newEnd,
        dependentPreviews: newDependentPreviews,
      };
      setDragState(newState);
      dragStateRef.current = newState;
    };

    const handleMouseUp = (upEvent: MouseEvent) => {
      const currentState = dragStateRef.current;
      if (!currentState) {
        cleanup();
        return;
      }

      const currentDayWidth = viewMode === 'day' ? 40 : viewMode === 'week' ? 16 : 6;
      const deltaX = upEvent.clientX - currentState.startX;
      const deltaDays = Math.round(deltaX / currentDayWidth);

      const row = rows.find(r => r.id === currentState.rowId);

      if (deltaDays !== 0) {
        // ドラッグが発生した場合は日付を更新
        if (row) {
          let newStart = currentState.originalStart;
          let newEnd = currentState.originalEnd;

          if (currentState.type === 'move') {
            newStart += deltaDays;
            newEnd += deltaDays;
          } else if (currentState.type === 'resize-start') {
            newStart += deltaDays;
          } else if (currentState.type === 'resize-end') {
            newEnd += deltaDays;
          }

          // 日付に変換
          const maxIndex = dateRange.length - 1;
          const startDate = dateRange[Math.max(0, Math.min(newStart, maxIndex))]?.toISODate();
          const endDate = dateRange[Math.max(0, Math.min(newEnd, maxIndex))]?.toISODate();

          if (startDate && endDate) {
            if (row.type === 'task') {
              // Phase 4: Dependency cascade - cascade to dependents in both directions
              if (currentState.type === 'move' && onBatchTaskUpdate) {
                const dependentTasks = findAllDependentTasks(row.id, tasks);
                if (dependentTasks.length > 0) {
                  // Batch update: main task + all dependents
                  const updates: Array<{ taskId: string; updates: Partial<TaskUpdate> }> = [
                    { taskId: row.id, updates: { start_not_before: startDate, due_date: endDate } }
                  ];

                  dependentTasks.forEach(depTask => {
                    const depStartStr = depTask.start_not_before || depTask.created_at;
                    const depStart = parseDate(depStartStr);
                    const depEnd = parseDate(depTask.due_date);
                    if (depStart && depEnd) {
                      const newDepStart = depStart.plus({ days: deltaDays }).toISODate();
                      const newDepEnd = depEnd.plus({ days: deltaDays }).toISODate();
                      if (newDepStart && newDepEnd) {
                        updates.push({
                          taskId: depTask.id,
                          updates: { start_not_before: newDepStart, due_date: newDepEnd }
                        });
                      }
                    }
                  });

                  onBatchTaskUpdate(updates);
                } else if (onTaskUpdate) {
                  // No dependents, just update the task
                  onTaskUpdate(row.id, { start_not_before: startDate, due_date: endDate });
                }
              } else if (onTaskUpdate) {
                // Resizing or no batch handler, just update the task
                onTaskUpdate(row.id, { start_not_before: startDate, due_date: endDate });
              }
            } else if (row.type === 'phase' && onPhaseUpdate) {
              onPhaseUpdate(row.id, { start_date: startDate, end_date: endDate });
            } else if (row.type === 'milestone' && onMilestoneUpdate) {
              // Milestones only have a due_date (same as startDate for milestone)
              onMilestoneUpdate(row.id, { due_date: startDate });
            }
          }
        }
      } else {
        // ドラッグが発生しなかった場合はクリックとして扱う
        // ただし、5px以上動いていたらドラッグ意図とみなしてクリックしない
        const absMovement = Math.abs(deltaX);
        const isClick = absMovement < 5;

        if (isClick && row?.type === 'task' && currentState.type === 'move') {
          if (isLinkMode) {
            // Link mode: handle linking
            handleLinkModeClick(row.id);
          } else if (onTaskClick) {
            onTaskClick(row.id);
          }
        }
      }

      cleanup();
    };

    const cleanup = () => {
      if (handleMouseMoveRef.current) {
        document.removeEventListener('mousemove', handleMouseMoveRef.current);
        handleMouseMoveRef.current = null;
      }
      if (handleMouseUpRef.current) {
        document.removeEventListener('mouseup', handleMouseUpRef.current);
        handleMouseUpRef.current = null;
      }
      setDragState(null);
      dragStateRef.current = null;
      setDropTargetMilestone(null);  // Phase 6: Clear drop target
    };

    // イベントリスナーを登録
    handleMouseMoveRef.current = handleMouseMove;
    handleMouseUpRef.current = handleMouseUp;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [viewMode, dateRange, rows, onTaskUpdate, onPhaseUpdate, onMilestoneUpdate, onTaskClick, onBatchTaskUpdate, findAllDependentTasks, tasks, parseDate, isLinkMode, handleLinkModeClick]);

  // コンポーネントのアンマウント時にクリーンアップ
  useEffect(() => {
    return () => {
      if (handleMouseMoveRef.current) {
        document.removeEventListener('mousemove', handleMouseMoveRef.current);
      }
      if (handleMouseUpRef.current) {
        document.removeEventListener('mouseup', handleMouseUpRef.current);
      }
    };
  }, []);

  // Close delete confirmation when clicking outside
  useEffect(() => {
    if (!pendingDeleteArrow) return;

    const handleClickOutside = () => {
      setPendingDeleteArrow(null);
    };

    // Delay to avoid immediate close
    const timeoutId = setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('click', handleClickOutside);
    };
  }, [pendingDeleteArrow]);

  // バーのクラス名
  const getBarClass = (row: GanttRow, bar: GanttBar): string => {
    const classes = ['pgantt-bar'];
    if (row.type === 'phase') classes.push('phase');
    if (row.type === 'milestone') classes.push('milestone');
    if (row.type === 'task') classes.push('task');
    if (row.type === 'buffer') classes.push('buffer');
    if (bar.status === 'DONE') classes.push('done');
    if (bar.status === 'IN_PROGRESS') classes.push('in-progress');
    if (row.bufferStatus) classes.push(row.bufferStatus);
    if (row.bufferType) classes.push(row.bufferType);
    // Phase 5: Link mode source highlighting
    if (isLinkMode && row.type === 'task' && linkSourceTask === row.id) {
      classes.push('link-source');
    }
    // Phase 6: Milestone drop target highlighting
    if (row.type === 'milestone' && dropTargetMilestone === row.id) {
      classes.push('drop-target');
    }
    // Phase 6: Milestone-linked task styling
    if (row.linkedMilestoneId) {
      classes.push('milestone-linked');
    }
    // Undated item styling
    if (row.hasNoDate) {
      classes.push('no-date');
    }
    return classes.join(' ');
  };

  const totalPhases = phases.length + (tasks.some(t => !t.phase_id) ? 1 : 0);

  if (rows.length === 0) {
    return (
      <div className="pgantt-empty">
        <p>表示するフェーズがありません</p>
        <p className="text-sm">フェーズを作成してタスクを割り当ててください</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`pgantt-container ${className || ''} ${isLinkMode ? 'link-mode' : ''} ${linkSourceTask ? 'has-source' : ''}`}
      style={{ '--day-width': `${dayWidth}px` } as CSSProperties}
    >
      {/* コントロール */}
      <div className="pgantt-controls">
        <div className="pgantt-controls-left">
          <label className="pgantt-checkbox">
            <input
              type="checkbox"
              checked={showTaskList}
              onChange={(e) => setShowTaskList(e.target.checked)}
            />
            <span>リスト</span>
          </label>
          <div className="pgantt-expand-buttons">
            <button onClick={expandAll} title="全て展開">
              <FaExpand size={10} />
              <span>展開</span>
            </button>
            <button onClick={collapseAll} title="全て折りたたみ">
              <FaCompress size={10} />
              <span>折畳</span>
            </button>
            <span className="pgantt-expand-count">{expandedPhases.size}/{totalPhases}</span>
          </div>
          {/* Phase 3: Sort button (one-time action) */}
          <button
            className="pgantt-sort-btn"
            onClick={sortTasksByDueDate}
            title="期限順にソート（マイルストーン内で期限順）"
          >
            <FaSort size={10} />
            <span>ソート</span>
          </button>
          {/* Phase 5: Link mode button */}
          {onDependencyUpdate && (
            <div className="pgantt-link-mode-container">
              <button
                className={`pgantt-link-btn ${isLinkMode ? 'active' : ''}`}
                onClick={() => {
                  setIsLinkMode(prev => !prev);
                  setLinkSourceTask(null);
                  setPendingDeleteArrow(null);
                }}
                title="依存関係リンクモード"
              >
                <FaLink size={10} />
                <span>リンク</span>
              </button>
              {isLinkMode && (
                <span className="pgantt-link-hint">
                  {linkSourceTask
                    ? '② 依存先（後に実行）を選択'
                    : '① 先に完了するタスクを選択'}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="pgantt-view-modes">
          <button className={viewMode === 'day' ? 'active' : ''} onClick={() => setViewMode('day')}>日</button>
          <button className={viewMode === 'week' ? 'active' : ''} onClick={() => setViewMode('week')}>週</button>
          <button className={viewMode === 'month' ? 'active' : ''} onClick={() => setViewMode('month')}>月</button>
        </div>
      </div>

      {/* メインエリア */}
      <div className="pgantt-main">
        {/* 左サイドバー（タスクリスト） */}
        {showTaskList && (
          <div className="pgantt-sidebar">
            <div className="pgantt-sidebar-header">タスク</div>
            <div className="pgantt-sidebar-body">
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragOver={handleSidebarDragOver}
                onDragEnd={handleSidebarDragEnd}
              >
                <SortableContext
                  items={rows.filter(r => r.type === 'task' || r.type === 'milestone').map(r => r.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {rows.map((row) => (
                    row.type === 'milestone' ? (
                      <DroppableMilestoneRow
                        key={`sidebar-milestone-${row.id}`}
                        row={row}
                        isDropTarget={dropTargetMilestone === row.id}
                      />
                    ) : (
                      <SortableSidebarRow
                        key={`sidebar-${row.type}-${row.id}`}
                        row={row}
                        isLinkMode={isLinkMode}
                        linkSourceTask={linkSourceTask}
                        onTogglePhase={togglePhase}
                        onLinkModeClick={handleLinkModeClick}
                        onTaskClick={onTaskClick}
                        onTaskCreate={onTaskCreate}
                        isDragDisabled={false}
                        isDropTarget={false}
                      />
                    )
                  ))}
                </SortableContext>
              </DndContext>
            </div>
          </div>
        )}

        {/* タイムライン */}
        <div className="pgantt-timeline" ref={scrollRef}>
          {/* 月ヘッダー */}
          <div className="pgantt-month-header" style={{ width: `${dateRange.length * dayWidth}px` }}>
            {monthHeaders.map((month, idx) => (
              <div
                key={`month-${idx}`}
                className="pgantt-month-cell"
                style={{
                  left: `${month.startIndex * dayWidth}px`,
                  width: `${month.span * dayWidth}px`,
                }}
              >
                {month.label}
              </div>
            ))}
          </div>

          {/* 日付ヘッダー */}
          <div className="pgantt-day-header" style={{ width: `${dateRange.length * dayWidth}px` }}>
            {dateRange.map((date, index) => {
              const showLabel = viewMode === 'day' ||
                (viewMode === 'week' && date.weekday === 1) ||
                (viewMode === 'month' && date.day === 1);

              return (
                <div
                  key={`day-${index}`}
                  className={`pgantt-day-cell ${isWeekend(date) ? 'weekend' : ''} ${isToday(date, today) ? 'today' : ''}`}
                  style={{ width: `${dayWidth}px` }}
                >
                  {showLabel && viewMode === 'day' && (
                    <>
                      <span className="pgantt-day-num">{formatDayLabel(date)}</span>
                      <span className="pgantt-day-weekday">{formatWeekday(date)}</span>
                    </>
                  )}
                  {showLabel && viewMode === 'week' && (
                    <span className="pgantt-day-num">{formatDayLabel(date)}</span>
                  )}
                </div>
              );
            })}
          </div>

          {/* 行エリア */}
          <div className="pgantt-rows" style={{ width: `${dateRange.length * dayWidth}px` }}>
            {/* グリッド背景 */}
            <div className="pgantt-grid">
              {dateRange.map((date, index) => (
                <div
                  key={`grid-${index}`}
                  className={`pgantt-grid-cell ${isWeekend(date) ? 'weekend' : ''} ${isToday(date, today) ? 'today' : ''}`}
                  style={{ left: `${index * dayWidth}px`, width: `${dayWidth}px` }}
                />
              ))}
            </div>

            {/* 依存関係の矢印 */}
            <svg
              className="pgantt-arrows"
              style={{ width: `${dateRange.length * dayWidth}px`, height: `${rows.length * 44}px` }}
            >
              <defs>
                <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                  <polygon points="0 0, 8 3, 0 6" fill="#94a3b8" />
                </marker>
                <marker id="arrowhead-danger" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                  <polygon points="0 0, 8 3, 0 6" fill="#ef4444" />
                </marker>
              </defs>
              {dependencyArrows.map((arrow, index) => {
                const rowHeight = 44;

                // Check if source or target is being dragged/previewed
                let fromIndex = arrow.fromIndex;
                let toIndex = arrow.toIndex;
                let isAnimating = false;

                // If source task (fromId) is the main dragged task
                if (dragState?.rowId === arrow.fromId) {
                  fromIndex = dragState.previewEnd; // Arrow starts from end of bar
                  isAnimating = true;
                }
                // If source task is a dependent being previewed
                const fromPreview = dragState?.dependentPreviews?.get(arrow.fromId);
                if (fromPreview) {
                  fromIndex = fromPreview.previewEnd;
                  isAnimating = true;
                }

                // If target task (toId) is the main dragged task
                if (dragState?.rowId === arrow.toId) {
                  toIndex = dragState.previewStart; // Arrow ends at start of bar
                  isAnimating = true;
                }
                // If target task is a dependent being previewed
                const toPreview = dragState?.dependentPreviews?.get(arrow.toId);
                if (toPreview) {
                  toIndex = toPreview.previewStart;
                  isAnimating = true;
                }

                const x1 = (fromIndex + 1) * dayWidth;
                const y1 = arrow.fromRow * rowHeight + rowHeight / 2;
                const x2 = toIndex * dayWidth;
                const y2 = arrow.toRow * rowHeight + rowHeight / 2;
                const midX = (x1 + x2) / 2;

                const pathD = `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;

                // Handle arrow click to remove dependency (only in link mode)
                const handleArrowClick = (e: React.MouseEvent) => {
                  e.stopPropagation();
                  if (!onDependencyUpdate || !isLinkMode) return;

                  // Show modern confirmation popup
                  setPendingDeleteArrow({
                    fromId: arrow.fromId,
                    toId: arrow.toId,
                    x: (x1 + x2) / 2,
                    y: (y1 + y2) / 2,
                  });
                };

                const isClickable = onDependencyUpdate && isLinkMode;

                return (
                  <path
                    key={`arrow-${index}`}
                    d={pathD}
                    className={`pgantt-arrow-path${isAnimating ? ' animating' : ''}${isClickable ? ' clickable' : ''}`}
                    markerEnd="url(#arrowhead)"
                    onClick={isClickable ? handleArrowClick : undefined}
                  />
                );
              })}
              {/* Delete confirmation popup */}
              {pendingDeleteArrow && (
                <foreignObject
                  x={pendingDeleteArrow.x - 100}
                  y={pendingDeleteArrow.y - 50}
                  width="200"
                  height="80"
                >
                  <div className="pgantt-delete-confirm">
                    <p>この依存関係を削除しますか？</p>
                    <div className="pgantt-delete-confirm-buttons">
                      <button
                        className="cancel"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPendingDeleteArrow(null);
                        }}
                      >
                        キャンセル
                      </button>
                      <button
                        className="delete"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onDependencyUpdate) {
                            const targetTask = tasks.find(t => t.id === pendingDeleteArrow.toId);
                            if (targetTask) {
                              const newDependencies = (targetTask.dependency_ids || []).filter(
                                id => id !== pendingDeleteArrow.fromId
                              );
                              onDependencyUpdate(pendingDeleteArrow.toId, newDependencies);
                            }
                          }
                          setPendingDeleteArrow(null);
                        }}
                      >
                        削除
                      </button>
                    </div>
                  </div>
                </foreignObject>
              )}
            </svg>

            {/* バー */}
            {rows.map((row, rowIndex) => (
              <div
                key={`row-${row.type}-${row.id}`}
                className={`pgantt-bar-row ${row.type}${row.linkedMilestoneDateIndex !== undefined ? ' has-milestone-marker' : ''}`}
                style={{ top: `${rowIndex * 44}px` }}
              >
                {/* Milestone deadline marker for linked tasks - faded diamond */}
                {row.linkedMilestoneDateIndex !== undefined && row.bar && (
                  <span
                    className="pgantt-milestone-marker"
                    style={{ left: `${row.linkedMilestoneDateIndex * dayWidth + dayWidth / 2}px` }}
                    title="マイルストーン期限"
                  >
                    ◆
                  </span>
                )}
                {row.bar && row.bar.startIndex >= 0 && (() => {
                  // ドラッグ中の行はプレビュー位置を使用
                  const isDragging = dragState?.rowId === row.id;
                  // Check if this is a dependent task being previewed
                  const dependentPreview = dragState?.dependentPreviews?.get(row.id);
                  const isDependentDragging = !!dependentPreview;

                  let barStart = row.bar.startIndex;
                  let barEnd = row.bar.endIndex;
                  if (isDragging) {
                    barStart = dragState.previewStart;
                    barEnd = dragState.previewEnd;
                  } else if (isDependentDragging) {
                    barStart = dependentPreview.previewStart;
                    barEnd = dependentPreview.previewEnd;
                  }
                  const startDate = dateRange[barStart];
                  const endDate = dateRange[barEnd];

                  return (
                    <div
                      className={`${getBarClass(row, row.bar)}${isDragging ? ' dragging' : ''}${isDependentDragging ? ' dependent-dragging' : ''}`}
                      style={{
                        left: `${barStart * dayWidth + 2}px`,
                        width: `${Math.max((barEnd - barStart + 1) * dayWidth - 4, 8)}px`,
                        '--progress': `${row.bar.progress}%`,
                        '--buffer-color': row.bufferStatus ? getBufferStatusColor(row.bufferStatus) : undefined,
                      } as CSSProperties}
                      onMouseDown={(e) => {
                        if (row.type === 'task' || row.type === 'phase' || row.type === 'milestone') {
                          handleDragStart(e, row.id, 'move', row.bar!);
                        }
                      }}
                      title={`${row.title}${row.bar.progress > 0 ? ` (${Math.round(row.bar.progress)}%)` : ''}`}
                    >
                      {row.type === 'milestone' && <span className="pgantt-bar-milestone">◆</span>}
                      {row.bar.progress > 0 && row.bar.progress < 100 && row.type !== 'milestone' && (
                        <div className="pgantt-bar-progress" />
                      )}
                      {(row.type === 'task' || row.type === 'phase') && !row.hasNoDate && (
                        <>
                          <div
                            className="pgantt-resize-handle start"
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              handleDragStart(e, row.id, 'resize-start', row.bar!);
                            }}
                          />
                          <div
                            className="pgantt-resize-handle end"
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              handleDragStart(e, row.id, 'resize-end', row.bar!);
                            }}
                          />
                        </>
                      )}
                      {/* ドラッグ中の日付プレビュー */}
                      {isDragging && startDate && endDate && (
                        <div className="pgantt-drag-preview">
                          <span className="pgantt-drag-date start">
                            {startDate.toFormat('M/d')}
                          </span>
                          <span className="pgantt-drag-date end">
                            {endDate.toFormat('M/d')}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
