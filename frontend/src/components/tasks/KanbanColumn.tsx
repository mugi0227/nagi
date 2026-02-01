import type { Task, TaskStatus } from '../../api/types';
import { KanbanCard } from './KanbanCard';
import './KanbanColumn.css';

interface KanbanColumnProps {
  status: TaskStatus;
  title: string;
  tasks: Task[];
  allTasks: Task[];
  subtasksMap: Record<string, Task[]>;
  assigneeByTaskId?: Record<string, string>;
  assignedMemberIdsByTaskId?: Record<string, string[]>;
  memberOptions?: { id: string; label: string }[];
  onAssignMultiple?: (taskId: string, memberUserIds: string[]) => void;
  onEditTask?: (task: Task) => void;
  onDeleteTask?: (id: string) => void;
  onTaskClick?: (task: Task) => void;
  onDrop?: (taskId: string, newStatus: TaskStatus) => void;
  onUpdateTask?: (taskId: string, status: TaskStatus) => void;
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

export function KanbanColumn({
  status,
  title,
  tasks,
  allTasks,
  subtasksMap,
  assigneeByTaskId,
  assignedMemberIdsByTaskId,
  memberOptions,
  onAssignMultiple,
  onEditTask,
  onDeleteTask,
  onTaskClick,
  onDrop,
  onUpdateTask,
  selectionMode = false,
  selectedTaskIds,
  onSelectTask,
  onDragSelectedStart,
  onSingleDragStart,
  compact = false,
}: KanbanColumnProps) {
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.add('drag-over');
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.currentTarget.classList.remove('drag-over');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    const taskId = e.dataTransfer.getData('taskId');
    if (taskId && onDrop) {
      onDrop(taskId, status);
    }
  };

  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    e.dataTransfer.setData('taskId', taskId);
    // If in selection mode and this task is selected, notify parent for multi-select drag
    if (selectionMode && selectedTaskIds?.has(taskId) && onDragSelectedStart) {
      onDragSelectedStart();
    } else {
      // Single task drag (for phase move from sidebar)
      onSingleDragStart?.(taskId);
    }
  };

  return (
    <div
      className={`kanban-column ${compact ? 'compact' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="column-header">
        <h3 className="column-title">{title}</h3>
        <span className="task-count">{tasks.length}</span>
      </div>
      <div className="column-cards">
        {tasks.map((task) => (
          <div
            key={task.id}
            draggable
            onDragStart={(e) => handleDragStart(e, task.id)}
          >
            <KanbanCard
              task={task}
              subtasks={subtasksMap[task.id] || []}
              allTasks={allTasks}
              assigneeName={assigneeByTaskId?.[task.id]}
              assignedMemberIds={assignedMemberIdsByTaskId?.[task.id] || []}
              memberOptions={memberOptions}
              onAssignMultiple={onAssignMultiple}
              onEdit={onEditTask}
              onDelete={onDeleteTask}
              onClick={onTaskClick}
              onUpdateTask={onUpdateTask}
              selectionMode={selectionMode}
              isSelected={selectedTaskIds?.has(task.id) ?? false}
              onSelect={onSelectTask}
              compact={compact}
            />
          </div>
        ))}
        {tasks.length === 0 && (
          <div className="empty-column">
            <p>タスクなし</p>
          </div>
        )}
      </div>
    </div>
  );
}
