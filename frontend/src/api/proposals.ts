import { api } from './client';
import type { Proposal } from './types';

export interface ApprovalResult {
  status: string;
  task_id?: string;
  project_id?: string;
  memory_id?: string;
  assignment_ids?: string[];
}

export interface RejectionResult {
  status: string;
}

export const proposalsApi = {
  /**
   * Approve a proposal and create the task/project
   */
  approve: (proposalId: string) =>
    api.post<ApprovalResult>(`/proposals/${proposalId}/approve`, {}),

  /**
   * Reject a proposal without creating anything
   */
  reject: (proposalId: string) =>
    api.post<RejectionResult>(`/proposals/${proposalId}/reject`, {}),

  /**
   * List pending proposals for current user
   */
  listPending: (sessionId?: string) => {
    const endpoint = sessionId
      ? `/proposals/pending?session_id=${sessionId}`
      : '/proposals/pending';
    return api.get<{ proposals: Proposal[]; count: number }>(endpoint);
  },
};
