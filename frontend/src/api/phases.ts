import { api } from './client';
import type {
  Phase,
  PhaseCreate,
  PhaseUpdate,
  PhaseWithTaskCount,
  PhaseTaskBreakdownRequest,
  PhaseTaskBreakdownResponse,
} from './types';

export const phasesApi = {
  create: (data: PhaseCreate) =>
    api.post<Phase>('/phases', data),

  getById: (id: string) =>
    api.get<Phase>(`/phases/${id}`),

  listByProject: (projectId: string) =>
    api.get<PhaseWithTaskCount[]>(`/phases/project/${projectId}`),

  update: (id: string, data: PhaseUpdate) =>
    api.patch<Phase>(`/phases/${id}`, data),

  delete: (id: string) =>
    api.delete(`/phases/${id}`),

  breakdownTasks: (phaseId: string, data: PhaseTaskBreakdownRequest) =>
    api.post<PhaseTaskBreakdownResponse>(`/phases/${phaseId}/task-breakdown`, data),
};
