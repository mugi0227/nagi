import { useState } from 'react';
import { FaCheckCircle, FaTimesCircle, FaSpinner } from 'react-icons/fa';
import { proposalsApi } from '../../api/proposals';
import type { TaskCreate, ProjectCreate } from '../../api/types';
import './ProposalCard.css';

interface ProposalCardProps {
  proposalId: string;
  proposalType: 'create_task' | 'create_project';
  description: string;
  payload: TaskCreate | ProjectCreate;
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
  const taskPayload = isTask ? (payload as TaskCreate) : null;
  const projectPayload = !isTask ? (payload as ProjectCreate) : null;

  if (status === 'done') {
    return null; // Hide after action
  }

  return (
    <div className="proposal-card">
      <div className="proposal-header">
        <span className="proposal-type-badge">
          {isTask ? '📋 タスク作成の提案' : '📁 プロジェクト作成の提案'}
        </span>
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
            </>
          )}

          {!isTask && projectPayload && (
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
            </>
          )}
        </div>
      </div>

      {error && <div className="proposal-error">{error}</div>}

      <div className="proposal-actions">
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
              承諾
            </>
          )}
        </button>
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
      </div>
    </div>
  );
}
