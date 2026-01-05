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
  assignedMemberIdByTaskId?: Record<string, string>;
  memberOptions?: { id: string; label: string }[];
  onAssign?: (taskId: string, memberUserId: string | null) => void;
  onEditTask?: (task: Task) => void;
  onDeleteTask?: (id: string) => void;
  onTaskClick?: (task: Task) => void;
  onBreakdownTask?: (id: string) => void;
  breakdownTaskId?: string | null;
  onDrop?: (taskId: string, newStatus: TaskStatus) => void;
}

export function KanbanColumn({
  status,
  title,
  tasks,
  allTasks,
  subtasksMap,
  assigneeByTaskId,
  assignedMemberIdByTaskId,
  memberOptions,
  onAssign,
  onEditTask,
  onDeleteTask,
  onTaskClick,
  onBreakdownTask,
  breakdownTaskId,
  onDrop,
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
  };

  return (
    <div
      className="kanban-column"
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
              assignedMemberId={assignedMemberIdByTaskId?.[task.id]}
              memberOptions={memberOptions}
              onAssign={onAssign}
              onEdit={onEditTask}
              onDelete={onDeleteTask}
              onClick={onTaskClick}
              onBreakdown={onBreakdownTask}
              isBreakdownPending={breakdownTaskId === task.id}
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
