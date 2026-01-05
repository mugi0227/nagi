import { FaFire, FaClock, FaLeaf, FaBatteryFull, FaBatteryQuarter, FaPen, FaTrash, FaHourglass, FaLock, FaLockOpen, FaListCheck, FaUser } from 'react-icons/fa6';
import { FaCheckCircle, FaCircle } from 'react-icons/fa';
import type { Task } from '../../api/types';
import { MeetingBadge } from './MeetingBadge';
import { StepNumber } from '../common/StepNumber';
import './KanbanCard.css';
import { useMemo } from 'react';

interface KanbanCardProps {
  task: Task;
  subtasks?: Task[];
  allTasks?: Task[];
  assigneeName?: string;
  memberOptions?: { id: string; label: string }[];
  assignedMemberId?: string | null;
  onAssign?: (taskId: string, memberUserId: string | null) => void;
  onEdit?: (task: Task) => void;
  onDelete?: (id: string) => void;
  onClick?: (task: Task) => void;
  onBreakdown?: (id: string) => void;
  isBreakdownPending?: boolean;
}

export function KanbanCard({
  task,
  subtasks = [],
  allTasks = [],
  assigneeName,
  memberOptions,
  assignedMemberId,
  onAssign,
  onEdit,
  onDelete,
  onClick,
  onBreakdown,
  isBreakdownPending = false,
}: KanbanCardProps) {
  const getPriorityIcon = (level: string) => {
    switch (level) {
      case 'HIGH':
        return <FaFire />;
      case 'MEDIUM':
        return <FaClock />;
      case 'LOW':
        return <FaLeaf />;
      default:
        return <FaLeaf />;
    }
  };

  const getEnergyIcon = (level: string) => {
    return level === 'HIGH' ? <FaBatteryFull /> : <FaBatteryQuarter />;
  };

  const handleCardClick = () => {
    if (onClick) {
      onClick(task);
    }
  };

  const handleActionClick = (e: React.MouseEvent, action: () => void) => {
    e.stopPropagation();
    action();
  };

  const handleAssigneeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (!onAssign) return;
    const value = e.target.value;
    onAssign(task.id, value ? value : null);
  };

  const completedSubtasks = subtasks.filter(st => st.status === 'DONE').length;
  const totalSubtasks = subtasks.length;

  // Check if task is blocked by dependencies
  const dependencyStatus = useMemo(() => {
    if (!task.dependency_ids || task.dependency_ids.length === 0) {
      return { isBlocked: false, blockingTasks: [] };
    }

    const taskMap = new Map(allTasks.map(t => [t.id, t]));
    const blockingTasks: Task[] = [];

    for (const depId of task.dependency_ids) {
      const depTask = taskMap.get(depId);
      if (depTask && depTask.status !== 'DONE') {
        blockingTasks.push(depTask);
      }
    }

    return {
      isBlocked: blockingTasks.length > 0,
      blockingTasks,
    };
  }, [task.dependency_ids, allTasks]);

  return (
    <div
      className={`kanban-card ${dependencyStatus.isBlocked ? 'blocked' : ''}`}
      draggable
      onClick={handleCardClick}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
      title={
        dependencyStatus.isBlocked
          ? `ブロック中: ${dependencyStatus.blockingTasks.map(t => t.title).join(', ')}を先に完了してください`
          : undefined
      }
    >
      <div className="card-header-row">
        {dependencyStatus.isBlocked ? (
          <div className="dependency-indicator locked" title="依存タスクが未完了">
            <FaLock />
          </div>
        ) : task.dependency_ids && task.dependency_ids.length > 0 ? (
          <div className="dependency-indicator unlocked" title="依存タスク完了済み">
            <FaLockOpen />
          </div>
        ) : null}
        <h4 className="card-title">{task.title}</h4>
        <div className="card-actions">
          {onEdit && (
            <button
              className="card-action-btn"
              onClick={(e) => handleActionClick(e, () => onEdit(task))}
              title="Edit"
            >
              <FaPen />
            </button>
          )}
          {onBreakdown && (
            <button
              className="card-action-btn breakdown"
              onClick={(e) => handleActionClick(e, () => onBreakdown(task.id))}
              title={isBreakdownPending ? 'タスク分解中...' : 'タスク分解'}
              disabled={isBreakdownPending}
              aria-busy={isBreakdownPending}
            >
              <FaListCheck />
            </button>
          )}
          {onDelete && (
            <button
              className="card-action-btn delete"
              onClick={(e) => handleActionClick(e, () => onDelete(task.id))}
              title="Delete"
            >
              <FaTrash />
            </button>
          )}
        </div>
      </div>

      {task.description && (
        <p className="card-description">{task.description}</p>
      )}

      {/* Meeting Badge */}
      {task.is_fixed_time && (
        <MeetingBadge task={task} showDetails={true} />
      )}

      <div className="card-meta">
        {assigneeName && (
          <span className="meta-badge assignee">
            <FaUser />
            <span>{assigneeName}</span>
          </span>
        )}
        <span
          className={`meta-badge urgency-${task.urgency.toLowerCase()}`}
        >
          {getPriorityIcon(task.urgency)}
          <span>{task.urgency}</span>
        </span>
        <span
          className={`meta-badge energy-${task.energy_level.toLowerCase()}`}
        >
          {getEnergyIcon(task.energy_level)}
          <span>{task.energy_level}</span>
        </span>
      </div>

      {memberOptions && memberOptions.length > 0 && onAssign && (
        <div className="card-assignee-row">
          <label className="assignee-label" htmlFor={`assignee-${task.id}`}>
            担当
          </label>
          <select
            id={`assignee-${task.id}`}
            className="assignee-select"
            value={assignedMemberId ?? ''}
            onChange={handleAssigneeChange}
            onClick={(e) => e.stopPropagation()}
          >
            <option value="">未割り当て</option>
            {memberOptions.map((member) => (
              <option key={member.id} value={member.id}>
                {member.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Subtasks Summary */}
      {totalSubtasks > 0 && (
        <div className="subtasks-summary">
          <div className="subtasks-progress">
            <div className="subtasks-label">
              <FaCheckCircle className="subtasks-icon" />
              <span>{completedSubtasks}/{totalSubtasks} サブタスク完了</span>
            </div>
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${(completedSubtasks / totalSubtasks) * 100}%` }}
              />
            </div>
          </div>
          <ul className="subtasks-mini-list">
            {subtasks.slice(0, 3).map((subtask) => {
              const stepNumber = subtask.order_in_parent;
              return (
                <li key={subtask.id} className="subtask-mini-item">
                  {subtask.status === 'DONE' ? (
                    <FaCheckCircle className="subtask-mini-icon done" />
                  ) : (
                    <FaCircle className="subtask-mini-icon" />
                  )}
                  {stepNumber != null && (
                    <StepNumber stepNumber={stepNumber} className="small" />
                  )}
                  <span className={subtask.status === 'DONE' ? 'subtask-mini-text done' : 'subtask-mini-text'}>
                    {subtask.title}
                  </span>
                </li>
              );
            })}
            {totalSubtasks > 3 && (
              <li className="subtasks-more">他 {totalSubtasks - 3} 件</li>
            )}
          </ul>
        </div>
      )}

      {task.estimated_minutes && (
        <div className="card-footer">
          <FaHourglass />
          <span className="estimate-time">{task.estimated_minutes}分</span>
        </div>
      )}
    </div>
  );
}
