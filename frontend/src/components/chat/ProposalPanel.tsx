import { useState } from 'react';
import { FaCheckCircle, FaTimesCircle, FaSpinner } from 'react-icons/fa';
import { FaChevronLeft, FaChevronRight, FaCheckDouble, FaXmark } from 'react-icons/fa6';
import { proposalsApi, type ApprovalResult } from '../../api/proposals';
import type { ProposalInfo } from '../../hooks/useChat';
import type {
  TaskCreate,
  ProjectCreate,
  MemoryCreate,
  TaskAssignmentProposal,
  PhaseBreakdownProposal,
  ToolActionProposalPayload,
} from '../../api/types';
import './ProposalPanel.css';

interface ProposalPanelProps {
  proposals: ProposalInfo[];
  onApproved: (
    proposalId: string,
    proposal: ProposalInfo,
    result: ApprovalResult,
  ) => void | Promise<void>;
  onRejected: (proposalId: string) => void | Promise<void>;
  onAllApproved: (
    approvedProposals: ProposalInfo[],
    results: Record<string, ApprovalResult>,
  ) => void | Promise<void>;
  onAllRejected: () => void | Promise<void>;
}

const getBadgeLabel = (proposalType: string) => {
  switch (proposalType) {
    case 'tool_action':
      return 'Approval required';
    case 'create_task':
      return 'Task draft';
    case 'create_work_memory':
      return 'Work-memory draft';
    case 'assign_task':
      return 'Assignment draft';
    case 'phase_breakdown':
      return 'Phase plan';
    default:
      return 'Project draft';
  }
};

