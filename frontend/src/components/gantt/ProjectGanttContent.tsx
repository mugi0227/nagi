import React, { useMemo, useState, useCallback } from 'react';
import { Gantt, Task as GanttTask, ViewMode } from 'gantt-task-react';
import 'gantt-task-react/dist/index.css';
import { Task, Phase, Milestone } from '../../api/types';
import { useTimezone } from '../../hooks/useTimezone';
import { toDateTime, todayInTimezone } from '../../utils/dateTime';
import './ProjectGanttContent.css';

interface ProjectGanttContentProps {
  tasks: Task[];
  phases: Phase[];
  milestones: Milestone[];
  className?: string;
}

type GanttItemType = 'project' | 'task' | 'milestone';

interface CustomGanttTask extends GanttTask {
  itemType?: 'phase' | 'task' | 'milestone' | 'buffer';
  phaseId?: string;
}

export const ProjectGanttContent: React.FC<ProjectGanttContentProps> = ({
  tasks,
  phases,
  milestones,
  className,
}) => {
  const timezone = useTimezone();
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
    const today = todayInTimezone(timezone);

    // フェーズ順にソート
    const sortedPhases = [...phases].sort(
      (a, b) => a.order_in_project - b.order_in_project
    );

    sortedPhases.forEach((phase) => {
      // フェーズの期間を決定
      let phaseStart: ReturnType<typeof toDateTime>;
      let phaseEnd: ReturnType<typeof toDateTime>;

      if (phase.start_date && phase.end_date) {
        phaseStart = toDateTime(phase.start_date, timezone);
        phaseEnd = toDateTime(phase.end_date, timezone);
      } else {
        // フェーズに日付がない場合、タスクから推定
        const phaseTasks = tasksByPhase.get(phase.id) || [];
        const phaseMilestones = milestonesByPhase.get(phase.id) || [];

        const dates: ReturnType<typeof toDateTime>[] = [];
        phaseTasks.forEach((t) => {
          if (t.due_date) dates.push(toDateTime(t.due_date, timezone));
          if (t.start_not_before) dates.push(toDateTime(t.start_not_before, timezone));
        });
        phaseMilestones.forEach((m) => {
          if (m.due_date) dates.push(toDateTime(m.due_date, timezone));
        });

        const validDates = dates.filter((d) => d.isValid);
        if (validDates.length > 0) {
          const minMillis = Math.min(...validDates.map((d) => d.toMillis()));
          const maxMillis = Math.max(...validDates.map((d) => d.toMillis()));
          phaseStart = toDateTime(new Date(minMillis), timezone);
          phaseEnd = toDateTime(new Date(maxMillis), timezone);
        } else {
          phaseStart = today;
          phaseEnd = today.plus({ days: 14 });
        }
      }

      // フェーズ内のタスク数
      const phaseTasks = tasksByPhase.get(phase.id) || [];
      const completedTasks = phaseTasks.filter((t) => t.status === 'DONE').length;
      const totalTasks = phaseTasks.length;
      const progress = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

      const isExpanded = expandedPhases.has(phase.id);

      // フェーズ行を追加（project type）
      result.push({
        start: phaseStart.toJSDate(),
        end: phaseEnd.toJSDate(),
        name: phase.name,
        id: `phase-${phase.id}`,
        type: 'project' as GanttItemType,
        progress,
        isDisabled: false,
        hideChildren: !isExpanded,
        styles: {
          progressColor: '#10b981',
          progressSelectedColor: '#10b981',
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
            const dueDate = toDateTime(milestone.due_date, timezone);
            result.push({
              start: dueDate.toJSDate(),
              end: dueDate.toJSDate(),
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

      // タスクを追加（展開時のみ）
      if (isExpanded) {
        // タスクを着手日/作成日〜期限で表示
        phaseTasks
            .filter((t) => !t.parent_id) // 親タスクのみ
            .sort((a, b) => {
              const dateA = a.due_date ? toDateTime(a.due_date, timezone).toMillis() : 0;
              const dateB = b.due_date ? toDateTime(b.due_date, timezone).toMillis() : 0;
              return dateA - dateB;
            })
            .forEach((task) => {
              const isDone = task.status === 'DONE';
              const taskProgress = task.progress ?? (isDone ? 100 : 0);

              // 日付を決定
              let taskStart: ReturnType<typeof toDateTime>;
              let taskEnd: ReturnType<typeof toDateTime>;

              if (task.start_not_before && task.due_date) {
                taskStart = toDateTime(task.start_not_before, timezone);
                taskEnd = toDateTime(task.due_date, timezone);
              } else if (task.due_date) {
                taskEnd = toDateTime(task.due_date, timezone);
                const durationDays = Math.ceil(
                  (task.estimated_minutes || 60) / (8 * 60)
                );
                taskStart = taskEnd.minus({ days: durationDays });
              } else {
                taskStart = today;
                taskEnd = today.plus({ days: 1 });
              }

              if (taskEnd.toMillis() <= taskStart.toMillis()) {
                taskEnd = taskStart.plus({ days: 1 });
              }

              result.push({
                start: taskStart.toJSDate(),
                end: taskEnd.toJSDate(),
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
    });

    // フェーズに属さないタスク
    const unassignedTasks = tasks.filter((t) => !t.phase_id && !t.parent_id);
    if (unassignedTasks.length > 0) {
      const dates = unassignedTasks
        .map((t) => (t.due_date ? toDateTime(t.due_date, timezone) : null))
        .filter((d): d is ReturnType<typeof toDateTime> => d !== null);

      const validDates = dates.filter((d) => d.isValid);
      const unassignedStart =
        validDates.length > 0
          ? toDateTime(new Date(Math.min(...validDates.map((d) => d.toMillis()))), timezone)
          : today;
      const unassignedEnd =
        validDates.length > 0
          ? toDateTime(new Date(Math.max(...validDates.map((d) => d.toMillis()))), timezone)
          : today.plus({ days: 14 });

      result.push({
        start: unassignedStart.toJSDate(),
        end: unassignedEnd.toJSDate(),
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
            ? toDateTime(task.start_not_before, timezone)
            : today;
          let taskEnd = task.due_date ? toDateTime(task.due_date, timezone) : today;
          taskEnd = taskEnd.plus({ days: 1 });

          if (taskEnd.toMillis() <= taskStart.toMillis()) {
            taskEnd = taskStart.plus({ days: 1 });
          }

          result.push({
            start: taskStart.toJSDate(),
            end: taskEnd.toJSDate(),
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
  }, [
    tasks,
    phases,
    milestones,
    expandedPhases,
    tasksByPhase,
    milestonesByPhase,
    timezone,
  ]);

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
