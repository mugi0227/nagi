import { api } from './client';
import type { Phase, PhaseCreate, PhaseUpdate, PhaseWithTaskCount } from './types';

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
};
