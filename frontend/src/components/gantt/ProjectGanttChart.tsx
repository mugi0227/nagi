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

import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import type { CSSProperties } from 'react';
import { FaChevronDown, FaChevronRight, FaExpand, FaCompress } from 'react-icons/fa';
import type { Task, Phase, Milestone, ScheduleDiff, PhaseScheduleDiff } from '../../api/types';
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
  baselineDiff: ScheduleDiff | null;
  onTaskUpdate?: (taskId: string, updates: { start_not_before?: string; due_date?: string }) => void;
  onPhaseUpdate?: (phaseId: string, updates: { start_date?: string; end_date?: string }) => void;
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
  milestoneDate?: Date;
  dependencyIds?: string[];
  isExpanded?: boolean;
  childCount?: number;
}

interface MonthHeader {
  label: string;
  startIndex: number;
  span: number;
}

// ============================================
// Helpers
// ============================================

const formatMonthYear = (date: Date): string => {
  return date.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long' });
};

const formatDayLabel = (date: Date): string => {
  return date.getDate().toString();
};

const formatWeekday = (date: Date): string => {
  return date.toLocaleDateString('ja-JP', { weekday: 'short' });
};

const isWeekend = (date: Date): boolean => {
  const day = date.getDay();
  return day === 0 || day === 6;
};

const isToday = (date: Date): boolean => {
  const today = new Date();
  return date.toDateString() === today.toDateString();
};

const getBufferStatusColor = (status: BufferStatus): string => {
  switch (status) {
    case 'critical': return '#ef4444';
    case 'warning': return '#f59e0b';
    default: return '#10b981';
  }
};

const getBufferStatusIcon = (status: BufferStatus): string => {
  switch (status) {
    case 'critical': return '🔴';
    case 'warning': return '🟡';
    default: return '🟢';
  }
};

const generateDateRange = (startDate: Date, days: number): Date[] => {
  const result: Date[] = [];
  const current = new Date(startDate);
  current.setHours(0, 0, 0, 0);
  for (let i = 0; i < days; i++) {
    result.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }
  return result;
};

const parseDate = (dateStr: string | undefined): Date | null => {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
};

// ============================================
// Component
// ============================================