export function ProposalPanel({
  proposals,
  onApproved,
  onRejected,
  onAllApproved,
  onAllRejected,
}: ProposalPanelProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [processingAll, setProcessingAll] = useState<'approve' | 'reject' | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (proposals.length === 0) {
    return null;
  }

  const currentProposal = proposals[currentIndex];
  const hasMultiple = proposals.length > 1;

  const handlePrev = () => {
    setCurrentIndex((prev) => Math.max(0, prev - 1));
    setError(null);
  };

  const handleNext = () => {
    setCurrentIndex((prev) => Math.min(proposals.length - 1, prev + 1));
    setError(null);
  };

  const handleApprove = async () => {
    setProcessingId(currentProposal.proposalId);
    setError(null);
    try {
      const result = await proposalsApi.approve(currentProposal.proposalId);
      await onApproved(currentProposal.proposalId, currentProposal, result);
      // Move to next or adjust index
      if (currentIndex >= proposals.length - 1 && currentIndex > 0) {
        setCurrentIndex(currentIndex - 1);
      }
    } catch (err) {
      setError('承諾に失敗しました');
      console.error('Failed to approve proposal:', err);
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async () => {
    setProcessingId(currentProposal.proposalId);
    setError(null);
    try {
      await proposalsApi.reject(currentProposal.proposalId);
      await onRejected(currentProposal.proposalId);
      // Move to next or adjust index
      if (currentIndex >= proposals.length - 1 && currentIndex > 0) {
        setCurrentIndex(currentIndex - 1);
      }
    } catch (err) {
      setError('却下に失敗しました');
      console.error('Failed to reject proposal:', err);
    } finally {
      setProcessingId(null);
    }
  };

  const handleApproveAll = async () => {
    setProcessingAll('approve');
    setError(null);
    try {
      const results: Record<string, ApprovalResult> = {};
      for (const proposal of proposals) {
        results[proposal.proposalId] = await proposalsApi.approve(proposal.proposalId);
      }
      await onAllApproved(proposals, results);
    } catch (err) {
      setError('一部の承諾に失敗しました');
      console.error('Failed to approve all proposals:', err);
    } finally {
      setProcessingAll(null);
    }
  };

  const handleRejectAll = async () => {
    setProcessingAll('reject');
    setError(null);
    try {
      for (const proposal of proposals) {
        await proposalsApi.reject(proposal.proposalId);
      }
      await onAllRejected();
    } catch (err) {
      setError('一部の却下に失敗しました');
      console.error('Failed to reject all proposals:', err);
    } finally {
      setProcessingAll(null);
    }
  };

  const isProcessing = processingId !== null || processingAll !== null;

  // Render proposal details
  const renderProposalDetails = () => {
    const { proposalType, payload, description } = currentProposal;
    const isTask = proposalType === 'create_task';
    const isProject = proposalType === 'create_project';
    const isWorkMemory = proposalType === 'create_work_memory';
    const isAssignment = proposalType === 'assign_task';
    const isPhaseBreakdown = proposalType === 'phase_breakdown';
    const isToolAction = proposalType === 'tool_action';

    return (
      <div className="proposal-panel-details">
        <p className="proposal-panel-description">{description}</p>

        {isTask && (
          <TaskDetails payload={payload as TaskCreate} />
        )}
        {isProject && (
          <ProjectDetails payload={payload as ProjectCreate} />
        )}
        {isWorkMemory && (
          <WorkMemoryDetails payload={payload as MemoryCreate} />
        )}
        {isAssignment && (
          <AssignmentDetails payload={payload as TaskAssignmentProposal} />
        )}
        {isPhaseBreakdown && (
          <PhaseBreakdownDetails payload={payload as PhaseBreakdownProposal} />
        )}
        {isToolAction && (
          <ToolActionDetails payload={payload as ToolActionProposalPayload} />
        )}
      </div>
    );
  };

  return (
    <div className="proposal-panel">
      <div className="proposal-panel-header">
        <span className="proposal-panel-badge">
          {getBadgeLabel(currentProposal.proposalType)}
        </span>
        {hasMultiple && (
          <div className="proposal-panel-pagination">
            <button
              className="proposal-panel-nav-btn"
              onClick={handlePrev}
              disabled={currentIndex === 0 || isProcessing}
            >
              <FaChevronLeft />
            </button>
            <span className="proposal-panel-page">
              {currentIndex + 1} / {proposals.length}
            </span>
            <button
              className="proposal-panel-nav-btn"
              onClick={handleNext}
              disabled={currentIndex === proposals.length - 1 || isProcessing}
            >
              <FaChevronRight />
            </button>
          </div>
        )}
      </div>

      <div className="proposal-panel-body">
        {renderProposalDetails()}
      </div>

      {error && <div className="proposal-panel-error">{error}</div>}

      <div className="proposal-panel-actions">
        <div className="proposal-panel-actions-single">
          <button
            className="proposal-panel-btn reject"
            onClick={handleReject}
            disabled={isProcessing}
          >
            {processingId === currentProposal.proposalId ? (
              <FaSpinner className="spinner" />
            ) : (
              <FaTimesCircle />
            )}
            却下
          </button>
          <button
            className="proposal-panel-btn approve"
            onClick={handleApprove}
            disabled={isProcessing}
          >
            {processingId === currentProposal.proposalId ? (
              <FaSpinner className="spinner" />
            ) : (
              <FaCheckCircle />
            )}
            承諾
          </button>
        </div>

        {hasMultiple && (
          <div className="proposal-panel-actions-all">
            <button
              className="proposal-panel-btn-all reject-all"
              onClick={handleRejectAll}
              disabled={isProcessing}
            >
              {processingAll === 'reject' ? (
                <FaSpinner className="spinner" />
              ) : (
                <FaXmark />
              )}
              全て却下
            </button>
            <button
              className="proposal-panel-btn-all approve-all"
              onClick={handleApproveAll}
              disabled={isProcessing}
            >
              {processingAll === 'approve' ? (
                <FaSpinner className="spinner" />
              ) : (
                <FaCheckDouble />
              )}
              全て承諾
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Detail components
function TaskDetails({ payload }: { payload: TaskCreate }) {
  return (
    <>
      <div className="proposal-panel-row">
        <span className="proposal-panel-label">タイトル:</span>
        <span className="proposal-panel-value">{payload.title}</span>
      </div>
      {payload.description && (
        <div className="proposal-panel-row">
          <span className="proposal-panel-label">説明:</span>
          <span className="proposal-panel-value">{payload.description}</span>
        </div>
      )}
      <div className="proposal-panel-row">
        <span className="proposal-panel-label">優先度:</span>
        <span className="proposal-panel-value">
          {payload.importance || 'MEDIUM'} / {payload.urgency || 'MEDIUM'}
        </span>
      </div>
      {payload.estimated_minutes && (
        <div className="proposal-panel-row">
          <span className="proposal-panel-label">見積:</span>
          <span className="proposal-panel-value">{payload.estimated_minutes}分</span>
        </div>
      )}
    </>
  );
}

function ProjectDetails({ payload }: { payload: ProjectCreate }) {
  return (
    <>
      <div className="proposal-panel-row">
        <span className="proposal-panel-label">プロジェクト名:</span>
        <span className="proposal-panel-value">{payload.name}</span>
      </div>
      {payload.description && (
        <div className="proposal-panel-row">
          <span className="proposal-panel-label">概要:</span>
          <span className="proposal-panel-value">{payload.description}</span>
        </div>
      )}
    </>
  );
}

function WorkMemoryDetails({ payload }: { payload: MemoryCreate }) {
  return (
    <div className="proposal-panel-row">
      <span className="proposal-panel-label">内容:</span>
      <span className="proposal-panel-value proposal-panel-pre">{payload.content}</span>
    </div>
  );
}

function AssignmentDetails({ payload }: { payload: TaskAssignmentProposal }) {
  return (
    <>
      <div className="proposal-panel-row">
        <span className="proposal-panel-label">Task ID:</span>
        <span className="proposal-panel-value">{payload.task_id}</span>
      </div>
      <div className="proposal-panel-row">
        <span className="proposal-panel-label">Assignees:</span>
        <span className="proposal-panel-value">{payload.assignee_ids.join(', ')}</span>
      </div>
    </>
  );
}

function PhaseBreakdownDetails({ payload }: { payload: PhaseBreakdownProposal }) {
  return (
    <>
      <div className="proposal-panel-row">
        <span className="proposal-panel-label">Phases:</span>
        <div className="proposal-panel-value">
          <div className="proposal-panel-phases">
            {payload.phases.map((phase, idx) => (
              <div key={`${phase.name}-${idx}`} className="proposal-panel-phase">
                <span className="proposal-panel-phase-num">{idx + 1}.</span>
                <span className="proposal-panel-phase-name">{phase.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function ToolActionDetails({ payload }: { payload: ToolActionProposalPayload }) {
  return (
    <>
      <div className="proposal-panel-row">
        <span className="proposal-panel-label">Tool:</span>
        <span className="proposal-panel-value">{payload.tool_name}</span>
      </div>
      <div className="proposal-panel-row">
        <span className="proposal-panel-label">Args:</span>
        <span className="proposal-panel-value proposal-panel-pre">
          {JSON.stringify(payload.args || {}, null, 2)}
        </span>
      </div>
    </>
  );
}
