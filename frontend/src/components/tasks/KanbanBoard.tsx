import { useMemo } from 'react';
import type { Task, TaskStatus } from '../../api/types';
import { KanbanColumn } from './KanbanColumn';
import { sortTasksByStepNumber } from '../../utils/taskSort';
import { todayInTimezone } from '../../utils/dateTime';
import './KanbanBoard.css';

interface KanbanBoardProps {
  tasks: Task[];
  onUpdateTask: (id: string, status: TaskStatus) => void;
  onEditTask?: (task: Task) => void;
  onDeleteTask?: (id: string) => void;
  onTaskClick?: (task: Task) => void;
  assigneeByTaskId?: Record<string, string>;
  assignedMemberIdsByTaskId?: Record<string, string[]>;
  memberOptions?: { id: string; label: string }[];
  onAssignMultiple?: (taskId: string, memberUserIds: string[]) => void;
  sortBy?: 'default' | 'dueDate';
  // Selection mode
  selectionMode?: boolean;
  selectedTaskIds?: Set<string>;
  onSelectTask?: (taskId: string) => void;
  onDragSelectedStart?: () => void;
  // Single task drag (for phase move)
  onSingleDragStart?: (taskId: string) => void;
  // View mode
  compact?: boolean;
}

const COLUMNS: { status: TaskStatus; title: string }[] = [
  { status: 'TODO', title: 'To Do' },
  { status: 'IN_PROGRESS', title: 'In Progress' },
  { status: 'WAITING', title: 'Waiting' },
  { status: 'DONE', title: 'Done' },
];

export function KanbanBoard({
  tasks,
  onUpdateTask,
  onEditTask,
  onDeleteTask,
  onTaskClick,
  assigneeByTaskId,
  assignedMemberIdsByTaskId,
  memberOptions,
  onAssignMultiple,
  sortBy = 'default',
  selectionMode = false,
  selectedTaskIds,
  onSelectTask,
  onDragSelectedStart,
  onSingleDragStart,
  compact = false,
}: KanbanBoardProps) {
  // Group tasks: parent tasks only (no parent_id)
  const parentTasks = useMemo(() => {
    return tasks.filter(task => !task.parent_id);
  }, [tasks]);

  // Create subtasks map for easy lookup, sorted by step number
  const subtasksMap = useMemo(() => {
    const map: Record<string, Task[]> = {};
    tasks.forEach((task) => {
      if (task.parent_id) {
        if (!map[task.parent_id]) {
          map[task.parent_id] = [];
        }
        map[task.parent_id].push(task);
      }
    });
    // Sort subtasks by step number [1], [2], [3], etc.
    Object.keys(map).forEach((parentId) => {
      map[parentId] = sortTasksByStepNumber(map[parentId]);
    });
    return map;
  }, [tasks]);

  const tasksByStatus = useMemo(() => {
    const grouped: Record<TaskStatus, Task[]> = {
      TODO: [],
      IN_PROGRESS: [],
      WAITING: [],
      DONE: [],
    };

    parentTasks.forEach((task) => {
      grouped[task.status].push(task);
    });

    if (sortBy === 'dueDate') {
      const todayMs = todayInTimezone().toMillis();
      const isActionable = (t: Task) =>
        !t.start_not_before || new Date(t.start_not_before).getTime() <= todayMs;

      const smartSort = (a: Task, b: Task) => {
        const aOk = isActionable(a);
        const bOk = isActionable(b);
        if (aOk !== bOk) return aOk ? -1 : 1;
        // Not-yet-actionable group: sort by start_not_before ASC
        if (!aOk && !bOk) {
          return new Date(a.start_not_before!).getTime() - new Date(b.start_not_before!).getTime();
        }
        // Actionable group: sort by due_date ASC (nulls last)
        if (!a.due_date && !b.due_date) return 0;
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
      };
      (Object.keys(grouped) as TaskStatus[]).forEach((status) => {
        grouped[status].sort(smartSort);
      });
    }

    return grouped;
  }, [parentTasks, sortBy]);

  const handleDrop = (taskId: string, newStatus: TaskStatus) => {
    onUpdateTask(taskId, newStatus);
  };

  return (
    <div className="kanban-board">
      {COLUMNS.map((column) => (
        <KanbanColumn
          key={column.status}
          status={column.status}
          title={column.title}
          tasks={tasksByStatus[column.status]}
          allTasks={tasks}
          subtasksMap={subtasksMap}
          assigneeByTaskId={assigneeByTaskId}
          assignedMemberIdsByTaskId={assignedMemberIdsByTaskId}
          memberOptions={memberOptions}
          onAssignMultiple={onAssignMultiple}
          onEditTask={onEditTask}
          onDeleteTask={onDeleteTask}
          onTaskClick={onTaskClick}
          onUpdateTask={onUpdateTask}
          onDrop={handleDrop}
          selectionMode={selectionMode}
          selectedTaskIds={selectedTaskIds}
          onSelectTask={onSelectTask}
          onDragSelectedStart={onDragSelectedStart}
          onSingleDragStart={onSingleDragStart}
          compact={compact}
        />
      ))}
    </div>
  );
}
