import React, { useMemo, useState, useCallback } from 'react';
import { Gantt, Task as GanttTask, ViewMode } from 'gantt-task-react';
import 'gantt-task-react/dist/index.css';
import { Task, ScheduleDiff, Phase, Milestone } from '../../api/types';
import './ProjectGanttContent.css';

interface ProjectGanttContentProps {
  tasks: Task[];
  phases: Phase[];
  milestones: Milestone[];
  baselineDiff: ScheduleDiff | null;
  className?: string;
}

type GanttItemType = 'project' | 'task' | 'milestone';

interface CustomGanttTask extends GanttTask {
  itemType?: 'phase' | 'task' | 'milestone' | 'buffer';
  phaseId?: string;
}

// バッファステータスの色
const getBufferStatusColor = (status: string): string => {
  switch (status) {
    case 'critical':
      return '#ef4444';
    case 'warning':
      return '#f59e0b';
    default:
      return '#10b981';
  }
};

// バッファステータスのアイコン
const getBufferStatusIcon = (status: string): string => {
  switch (status) {
    case 'critical':
      return '🔴';
    case 'warning':
      return '🟡';
    default:
      return '🟢';
  }
};

export const ProjectGanttContent: React.FC<ProjectGanttContentProps> = ({
  tasks,
  phases,
  milestones,
  baselineDiff,
  className,
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.Day);
  const [showTaskList, setShowTaskList] = useState(true);
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set());

  // フェーズの展開/折りたたみ切り替え
  const togglePhaseExpand = useCallback((phaseId: string) => {
    setExpandedPhases((prev) => {
      const next = new Set(prev);
      if (next.has(phaseId)) {
        next.delete(phaseId);
      } else {
        next.add(phaseId);
      }
      return next;
    });
  }, []);

  // 全て展開/折りたたみ
  const expandAll = useCallback(() => {
    setExpandedPhases(new Set(phases.map((p) => p.id)));
  }, [phases]);

  const collapseAll = useCallback(() => {
    setExpandedPhases(new Set());
  }, []);

  // マイルストーンをフェーズIDでグループ化
  const milestonesByPhase = useMemo(() => {
    const map = new Map<string, Milestone[]>();
    milestones.forEach((m) => {
      const list = map.get(m.phase_id) || [];
      list.push(m);
      map.set(m.phase_id, list);
    });
    return map;
  }, [milestones]);

  // タスクをフェーズIDでグループ化
  const tasksByPhase = useMemo(() => {
    const map = new Map<string, Task[]>();
    tasks.forEach((t) => {
      if (t.phase_id) {
        const list = map.get(t.phase_id) || [];
        list.push(t);
        map.set(t.phase_id, list);
      }
    });
    return map;
  }, [tasks]);

  // ガントチャートデータの構築
  const ganttTasks = useMemo(() => {
    const result: CustomGanttTask[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // フェーズ順にソート
    const sortedPhases = [...phases].sort(
      (a, b) => a.order_in_project - b.order_in_project
    );

    sortedPhases.forEach((phase) => {
      // フェーズの期間を決定
      let phaseStart: Date;
      let phaseEnd: Date;

      if (phase.start_date && phase.end_date) {
        phaseStart = new Date(phase.start_date);
        phaseEnd = new Date(phase.end_date);
      } else {
        // フェーズに日付がない場合、タスクから推定
        const phaseTasks = tasksByPhase.get(phase.id) || [];
        const phaseMilestones = milestonesByPhase.get(phase.id) || [];

        const dates: Date[] = [];
        phaseTasks.forEach((t) => {
          if (t.due_date) dates.push(new Date(t.due_date));
          if (t.start_not_before) dates.push(new Date(t.start_not_before));
        });
        phaseMilestones.forEach((m) => {
          if (m.due_date) dates.push(new Date(m.due_date));
        });

        if (dates.length > 0) {
          phaseStart = new Date(Math.min(...dates.map((d) => d.getTime())));
          phaseEnd = new Date(Math.max(...dates.map((d) => d.getTime())));
        } else {
          phaseStart = new Date(today);
          phaseEnd = new Date(today);
          phaseEnd.setDate(phaseEnd.getDate() + 14); // デフォルト2週間
        }
      }

      // バッファ情報を取得
      const phaseDiff = baselineDiff?.phase_diffs.find(
        (pd) => pd.phase_id === phase.id
      );
      const bufferStatus = phaseDiff?.buffer_status || 'healthy';
      const bufferPercentage = phaseDiff?.buffer_percentage ?? 100;

      // フェーズ内のタスク数
      const phaseTasks = tasksByPhase.get(phase.id) || [];
      const completedTasks = phaseTasks.filter((t) => t.status === 'DONE').length;
      const totalTasks = phaseTasks.length;
      const progress = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

      // フェーズ名にバッファステータスを追加
      const phaseDisplayName = `${getBufferStatusIcon(bufferStatus)} ${phase.name}`;
      const isExpanded = expandedPhases.has(phase.id);

      // フェーズ行を追加（project type）
      result.push({
        start: phaseStart,
        end: phaseEnd,
        name: phaseDisplayName,
        id: `phase-${phase.id}`,
        type: 'project' as GanttItemType,
        progress,
        isDisabled: false,
        hideChildren: !isExpanded,
        styles: {
          progressColor: getBufferStatusColor(bufferStatus),
          progressSelectedColor: getBufferStatusColor(bufferStatus),
          backgroundColor: '#e2e8f0',
          backgroundSelectedColor: '#cbd5e1',
        },
        itemType: 'phase',
        phaseId: phase.id,
      });

      // マイルストーンを追加
      const phaseMilestones = milestonesByPhase.get(phase.id) || [];
      phaseMilestones
        .sort((a, b) => a.order_in_phase - b.order_in_phase)
        .forEach((milestone) => {
          if (milestone.due_date) {
            const dueDate = new Date(milestone.due_date);
            result.push({
              start: dueDate,
              end: dueDate,
              name: `◆ ${milestone.title}`,
              id: `milestone-${milestone.id}`,
              type: 'milestone' as GanttItemType,
              progress: milestone.status === 'COMPLETED' ? 100 : 0,
              isDisabled: false,
              project: `phase-${phase.id}`,
              styles: {
                progressColor: '#8b5cf6',
                progressSelectedColor: '#7c3aed',
                backgroundColor: '#8b5cf6',
                backgroundSelectedColor: '#7c3aed',
              },
              itemType: 'milestone',
              phaseId: phase.id,
            });
          }
        });

      // バッファ表示（フェーズ末尾に）
      if (bufferPercentage < 100 && phaseDiff) {
        // バッファを視覚化：フェーズ終了後に1日のバー
        const bufferStart = new Date(phaseEnd);
        bufferStart.setDate(bufferStart.getDate() + 1);
        const bufferEnd = new Date(bufferStart);
        bufferEnd.setDate(bufferEnd.getDate() + 1);

        result.push({
          start: bufferStart,
          end: bufferEnd,
          name: `バッファ残 ${Math.round(bufferPercentage)}%`,
          id: `buffer-${phase.id}`,
          type: 'task' as GanttItemType,
          progress: bufferPercentage,
          isDisabled: true,
          project: `phase-${phase.id}`,
          styles: {
            progressColor: getBufferStatusColor(bufferStatus),
            progressSelectedColor: getBufferStatusColor(bufferStatus),
            backgroundColor: '#f1f5f9',
            backgroundSelectedColor: '#e2e8f0',
          },
          itemType: 'buffer',
          phaseId: phase.id,
        });
      }

      // タスクを追加（展開時のみ）
      if (isExpanded) {
        // ベースラインDiffがある場合はそれを使用
        if (baselineDiff) {
          const taskDiffs = baselineDiff.task_diffs.filter((td) => {
            const task = tasks.find((t) => t.id === td.task_id);
            return task?.phase_id === phase.id;
          });

          taskDiffs
            .sort((a, b) => {
              const dateA = a.current_start
                ? new Date(a.current_start).getTime()
                : 0;
              const dateB = b.current_start
                ? new Date(b.current_start).getTime()
                : 0;
              return dateA - dateB;
            })
            .forEach((diff) => {
              const task = tasks.find((t) => t.id === diff.task_id);
              if (!task) return;

              const isDone = task.status === 'DONE';
              const taskProgress = task.progress ?? (isDone ? 100 : 0);

              // 実績バー
              if (diff.current_start && diff.current_end) {
                const start = new Date(diff.current_start);
                const end = new Date(diff.current_end);
                if (end <= start) end.setTime(start.getTime() + 3600000);

                result.push({
                  start,
                  end,
                  name: task.title,
                  id: `task-${task.id}`,
                  type: 'task' as GanttItemType,
                  project: `phase-${phase.id}`,
                  progress: taskProgress,
                  isDisabled: false,
                  styles: {
                    progressColor: isDone ? '#10b981' : '#3b82f6',
                    progressSelectedColor: isDone ? '#059669' : '#2563eb',
                    backgroundColor: isDone ? '#d1fae5' : '#dbeafe',
                    backgroundSelectedColor: isDone ? '#a7f3d0' : '#bfdbfe',
                  },
                  itemType: 'task',
                  phaseId: phase.id,
                });
              }
            });
        } else {
          // ベースラインがない場合はタスクをそのまま表示
          phaseTasks
            .filter((t) => !t.parent_id) // 親タスクのみ
            .sort((a, b) => {
              const dateA = a.due_date ? new Date(a.due_date).getTime() : 0;
              const dateB = b.due_date ? new Date(b.due_date).getTime() : 0;
              return dateA - dateB;
            })
            .forEach((task) => {
              const isDone = task.status === 'DONE';
              const taskProgress = task.progress ?? (isDone ? 100 : 0);

              // 日付を決定
              let taskStart: Date;
              let taskEnd: Date;

              if (task.start_not_before && task.due_date) {
                taskStart = new Date(task.start_not_before);
                taskEnd = new Date(task.due_date);
              } else if (task.due_date) {
                taskEnd = new Date(task.due_date);
                taskStart = new Date(taskEnd);
                const durationDays = Math.ceil(
                  (task.estimated_minutes || 60) / (8 * 60)
                );
                taskStart.setDate(taskStart.getDate() - durationDays);
              } else {
                taskStart = new Date(today);
                taskEnd = new Date(today);
                taskEnd.setDate(taskEnd.getDate() + 1);
              }

              if (taskEnd <= taskStart) {
                taskEnd = new Date(taskStart);
                taskEnd.setDate(taskEnd.getDate() + 1);
              }

              result.push({
                start: taskStart,
                end: taskEnd,
                name: task.title,
                id: `task-${task.id}`,
                type: 'task' as GanttItemType,
                project: `phase-${phase.id}`,
                progress: taskProgress,
                isDisabled: false,
                styles: {
                  progressColor: isDone ? '#10b981' : '#3b82f6',
                  progressSelectedColor: isDone ? '#059669' : '#2563eb',
                  backgroundColor: isDone ? '#d1fae5' : '#dbeafe',
                  backgroundSelectedColor: isDone ? '#a7f3d0' : '#bfdbfe',
                },
                itemType: 'task',
                phaseId: phase.id,
              });
            });
        }
      }
    });

    // フェーズに属さないタスク
    const unassignedTasks = tasks.filter((t) => !t.phase_id && !t.parent_id);
    if (unassignedTasks.length > 0) {
      const dates = unassignedTasks
        .map((t) => (t.due_date ? new Date(t.due_date) : null))
        .filter((d): d is Date => d !== null);

      const unassignedStart =
        dates.length > 0 ? new Date(Math.min(...dates.map((d) => d.getTime()))) : today;
      const unassignedEnd =
        dates.length > 0
          ? new Date(Math.max(...dates.map((d) => d.getTime())))
          : new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000);

      result.push({
        start: unassignedStart,
        end: unassignedEnd,
        name: '📋 未割当タスク',
        id: 'phase-unassigned',
        type: 'project' as GanttItemType,
        progress: 0,
        isDisabled: false,
        hideChildren: !expandedPhases.has('unassigned'),
        styles: {
          progressColor: '#94a3b8',
          progressSelectedColor: '#64748b',
          backgroundColor: '#f1f5f9',
          backgroundSelectedColor: '#e2e8f0',
        },
        itemType: 'phase',
        phaseId: 'unassigned',
      });

      if (expandedPhases.has('unassigned')) {
        unassignedTasks.forEach((task) => {
          const isDone = task.status === 'DONE';
          const taskProgress = task.progress ?? (isDone ? 100 : 0);

          let taskStart = task.start_not_before
            ? new Date(task.start_not_before)
            : new Date(today);
          let taskEnd = task.due_date ? new Date(task.due_date) : new Date(today);
          taskEnd.setDate(taskEnd.getDate() + 1);

          if (taskEnd <= taskStart) {
            taskEnd = new Date(taskStart);
            taskEnd.setDate(taskEnd.getDate() + 1);
          }

          result.push({
            start: taskStart,
            end: taskEnd,
            name: task.title,
            id: `task-${task.id}`,
            type: 'task' as GanttItemType,
            project: 'phase-unassigned',
            progress: taskProgress,
            isDisabled: false,
            styles: {
              progressColor: isDone ? '#10b981' : '#94a3b8',
              progressSelectedColor: isDone ? '#059669' : '#64748b',
              backgroundColor: isDone ? '#d1fae5' : '#f1f5f9',
              backgroundSelectedColor: isDone ? '#a7f3d0' : '#e2e8f0',
            },
            itemType: 'task',
            phaseId: 'unassigned',
          });
        });
      }
    }

    return result;
  }, [tasks, phases, milestones, baselineDiff, expandedPhases, tasksByPhase, milestonesByPhase]);

  // クリックハンドラ
  const handleTaskClick = useCallback(
    (task: GanttTask) => {
      const customTask = task as CustomGanttTask;
      if (customTask.itemType === 'phase' && customTask.phaseId) {
        togglePhaseExpand(customTask.phaseId);
      }
    },
    [togglePhaseExpand]
  );

  // 展開されているフェーズ数
  const expandedCount = expandedPhases.size;
  const totalPhases = phases.length + (tasks.some((t) => !t.phase_id) ? 1 : 0);

  if (ganttTasks.length === 0) {
    return (
      <div className="p-4 flex flex-col items-center justify-center h-64 text-gray-500">
        <p className="mb-2">表示するフェーズがありません</p>
        <p className="text-sm">フェーズを作成してタスクを割り当ててください</p>
      </div>
    );
  }

  return (
    <div className={`project-gantt-container ${className || ''}`}>
      <div className="project-gantt-controls">
        <div className="flex items-center gap-4">
          {/* タスクリスト表示切り替え */}
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none font-medium text-slate-600 hover:text-slate-900 transition-colors">
            <input
              type="checkbox"
              checked={showTaskList}
              onChange={(e) => setShowTaskList(e.target.checked)}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4"
            />
            リスト表示
          </label>

          {/* 展開/折りたたみボタン */}
          <div className="flex items-center gap-1 border-l pl-4 border-slate-200">
            <button
              onClick={expandAll}
              className="text-xs px-2 py-1 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors"
              title="全て展開"
            >
              ▼ 全展開
            </button>
            <button
              onClick={collapseAll}
              className="text-xs px-2 py-1 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors"
              title="全て折りたたみ"
            >
              ▶ 全折畳
            </button>
            <span className="text-xs text-slate-400 ml-2">
              ({expandedCount}/{totalPhases})
            </span>
          </div>

          {/* 凡例 */}
          <div className="flex items-center gap-3 text-xs text-slate-500 bg-slate-50 px-3 py-1.5 rounded-full border border-slate-100 ml-auto">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 bg-slate-200 border border-slate-400 block rounded"></span>
              フェーズ
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 bg-purple-500 block rounded-full"></span>
              マイルストーン
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 bg-blue-200 border border-blue-400 block rounded"></span>
              タスク
            </span>
            <span className="flex items-center gap-1.5">
              🟢🟡🔴 バッファ
            </span>
          </div>
        </div>

        {/* ビューモード切り替え */}
        <div className="project-gantt-view-modes flex bg-slate-100 p-1 rounded-lg">
          <button
            onClick={() => setViewMode(ViewMode.Day)}
            className={`text-xs px-3 py-1.5 rounded-md font-medium transition-all ${
              viewMode === ViewMode.Day
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            日
          </button>
          <button
            onClick={() => setViewMode(ViewMode.Week)}
            className={`text-xs px-3 py-1.5 rounded-md font-medium transition-all ${
              viewMode === ViewMode.Week
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            週
          </button>
          <button
            onClick={() => setViewMode(ViewMode.Month)}
            className={`text-xs px-3 py-1.5 rounded-md font-medium transition-all ${
              viewMode === ViewMode.Month
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            月
          </button>
        </div>
      </div>

      <div className="project-gantt-wrapper">
        <Gantt
          tasks={ganttTasks}
          viewMode={viewMode}
          listCellWidth={showTaskList ? '200px' : ''}
          columnWidth={viewMode === ViewMode.Day ? 60 : viewMode === ViewMode.Week ? 120 : 200}
          rowHeight={44}
          barCornerRadius={8}
          barFill={75}
          fontFamily="Inter, 'Noto Sans JP', sans-serif"
          fontSize="12px"
          locale="ja-JP"
          headerHeight={56}
          todayColor="rgba(59, 130, 246, 0.08)"
          arrowColor="#cbd5e1"
          arrowIndent={20}
          onClick={handleTaskClick}
        />
      </div>
    </div>
  );
};