export const ProjectGanttChart: React.FC<ProjectGanttChartProps> = ({
  tasks,
  phases,
  milestones,
  baselineDiff,
  onTaskUpdate,
  onPhaseUpdate,
  className,
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>('day');
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(() => new Set(phases.map(p => p.id)));
  const [showTaskList, setShowTaskList] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [dragState, setDragState] = useState<{
    rowId: string;
    type: 'move' | 'resize-start' | 'resize-end';
    startX: number;
    originalStart: number;
    originalEnd: number;
  } | null>(null);

  // 日付範囲の計算（前後3ヶ月 = 約180日）
  const dateRange = useMemo(() => {
    const allDates: Date[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

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

    const minDate = new Date(Math.min(...allDates.map(d => d.getTime())));
    const maxDate = new Date(Math.max(...allDates.map(d => d.getTime())));

    // 前後に余裕を持たせる（前1ヶ月、後2ヶ月）
    minDate.setDate(minDate.getDate() - 30);
    maxDate.setDate(maxDate.getDate() + 60);

    const days = Math.ceil((maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24));
    return generateDateRange(minDate, Math.max(days, 90));
  }, [phases, milestones, tasks]);

  // 月ヘッダーの計算
  const monthHeaders = useMemo((): MonthHeader[] => {
    const headers: MonthHeader[] = [];
    let currentMonth = -1;
    let currentYear = -1;
    let startIndex = 0;

    dateRange.forEach((date, index) => {
      const month = date.getMonth();
      const year = date.getFullYear();

      if (month !== currentMonth || year !== currentYear) {
        if (currentMonth !== -1) {
          headers.push({
            label: formatMonthYear(new Date(currentYear, currentMonth)),
            startIndex,
            span: index - startIndex,
          });
        }
        currentMonth = month;
        currentYear = year;
        startIndex = index;
      }
    });

    // 最後の月を追加
    if (currentMonth !== -1) {
      headers.push({
        label: formatMonthYear(new Date(currentYear, currentMonth)),
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
      map.set(date.toISOString().slice(0, 10), index);
    });
    return map;
  }, [dateRange]);

  // 日付文字列からインデックスを取得
  const getDateIndex = useCallback((dateStr: string | undefined): number => {
    if (!dateStr) return -1;
    const normalized = dateStr.slice(0, 10);
    return dateIndexMap.get(normalized) ?? -1;
  }, [dateIndexMap]);

  // フェーズのバッファ情報を取得
  const getPhaseBufferInfo = useCallback((phaseId: string): PhaseScheduleDiff | undefined => {
    return baselineDiff?.phase_diffs.find(pd => pd.phase_id === phaseId);
  }, [baselineDiff]);

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
      const bufferInfo = getPhaseBufferInfo(phase.id);

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
          const todayIdx = dateIndexMap.get(new Date().toISOString().slice(0, 10)) ?? 0;
          startIndex = todayIdx;
          endIndex = todayIdx + 14;
        }
      }

      // 進捗計算
      const completedTasks = phaseTasks.filter(t => t.status === 'DONE').length;
      const progress = phaseTasks.length > 0 ? (completedTasks / phaseTasks.length) * 100 : 0;

      const bufferStatus: BufferStatus = bufferInfo?.buffer_status || 'healthy';

      // フェーズ行
      result.push({
        type: 'phase',
        id: phase.id,
        title: `${getBufferStatusIcon(bufferStatus)} ${phase.name}`,
        depth: 0,
        phaseId: phase.id,
        bar: { startIndex, endIndex, progress, status: 'phase' },
        bufferStatus,
        bufferPercentage: bufferInfo?.buffer_percentage ?? 100,
        isExpanded,
        childCount: phaseTasks.filter(t => !t.parent_id).length + phaseMilestones.length,
      });

      if (isExpanded) {
        // マイルストーン
        phaseMilestones
          .sort((a, b) => {
            const dateA = parseDate(a.due_date)?.getTime() ?? 0;
            const dateB = parseDate(b.due_date)?.getTime() ?? 0;
            return dateA - dateB;
          })
          .forEach(milestone => {
            const idx = getDateIndex(milestone.due_date);
            if (idx >= 0) {
              result.push({
                type: 'milestone',
                id: milestone.id,
                title: milestone.title,
                depth: 1,
                phaseId: phase.id,
                bar: { startIndex: idx, endIndex: idx, progress: milestone.status === 'COMPLETED' ? 100 : 0, status: 'milestone' },
                milestoneDate: parseDate(milestone.due_date) || undefined,
              });
            }
          });

        // 親タスク（サブタスクを持つか、親がないタスク）
        const parentTasks = phaseTasks.filter(t => !t.parent_id);
        parentTasks
          .sort((a, b) => {
            const dateA = parseDate(a.due_date)?.getTime() ?? 0;
            const dateB = parseDate(b.due_date)?.getTime() ?? 0;
            return dateA - dateB;
          })
          .forEach(task => {
            // start_not_before ~ due_date でバーを表示
            let taskStartIndex = getDateIndex(task.start_not_before);
            let taskEndIndex = getDateIndex(task.due_date);

            // start_not_beforeがない場合、due_dateから見積もり時間分遡る
            if (taskStartIndex < 0 && taskEndIndex >= 0) {
              const estimatedDays = Math.max(1, Math.ceil((task.estimated_minutes || 60) / (8 * 60)));
              taskStartIndex = Math.max(0, taskEndIndex - estimatedDays + 1);
            }

            // due_dateもない場合は表示しない
            if (taskEndIndex < 0) {
              taskEndIndex = taskStartIndex >= 0 ? taskStartIndex + 1 : -1;
            }

            if (taskStartIndex < 0) taskStartIndex = taskEndIndex;

            if (taskStartIndex >= 0 && taskEndIndex >= 0) {
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
              });
            }
          });

        // バッファ行（消費されている場合のみ表示）
        if (bufferInfo && bufferInfo.buffer_percentage < 100) {
          result.push({
            type: 'buffer',
            id: `buffer-${phase.id}`,
            title: `バッファ残 ${Math.round(bufferInfo.buffer_percentage)}%`,
            depth: 1,
            phaseId: phase.id,
            bufferStatus,
            bufferPercentage: bufferInfo.buffer_percentage,
            bar: { startIndex: endIndex, endIndex: endIndex + 2, progress: bufferInfo.buffer_percentage, status: 'buffer' },
          });
        }
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

          if (taskStartIndex < 0 && taskEndIndex >= 0) {
            const estimatedDays = Math.max(1, Math.ceil((task.estimated_minutes || 60) / (8 * 60)));
            taskStartIndex = Math.max(0, taskEndIndex - estimatedDays + 1);
          }
          if (taskEndIndex < 0 && taskStartIndex >= 0) {
            taskEndIndex = taskStartIndex + 1;
          }
          if (taskStartIndex < 0) taskStartIndex = 0;
          if (taskEndIndex < 0) taskEndIndex = 1;

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
          });
        });
      }
    }

    return result;
  }, [phases, tasks, milestones, expandedPhases, tasksByPhase, milestonesByPhase, dateRange, getDateIndex, getPhaseBufferInfo, dateIndexMap]);

  // 依存関係の矢印データ
  const dependencyArrows = useMemo(() => {
    const arrows: { fromId: string; toId: string; fromIndex: number; toIndex: number; fromRow: number; toRow: number }[] = [];
    const rowIndexMap = new Map<string, number>();
    rows.forEach((row, index) => rowIndexMap.set(row.id, index));

    rows.forEach((row, rowIndex) => {
      if (row.type === 'task' && row.dependencyIds && row.bar) {
        row.dependencyIds.forEach(depId => {
          const depRowIndex = rowIndexMap.get(depId);
          const depRow = rows.find(r => r.id === depId);
          if (depRowIndex !== undefined && depRow?.bar) {
            arrows.push({
              fromId: depId,
              toId: row.id,
              fromIndex: depRow.bar.endIndex,
              toIndex: row.bar.startIndex,
              fromRow: depRowIndex,
              toRow: rowIndex,
            });
          }
        });
      }
    });

    return arrows;
  }, [rows]);

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

  // 今日の位置にスクロール
  useEffect(() => {
    if (scrollRef.current) {
      const todayIndex = dateIndexMap.get(new Date().toISOString().slice(0, 10)) ?? 0;
      const dayWidth = viewMode === 'day' ? 40 : viewMode === 'week' ? 16 : 6;
      const scrollPosition = Math.max(0, todayIndex * dayWidth - 200);
      scrollRef.current.scrollLeft = scrollPosition;
    }
  }, [dateIndexMap, viewMode]);

  // ドラッグ開始
  const handleDragStart = useCallback((
    e: React.MouseEvent,
    rowId: string,
    type: 'move' | 'resize-start' | 'resize-end',
    bar: GanttBar
  ) => {
    e.preventDefault();
    setDragState({
      rowId,
      type,
      startX: e.clientX,
      originalStart: bar.startIndex,
      originalEnd: bar.endIndex,
    });
  }, []);

  // ドラッグ中 & 終了
  useEffect(() => {
    if (!dragState) return;

    const handleMouseMove = (_e: MouseEvent) => {
      // リアルタイムプレビューは後で実装
    };

    const handleMouseUp = (e: MouseEvent) => {
      const dayWidth = viewMode === 'day' ? 40 : viewMode === 'week' ? 16 : 6;
      const deltaX = e.clientX - dragState.startX;
      const deltaDays = Math.round(deltaX / dayWidth);

      if (deltaDays !== 0) {
        const row = rows.find(r => r.id === dragState.rowId);
        if (row) {
          let newStart = dragState.originalStart;
          let newEnd = dragState.originalEnd;

          if (dragState.type === 'move') {
            newStart += deltaDays;
            newEnd += deltaDays;
          } else if (dragState.type === 'resize-start') {
            newStart += deltaDays;
          } else if (dragState.type === 'resize-end') {
            newEnd += deltaDays;
          }

          // 日付に変換
          const startDate = dateRange[Math.max(0, Math.min(newStart, dateRange.length - 1))]?.toISOString().slice(0, 10);
          const endDate = dateRange[Math.max(0, Math.min(newEnd, dateRange.length - 1))]?.toISOString().slice(0, 10);

          if (startDate && endDate) {
            if (row.type === 'task' && onTaskUpdate) {
              onTaskUpdate(row.id, { start_not_before: startDate, due_date: endDate });
            } else if (row.type === 'phase' && onPhaseUpdate) {
              onPhaseUpdate(row.id, { start_date: startDate, end_date: endDate });
            }
          }
        }
      }

      setDragState(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragState, viewMode, dateRange, rows, onTaskUpdate, onPhaseUpdate]);

  // バーのクラス名
  const getBarClass = (row: GanttRow): string => {
    const classes = ['pgantt-bar'];
    if (row.type === 'phase') classes.push('phase');
    if (row.type === 'milestone') classes.push('milestone');
    if (row.type === 'task') classes.push('task');
    if (row.type === 'buffer') classes.push('buffer');
    if (row.bar?.status === 'DONE') classes.push('done');
    if (row.bar?.status === 'IN_PROGRESS') classes.push('in-progress');
    if (row.bufferStatus) classes.push(row.bufferStatus);
    return classes.join(' ');
  };

  const totalPhases = phases.length + (tasks.some(t => !t.phase_id) ? 1 : 0);
  const dayWidth = viewMode === 'day' ? 40 : viewMode === 'week' ? 16 : 6;

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
      className={`pgantt-container ${className || ''}`}
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
              {rows.map((row) => (
                <div
                  key={`sidebar-${row.type}-${row.id}`}
                  className={`pgantt-sidebar-row ${row.type} depth-${row.depth}`}
                  style={{ '--depth': row.depth } as CSSProperties}
                  onClick={row.type === 'phase' ? () => togglePhase(row.id) : undefined}
                >
                  {row.type === 'phase' && (
                    <span className="pgantt-toggle">
                      {row.isExpanded ? <FaChevronDown size={10} /> : <FaChevronRight size={10} />}
                    </span>
                  )}
                  {row.type === 'milestone' && <span className="pgantt-milestone-icon">◆</span>}
                  <span className="pgantt-row-title" title={row.title}>{row.title}</span>
                  {row.childCount !== undefined && row.childCount > 0 && (
                    <span className="pgantt-child-count">{row.childCount}</span>
                  )}
                </div>
              ))}
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
                (viewMode === 'week' && date.getDay() === 1) ||
                (viewMode === 'month' && date.getDate() === 1);

              return (
                <div
                  key={`day-${index}`}
                  className={`pgantt-day-cell ${isWeekend(date) ? 'weekend' : ''} ${isToday(date) ? 'today' : ''}`}
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
                  className={`pgantt-grid-cell ${isWeekend(date) ? 'weekend' : ''} ${isToday(date) ? 'today' : ''}`}
                  style={{ left: `${index * dayWidth}px`, width: `${dayWidth}px` }}
                />
              ))}
            </div>

            {/* 依存関係の矢印 */}
            <svg className="pgantt-arrows" style={{ width: `${dateRange.length * dayWidth}px`, height: `${rows.length * 44}px` }}>
              <defs>
                <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                  <polygon points="0 0, 8 3, 0 6" fill="#94a3b8" />
                </marker>
              </defs>
              {dependencyArrows.map((arrow, index) => {
                const rowHeight = 44;
                const x1 = (arrow.fromIndex + 1) * dayWidth;
                const y1 = arrow.fromRow * rowHeight + rowHeight / 2;
                const x2 = arrow.toIndex * dayWidth;
                const y2 = arrow.toRow * rowHeight + rowHeight / 2;
                const midX = (x1 + x2) / 2;

                return (
                  <path
                    key={`arrow-${index}`}
                    d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
                    className="pgantt-arrow-path"
                    markerEnd="url(#arrowhead)"
                  />
                );
              })}
            </svg>

            {/* バー */}
            {rows.map((row, rowIndex) => (
              <div
                key={`row-${row.type}-${row.id}`}
                className={`pgantt-bar-row ${row.type}`}
                style={{ top: `${rowIndex * 44}px` }}
              >
                {row.bar && row.bar.startIndex >= 0 && (
                  <div
                    className={getBarClass(row)}
                    style={{
                      left: `${row.bar.startIndex * dayWidth + 2}px`,
                      width: `${Math.max((row.bar.endIndex - row.bar.startIndex + 1) * dayWidth - 4, 8)}px`,
                      '--progress': `${row.bar.progress}%`,
                      '--buffer-color': row.bufferStatus ? getBufferStatusColor(row.bufferStatus) : undefined,
                    } as CSSProperties}
                    onMouseDown={(e) => {
                      if (row.type === 'task' || row.type === 'phase') {
                        handleDragStart(e, row.id, 'move', row.bar!);
                      }
                    }}
                    title={`${row.title}${row.bar.progress > 0 ? ` (${Math.round(row.bar.progress)}%)` : ''}`}
                  >
                    {row.type === 'milestone' && <span className="pgantt-bar-milestone">◆</span>}
                    {row.bar.progress > 0 && row.bar.progress < 100 && row.type !== 'milestone' && (
                      <div className="pgantt-bar-progress" />
                    )}
                    {(row.type === 'task' || row.type === 'phase') && (
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
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
