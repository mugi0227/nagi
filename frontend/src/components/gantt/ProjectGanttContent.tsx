
import React, { useMemo, useState } from 'react';
import { Gantt, Task as GanttTask, ViewMode } from 'gantt-task-react';
import 'gantt-task-react/dist/index.css';
import { Task, ScheduleDiff } from '../../api/types';
import './ProjectGanttContent.css';

interface ProjectGanttContentProps {
    tasks: Task[];
    baselineDiff: ScheduleDiff | null;
    className?: string;
}

type CustomGanttTask = GanttTask & {
    taskOrigin?: 'actual' | 'plan';
};

export const ProjectGanttContent: React.FC<ProjectGanttContentProps> = ({
    tasks,
    baselineDiff,
    className,
}) => {
    const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.Day);
    const [isChecked, setIsChecked] = useState(true);

    // Convert tasks to Gantt format
    const ganttTasks = useMemo(() => {
        const result: CustomGanttTask[] = [];

        if (baselineDiff) {
            // Mode A: Visualization with Baseline

            // 1. Group tasks by Phase
            const tasksByPhase = new Map<string, typeof baselineDiff.task_diffs>();
            const unassignedTasks: typeof baselineDiff.task_diffs = [];

            baselineDiff.task_diffs.forEach(diff => {
                const task = tasks.find(t => t.id === diff.task_id);
                const phaseId = task?.phase_id || 'unassigned';

                if (phaseId === 'unassigned') {
                    unassignedTasks.push(diff);
                } else {
                    if (!tasksByPhase.has(phaseId)) {
                        tasksByPhase.set(phaseId, []);
                    }
                    tasksByPhase.get(phaseId)!.push(diff);
                }
            });

            // 2. Iterate Phases
            baselineDiff.phase_diffs.forEach(phaseDiff => {
                const phaseId = phaseDiff.phase_id;
                const phaseTasks = tasksByPhase.get(phaseId) || [];
                if (phaseTasks.length === 0) return;

                // Phase Header (Project Task)
                // We use a dummy range, library updates it based on children?
                // Actually gantt-task-react uses the provided range for Project tasks as "Planned" range, 
                // but for rendering children it expands.
                const today = new Date();

                result.push({
                    start: today,
                    end: today,
                    name: phaseDiff.phase_name,
                    id: `phase-${phaseId}`,
                    type: 'project',
                    progress: phaseDiff.buffer_percentage,
                    isDisabled: false,
                    styles: {
                        progressColor: '#6b7280',
                        progressSelectedColor: '#4b5563',
                        backgroundColor: '#f9fafb',
                        backgroundSelectedColor: '#f3f4f6',
                    },
                    hideChildren: false
                });

                // Calculate Max End for Buffer
                let phaseMaxEnd = 0;

                const sortedDiffs = [...phaseTasks].sort((a, b) => {
                    const dateA = a.current_start ? new Date(a.current_start).getTime() : 0;
                    const dateB = b.current_start ? new Date(b.current_start).getTime() : 0;
                    return dateA - dateB;
                });

                sortedDiffs.forEach(diff => {
                    const task = tasks.find(t => t.id === diff.task_id);
                    const isDone = task?.status === 'DONE';
                    const progress = task?.progress ?? (isDone ? 100 : 0);

                    // Actual Bar
                    if (diff.current_start && diff.current_end) {
                        const start = new Date(diff.current_start);
                        const end = new Date(diff.current_end);
                        if (end <= start) end.setTime(start.getTime() + 3600000); // Min 1h

                        if (end.getTime() > phaseMaxEnd) phaseMaxEnd = end.getTime();

                        result.push({
                            start,
                            end,
                            name: diff.title,
                            id: `actual-${diff.task_id}`,
                            type: 'task',
                            project: `phase-${phaseId}`,
                            progress,
                            isDisabled: false,
                            styles: {
                                progressColor: isDone ? '#10b981' : '#3b82f6',
                                progressSelectedColor: '#2563eb',
                                backgroundColor: isDone ? '#d1fae5' : '#dbeafe',
                                backgroundSelectedColor: '#bfdbfe',
                            },
                            taskOrigin: 'actual'
                        });
                    }

                    // Plan Bar
                    if (diff.baseline_start && diff.baseline_end) {
                        const start = new Date(diff.baseline_start);
                        const end = new Date(diff.baseline_end);
                        if (end <= start) end.setTime(start.getTime() + 3600000);

                        result.push({
                            start,
                            end,
                            name: `(計画) ${diff.title}`,
                            id: `plan-${diff.task_id}`,
                            type: 'task',
                            project: `phase-${phaseId}`,
                            progress: 0,
                            isDisabled: true,
                            styles: {
                                progressColor: 'transparent',
                                progressSelectedColor: 'transparent',
                                backgroundColor: '#f3f4f6',
                                backgroundSelectedColor: '#e5e7eb',
                            },
                            taskOrigin: 'plan'
                        });
                    }
                });

                // 3. Add Buffer Visualization
                // If we have a max end time, simulate buffer duration
                // Note: precise buffer length in minutes might be large, check scaling
                // For now, let's just make it visible if there is remaining buffer.

                // To visualize "Used Buffer", we compare projected end vs planned end + buffer?
                // Simple visual: Green bar for Remaining Buffer

                if (phaseDiff.buffer_percentage > 0 && phaseMaxEnd > 0) {
                    // How long is the buffer visually?
                    // Hard to know exact "Buffer Duration" without more info from backend,
                    // but let's assume `phaseDiff.delay_days` gives hints?
                    // Actually `buffer_percentage` is what we have.
                    // Let's just create a generic "Buffer" bar of e.g., 2 days or proportional?
                    // Better to not mislead.
                    // Instead, just show a "Buffer/Milestone" task?

                    const bufferStart = new Date(phaseMaxEnd);
                    // Mock duration: 1 day * (buffer% / 20)? Just to be visible.
                    const bufferEnd = new Date(bufferStart.getTime() + 24 * 3600 * 1000);

                    const statusColor =
                        phaseDiff.buffer_status === 'critical' ? '#ef4444' :
                            phaseDiff.buffer_status === 'warning' ? '#f59e0b' : '#10b981';

                    result.push({
                        start: bufferStart,
                        end: bufferEnd,
                        name: `(バッファ残り ${Math.round(phaseDiff.buffer_percentage)}%)`,
                        id: `buffer-${phaseId}`,
                        type: 'task', // or milestone?
                        project: `phase-${phaseId}`,
                        progress: 100,
                        isDisabled: true,
                        styles: {
                            progressColor: statusColor,
                            progressSelectedColor: statusColor,
                            backgroundColor: '#ecfdf5', // light green
                            backgroundSelectedColor: '#d1fae5',
                        },
                    });
                }
            });

            // Unassigned
            if (unassignedTasks.length > 0) {
                result.push({
                    start: new Date(),
                    end: new Date(),
                    name: '未割当',
                    id: 'phase-unassigned',
                    type: 'project',
                    progress: 0,
                    isDisabled: false,
                    hideChildren: false
                });

                unassignedTasks.forEach(diff => {
                    if (diff.current_start && diff.current_end) {
                        const start = new Date(diff.current_start);
                        const end = new Date(diff.current_end);
                        if (end <= start) end.setTime(start.getTime() + 3600000);

                        result.push({
                            start,
                            end,
                            name: diff.title,
                            id: `actual-${diff.task_id}`,
                            type: 'task',
                            project: 'phase-unassigned',
                            progress: 0,
                            isDisabled: false,
                            styles: {
                                progressColor: '#3b82f6',
                                progressSelectedColor: '#2563eb',
                                backgroundColor: '#dbeafe',
                                backgroundSelectedColor: '#bfdbfe',
                            },
                        });
                    }
                });
            }

        } else {
            // Mode B: No Baseline (Fallback)
            let currentTime = new Date();
            currentTime.setHours(9, 0, 0, 0);

            const sortedTasks = [...tasks].sort((a, b) => {
                if (a.due_date && b.due_date) {
                    return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
                }
                return 0;
            });

            sortedTasks.forEach((task) => {
                const durationMinutes = task.estimated_minutes || 60;
                const startTime = new Date(currentTime);
                const endTime = new Date(startTime.getTime() + durationMinutes * 60 * 1000);
                const isDone = task.status === 'DONE';

                result.push({
                    start: startTime,
                    end: endTime,
                    name: task.title,
                    id: task.id,
                    type: 'task',
                    progress: task.progress || (isDone ? 100 : 0),
                    isDisabled: false,
                    styles: {
                        progressColor: isDone ? '#10b981' : '#3b82f6',
                        progressSelectedColor: '#2563eb',
                        backgroundColor: isDone ? '#d1fae5' : '#dbeafe',
                        backgroundSelectedColor: '#bfdbfe',
                    },
                });
                currentTime = endTime;
            });
        }

        return result;
    }, [tasks, baselineDiff]);

    if (ganttTasks.length === 0) {
        return (
            <div className="p-4 flex flex-col items-center justify-center h-64 text-gray-500">
                <p className="mb-2">表示するタスクがありません</p>
                {!baselineDiff && (
                    <p className="text-sm">※ベースラインを作成すると、より正確なスケジュールが表示されます</p>
                )}
            </div>
        );
    }

    return (
        <div className={`project-gantt-container ${className || ''}`}>
            <div className="project-gantt-controls">
                <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 text-sm cursor-pointer select-none font-medium text-slate-600 hover:text-slate-900 transition-colors">
                        <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => setIsChecked(e.target.checked)}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4"
                        />
                        タスクリストを表示
                    </label>
                    {baselineDiff && (
                        <div className="flex items-center gap-3 text-xs text-slate-500 bg-slate-50 px-3 py-1.5 rounded-full border border-slate-100">
                            <span className="flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 bg-blue-100 border border-blue-400 block rounded-full"></span> 実績
                            </span>
                            <span className="flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 bg-gray-100 border border-gray-300 block rounded-full"></span> 計画
                            </span>
                            <span className="flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 bg-green-100 border border-green-500 block rounded-full"></span> バッファ
                            </span>
                        </div>
                    )}
                </div>
                <div className="project-gantt-view-modes flex bg-slate-100 p-1 rounded-lg">
                    <button
                        onClick={() => setViewMode(ViewMode.Day)}
                        className={`text-xs px-3 py-1.5 rounded-md font-medium transition-all ${viewMode === ViewMode.Day
                            ? 'bg-white text-blue-600 shadow-sm'
                            : 'text-slate-500 hover:text-slate-700'
                            }`}
                    >
                        日
                    </button>
                    <button
                        onClick={() => setViewMode(ViewMode.Week)}
                        className={`text-xs px-3 py-1.5 rounded-md font-medium transition-all ${viewMode === ViewMode.Week
                            ? 'bg-white text-blue-600 shadow-sm'
                            : 'text-slate-500 hover:text-slate-700'
                            }`}
                    >
                        週
                    </button>
                </div>
            </div>

            <div className="project-gantt-wrapper">
                <Gantt
                    tasks={ganttTasks}
                    viewMode={viewMode}
                    listCellWidth={isChecked ? "180px" : ""}
                    columnWidth={viewMode === ViewMode.Day ? 60 : 100}
                    rowHeight={48}
                    barCornerRadius={12}
                    barFill={80}
                    fontFamily="Inter, 'Noto Sans JP', sans-serif"
                    fontSize="12px"
                    locale="ja-JP"
                    headerHeight={60}
                    todayColor="rgba(59, 130, 246, 0.05)"
                    arrowColor="#cbd5e1"
                    arrowIndent={20}
                />
            </div>
        </div>
    );
};
