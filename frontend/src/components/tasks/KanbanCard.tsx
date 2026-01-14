import { useMemo, useState } from 'react';
import { FaCalendarAlt, FaCheckCircle, FaCircle } from 'react-icons/fa';
import { FaBatteryFull, FaBatteryQuarter, FaClock, FaFire, FaHourglass, FaLeaf, FaListCheck, FaLock, FaLockOpen, FaPen, FaTrash, FaUser } from 'react-icons/fa6';
import type { Task, TaskStatus } from '../../api/types';
import { AssigneeSelect } from '../common/AssigneeSelect';
import { StepNumber } from '../common/StepNumber';
import './KanbanCard.css';
import { MeetingBadge } from './MeetingBadge';

interface KanbanCardProps {
  task: Task;
  subtasks?: Task[];
  allTasks?: Task[];
  assigneeName?: string;
  memberOptions?: { id: string; label: string }[];
  assignedMemberIds?: string[];
  onAssignMultiple?: (taskId: string, memberUserIds: string[]) => void;
  onEdit?: (task: Task) => void;
  onDelete?: (id: string) => void;
  onClick?: (task: Task) => void;
  onBreakdown?: (id: string, instruction?: string) => void;
  isBreakdownPending?: boolean;
  onUpdateTask?: (id: string, status: TaskStatus) => void;
}

export function KanbanCard({
  task,
  subtasks = [],
  allTasks = [],
  assigneeName,
  memberOptions,
  assignedMemberIds = [],
  onAssignMultiple,
  onEdit,
  onDelete,
  onClick,
  onBreakdown,
  isBreakdownPending = false,
  onUpdateTask,
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

  const formatStartNotBefore = (value?: string | Date | null) => {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' });
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

  const completedSubtasks = subtasks.filter(st => st.status === 'DONE').length;
  const totalSubtasks = subtasks.length;
  const isDone = task.status === 'DONE';
  const [breakdownInstruction, setBreakdownInstruction] = useState('');

  const taskLookup = useMemo(() => {
    return new Map(allTasks.map(t => [t.id, t]));
  }, [allTasks]);

  const effectiveStartNotBefore = useMemo(() => {
    const dates: Date[] = [];
    if (task.start_not_before) {
      const parsed = new Date(task.start_not_before);
      if (!Number.isNaN(parsed.getTime())) {
        dates.push(parsed);
      }
    }
    let parentId = task.parent_id;
    const seen = new Set<string>();
    while (parentId && !seen.has(parentId)) {
      seen.add(parentId);
      const parent = taskLookup.get(parentId);
      if (!parent) break;
      if (parent.start_not_before) {
        const parsed = new Date(parent.start_not_before);
        if (!Number.isNaN(parsed.getTime())) {
          dates.push(parsed);
        }
      }
      parentId = parent.parent_id;
    }
    if (dates.length === 0) return null;
    return new Date(Math.max(...dates.map(date => date.getTime())));
  }, [task.start_not_before, task.parent_id, taskLookup]);

  const handleBreakdown = () => {
    if (!onBreakdown) return;
    const instruction = breakdownInstruction.trim();
    onBreakdown(task.id, instruction || undefined);
    setBreakdownInstruction('');
  };

  // Check if task is blocked by dependencies
  const dependencyStatus = useMemo(() => {
    if (!task.dependency_ids || task.dependency_ids.length === 0) {
      return { isBlocked: false, blockingTasks: [] };
    }

    const blockingTasks: Task[] = [];

    for (const depId of task.dependency_ids) {
      const depTask = taskLookup.get(depId);
      if (depTask && depTask.status !== 'DONE') {
        blockingTasks.push(depTask);
      }
    }

    return {
      isBlocked: blockingTasks.length > 0,
      blockingTasks,
    };
  }, [task.dependency_ids, taskLookup]);

  const authorName = useMemo(() => {
    return memberOptions?.find(m => m.id === task.user_id)?.label;
  }, [memberOptions, task.user_id]);

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
          {onUpdateTask && (
            <button
              className={`card-action-btn check ${isDone ? 'done' : ''}`}
              onClick={(e) => handleActionClick(e, () => onUpdateTask(task.id, 'DONE'))}
              title={isDone ? '完了済み' : '完了にする'}
              aria-pressed={isDone}
              disabled={isDone}
            >
              {isDone ? <FaCheckCircle /> : <FaCircle />}
            </button>
          )}
          {onEdit && (
            <button
              className="card-action-btn"
              onClick={(e) => handleActionClick(e, () => onEdit(task))}
              title="Edit"
            >
              <FaPen />
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
          <span className="meta-badge assignee" title="担当者">
            <FaUser />
            <span>{assigneeName}</span>
          </span>
        )}
        {authorName && authorName !== assigneeName && (
          <span className="meta-badge author" title="作成者">
            <FaPen style={{ fontSize: '0.8em' }} />
            <span>{authorName}</span>
          </span>
        )}
        {task.due_date && (
          <span className="meta-badge due-date" title="期限">
            <FaClock />
            <span>{new Date(task.due_date).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })}期限</span>
          </span>
        )}
        {!task.is_fixed_time && effectiveStartNotBefore && (
          <span className="meta-badge start-not-before" title="着手可能日">
            <FaCalendarAlt />
            <span>{formatStartNotBefore(effectiveStartNotBefore)}〜</span>
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

      {onBreakdown && (
        <div
          className="breakdown-control"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <input
            type="text"
            className="breakdown-input"
            value={breakdownInstruction}
            onChange={(e) => setBreakdownInstruction(e.target.value)}
            placeholder="タスク分解の指示（任意）"
            disabled={isBreakdownPending}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !isBreakdownPending) {
                handleBreakdown();
              }
            }}
          />
          <button
            type="button"
            className="breakdown-btn"
            onClick={(e) => handleActionClick(e, handleBreakdown)}
            disabled={isBreakdownPending}
            aria-busy={isBreakdownPending}
          >
            <FaListCheck />
            <span>AIで分解</span>
          </button>
        </div>
      )}

      {memberOptions && memberOptions.length > 0 && onAssignMultiple && (
        <div className="card-assignee-row">
          <AssigneeSelect
            taskId={task.id}
            selectedIds={assignedMemberIds}
            options={memberOptions}
            onChange={onAssignMultiple}
            compact
          />
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
