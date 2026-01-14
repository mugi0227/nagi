import { useMemo } from 'react';
import type { Task, TaskStatus } from '../../api/types';
import { KanbanColumn } from './KanbanColumn';
import { sortTasksByStepNumber } from '../../utils/taskSort';
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
  onBreakdownTask?: (id: string, instruction?: string) => void;
  breakdownTaskId?: string | null;
  sortBy?: 'default' | 'dueDate';
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
  onBreakdownTask,
  breakdownTaskId,
  sortBy: _sortBy,
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

    return grouped;
  }, [parentTasks]);

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
          onBreakdownTask={onBreakdownTask}
          breakdownTaskId={breakdownTaskId}
          onUpdateTask={onUpdateTask}
          onDrop={handleDrop}
        />
      ))}
    </div>
  );
}
