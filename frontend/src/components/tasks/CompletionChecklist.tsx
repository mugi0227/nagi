import { FaCircleCheck, FaRegCircle } from 'react-icons/fa6';
import type { TaskAssignment } from '../../api/types';
import './CompletionChecklist.css';

interface CompletionChecklistProps {
  assignments: TaskAssignment[];
  memberOptions: { id: string; label: string }[];
  currentUserId?: string;
  onCheck?: (taskId: string) => void;
  taskId: string;
  compact?: boolean;
}

export function CompletionChecklist({
  assignments,
  memberOptions,
  currentUserId,
  onCheck,
  taskId,
  compact = false,
}: CompletionChecklistProps) {
  const checkedCount = assignments.filter(a => a.status === 'DONE').length;
  const totalCount = assignments.length;

  const getMemberName = (assigneeId: string) => {
    return memberOptions.find(m => m.id === assigneeId)?.label || assigneeId;
  };

  if (compact) {
    return (
      <span className="completion-badge" title="全員確認">
        <FaCircleCheck className="completion-badge-icon" />
        <span>{checkedCount}/{totalCount} 確認済み</span>
      </span>
    );
  }

  return (
    <div className="completion-checklist">
      <div className="completion-checklist-header">
        全員確認状況 ({checkedCount}/{totalCount})
      </div>
      <ul className="completion-checklist-list">
        {assignments.map(assignment => {
          const isChecked = assignment.status === 'DONE';
          const isMe = currentUserId === assignment.assignee_id;
          const name = getMemberName(assignment.assignee_id);

          return (
            <li key={assignment.id} className={`completion-checklist-item ${isChecked ? 'checked' : ''}`}>
              <button
                type="button"
                className={`completion-check-btn ${isChecked ? 'checked' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (isMe && onCheck) onCheck(taskId);
                }}
                disabled={!isMe}
                title={isMe ? (isChecked ? '確認を取り消す' : '確認する') : `${name}の確認状況`}
              >
                {isChecked ? <FaCircleCheck /> : <FaRegCircle />}
              </button>
              <span className="completion-check-name">
                {name}{isMe ? ' (自分)' : ''}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
