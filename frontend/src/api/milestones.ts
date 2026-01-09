import { api } from './client';
import type { Milestone, MilestoneCreate, MilestoneUpdate } from './types';

export const milestonesApi = {
  create: (data: MilestoneCreate) =>
    api.post<Milestone>('/milestones', data),

  getById: (id: string) =>
    api.get<Milestone>(`/milestones/${id}`),

  listByPhase: (phaseId: string) =>
    api.get<Milestone[]>(`/milestones/phase/${phaseId}`),

  listByProject: (projectId: string) =>
    api.get<Milestone[]>(`/milestones/project/${projectId}`),

  update: (id: string, data: MilestoneUpdate) =>
    api.patch<Milestone>(`/milestones/${id}`, data),

  delete: (id: string) =>
    api.delete<void>(`/milestones/${id}`),
};
