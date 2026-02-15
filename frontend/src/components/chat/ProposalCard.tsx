import { useState } from 'react';
import { FaCheckCircle, FaTimesCircle, FaSpinner } from 'react-icons/fa';
import { proposalsApi } from '../../api/proposals';
import type {
  TaskCreate,
  ProjectCreate,
  MemoryCreate,
  TaskAssignmentProposal,
  PhaseBreakdownProposal,
  ToolActionProposalPayload,
} from '../../api/types';
import { useTimezone } from '../../hooks/useTimezone';
import { formatDate as formatDateValue, toDateTime } from '../../utils/dateTime';
import './ProposalCard.css';

interface ProposalCardProps {
  proposalId: string;
  proposalType:
    | 'create_task'
    | 'create_project'
    | 'create_work_memory'
    | 'assign_task'
    | 'phase_breakdown'
    | 'tool_action';
  description: string;
  payload: TaskCreate | ProjectCreate | MemoryCreate | TaskAssignmentProposal | PhaseBreakdownProposal | ToolActionProposalPayload;
  onApprove?: () => void;
  onReject?: () => void;
}

export function ProposalCard({
  proposalId,
  proposalType,
  description,
  payload,
  onApprove,
  onReject,
}: ProposalCardProps) {
  const timezone = useTimezone();
  const formatTime = (value: Date) =>
    formatDateValue(value, { hour: '2-digit', minute: '2-digit' }, timezone);
  const formatDate = (value: Date) =>
    formatDateValue(value, { month: 'numeric', day: 'numeric', weekday: 'short' }, timezone);
  const [status, setStatus] = useState<'pending' | 'approving' | 'rejecting' | 'done'>('pending');
  const [error, setError] = useState<string | null>(null);

  const handleApprove = async () => {
    setStatus('approving');
    setError(null);
    try {
      await proposalsApi.approve(proposalId);
      setStatus('done');
      if (onApprove) {
        onApprove();
      }
    } catch (err) {
      setError('承諾に失敗しました');
      setStatus('pending');
      console.error('Failed to approve proposal:', err);
    }
  };

  const handleReject = async () => {
    setStatus('rejecting');
    setError(null);
    try {
      await proposalsApi.reject(proposalId);
      setStatus('done');
      if (onReject) {
        onReject();
      }
    } catch (err) {
      setError('却下に失敗しました');
      setStatus('pending');
      console.error('Failed to reject proposal:', err);
    }
  };

  const isTask = proposalType === 'create_task';
  const isProject = proposalType === 'create_project';
  const isWorkMemory = proposalType === 'create_work_memory';
  const isAssignment = proposalType === 'assign_task';
  const isPhaseBreakdown = proposalType === 'phase_breakdown';
  const isToolAction = proposalType === 'tool_action';
  const taskPayload = isTask ? (payload as TaskCreate) : null;
  const projectPayload = isProject ? (payload as ProjectCreate) : null;
  const workMemoryPayload = isWorkMemory ? (payload as MemoryCreate) : null;
  const assignmentPayload = isAssignment ? (payload as TaskAssignmentProposal) : null;
  const phasePayload = isPhaseBreakdown ? (payload as PhaseBreakdownProposal) : null;
  const toolPayload = isToolAction ? (payload as ToolActionProposalPayload) : null;
  const badgeLabel = isToolAction
    ? 'Approval required'
    : isTask
      ? 'Task draft'
      : isWorkMemory
        ? 'Work-memory draft'
        : isAssignment
          ? 'Assignment draft'
          : isPhaseBreakdown
            ? 'Phase plan'
            : 'Project draft';
  const meetingPreview = (() => {
    if (!isTask || !taskPayload?.is_fixed_time || !taskPayload.start_time || !taskPayload.end_time) {
      return null;
    }
    const start = toDateTime(taskPayload.start_time, timezone);
    const end = toDateTime(taskPayload.end_time, timezone);
    if (!start.isValid || !end.isValid) {
      return null;
    }
    const startMinutes = start.hour * 60 + start.minute;
    const endMinutes = end.hour * 60 + end.minute;
    const hourHeight = 28;
    const previewStartHour = Math.max(6, Math.min(9, Math.floor(startMinutes / 60) - 1));
    const previewEndHour = Math.min(22, Math.max(18, Math.ceil(endMinutes / 60) + 1));
    const hourCount = previewEndHour - previewStartHour;
    const hours = Array.from(
      { length: hourCount },
      (_, index) => previewStartHour + index
    );
    const startBound = previewStartHour * 60;
    const endBound = previewEndHour * 60;
    const clampedStart = Math.max(startBound, startMinutes);
    const clampedEnd = Math.min(endBound, Math.max(endMinutes, startMinutes + 15));
    const top = ((clampedStart - startBound) / 60) * hourHeight;
    const height = Math.max(14, ((clampedEnd - clampedStart) / 60) * hourHeight);
    const totalHeight = hourCount * hourHeight;
    return {
      start: start.toJSDate(),
      end: end.toJSDate(),
      hours,
      top,
      height,
      totalHeight,
    };
  })();

  if (status === 'done') {
    return null; // Hide after action
  }

  return (
    <div className="proposal-card">
      <div className="proposal-header">
        <span className="proposal-type-badge">{badgeLabel}</span>
      </div>

      <div className="proposal-body">
        <p className="proposal-description">{description}</p>

        <div className="proposal-details">
          {isTask && taskPayload && (
            <>
              <div className="proposal-detail-row">
                <span className="detail-label">タイトル:</span>
                <span className="detail-value">{taskPayload.title}</span>
              </div>
              {taskPayload.description && (
                <div className="proposal-detail-row">
                  <span className="detail-label">説明:</span>
                  <span className="detail-value">{taskPayload.description}</span>
                </div>
              )}
              <div className="proposal-detail-row">
                <span className="detail-label">優先度:</span>
                <span className="detail-value">
                  {taskPayload.importance || 'MEDIUM'} / {taskPayload.urgency || 'MEDIUM'}
                </span>
              </div>
              {taskPayload.estimated_minutes && (
                <div className="proposal-detail-row">
                  <span className="detail-label">見積:</span>
                  <span className="detail-value">{taskPayload.estimated_minutes}分</span>
                </div>
              )}

              {meetingPreview && (
                <div className="proposal-meeting-preview">
                  <div className="proposal-meeting-label">Scheduler preview</div>
                  <div className="proposal-meeting-date">{formatDate(meetingPreview.start)}</div>
                  <div className="proposal-meeting-grid">
                    <div className="proposal-meeting-times">
                      {meetingPreview.hours.map(hour => (
                        <div key={hour} className="proposal-meeting-time-slot">
                          {String(hour).padStart(2, '0')}:00
                        </div>
                      ))}
                    </div>
                    <div className="proposal-meeting-track" style={{ height: `${meetingPreview.totalHeight}px` }}>
                      <div className="proposal-meeting-lines">
                        {meetingPreview.hours.map(hour => (
                          <span key={hour} className="proposal-meeting-line" />
                        ))}
                      </div>
                      <div
                        className="proposal-meeting-block"
                        style={{ top: `${meetingPreview.top}px`, height: `${meetingPreview.height}px` }}
                      >
                        <div className="proposal-meeting-title">{taskPayload.title}</div>
                        <div className="proposal-meeting-time">
                          {formatTime(meetingPreview.start)} - {formatTime(meetingPreview.end)}
                        </div>
                        {taskPayload.location && (
                          <div className="proposal-meeting-location">{taskPayload.location}</div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {isProject && projectPayload && (
            <>
              <div className="proposal-detail-row">
                <span className="detail-label">プロジェクト名:</span>
                <span className="detail-value">{projectPayload.name}</span>
              </div>
              {projectPayload.description && (
                <div className="proposal-detail-row">
                  <span className="detail-label">概要:</span>
                  <span className="detail-value">{projectPayload.description}</span>
                </div>
              )}
              {projectPayload.goals && projectPayload.goals.length > 0 && (
                <div className="proposal-detail-row">
                  <span className="detail-label">ゴール:</span>
                  <ul className="detail-list">
                    {projectPayload.goals.map((goal, idx) => (
                      <li key={idx}>{goal}</li>
                    ))}
                  </ul>
                </div>
              )}
              {projectPayload.context && (
                <div className="proposal-detail-row">
                  <span className="detail-label">README:</span>
                  <span className="detail-value detail-value-pre">
                    {projectPayload.context}
                  </span>
                </div>
              )}
            </>
          )}

          {isWorkMemory && workMemoryPayload && (
            <>
              <div className="proposal-detail-row">
                <span className="detail-label">内容:</span>
                <span className="detail-value detail-value-pre">
                  {workMemoryPayload.content}
                </span>
              </div>
              {workMemoryPayload.tags && workMemoryPayload.tags.length > 0 && (
                <div className="proposal-detail-row">
                  <span className="detail-label">タグ:</span>
                  <span className="detail-value">
                    {workMemoryPayload.tags.join(', ')}
                  </span>
                </div>
              )}
            </>
          )}

          {isAssignment && assignmentPayload && (
            <>
              <div className="proposal-detail-row">
                <span className="detail-label">Task ID:</span>
                <span className="detail-value">{assignmentPayload.task_id}</span>
              </div>
              <div className="proposal-detail-row">
                <span className="detail-label">Assignees:</span>
                <span className="detail-value">
                  {assignmentPayload.assignee_ids.join(', ')}
                </span>
              </div>
            </>
          )}

          {isPhaseBreakdown && phasePayload && (
            <>
              <div className="proposal-detail-row">
                <span className="detail-label">Project ID:</span>
                <span className="detail-value">{phasePayload.project_id}</span>
              </div>
              {phasePayload.instruction && (
                <div className="proposal-detail-row">
                  <span className="detail-label">Instruction:</span>
                  <span className="detail-value">{phasePayload.instruction}</span>
                </div>
              )}
              {typeof phasePayload.create_milestones === 'boolean' && (
                <div className="proposal-detail-row">
                  <span className="detail-label">Milestones:</span>
                  <span className="detail-value">
                    {phasePayload.create_milestones ? 'Create on approve' : 'Skip on approve'}
                  </span>
                </div>
              )}
              <div className="proposal-detail-row">
                <span className="detail-label">Phases:</span>
                <div className="detail-value">
                  <div className="phase-breakdown-list">
                    {phasePayload.phases.map((phase, idx) => (
                      <div key={`${phase.name}-${idx}`} className="phase-breakdown-item">
                        <div className="phase-breakdown-title">
                          {idx + 1}. {phase.name}
                        </div>
                        {phase.description && (
                          <div className="phase-breakdown-desc">{phase.description}</div>
                        )}
                        {phase.milestones && phase.milestones.length > 0 && (
                          <ul className="phase-breakdown-milestones">
                            {phase.milestones.map((milestone, mIdx) => (
                              <li key={`${milestone.title}-${mIdx}`}>
                                <span className="phase-breakdown-milestone-title">
                                  {milestone.title}
                                </span>
                                {milestone.due_date && (
                                  <span className="phase-breakdown-milestone-date">
                                    {milestone.due_date}
                                  </span>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          {isToolAction && toolPayload && (
            <>
              <div className="proposal-detail-row">
                <span className="detail-label">Tool:</span>
                <span className="detail-value">{toolPayload.tool_name}</span>
              </div>
              <div className="proposal-detail-row">
                <span className="detail-label">Args:</span>
                <span className="detail-value detail-value-pre">
                  {JSON.stringify(toolPayload.args || {}, null, 2)}
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {error && <div className="proposal-error">{error}</div>}

      <div className="proposal-actions">
        <button
          className="proposal-btn reject"
          onClick={handleReject}
          disabled={status !== 'pending'}
        >
          {status === 'rejecting' ? (
            <>
              <FaSpinner className="spinner" />
              却下中...
            </>
          ) : (
            <>
              <FaTimesCircle />
              却下
            </>
          )}
        </button>
        <button
          className="proposal-btn approve"
          onClick={handleApprove}
          disabled={status !== 'pending'}
        >
          {status === 'approving' ? (
            <>
              <FaSpinner className="spinner" />
              承諾中...
            </>
          ) : (
            <>
              <FaCheckCircle />
              提案を承諾
            </>
          )}
        </button>
      </div>
    </div>
  );
}
