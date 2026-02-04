import { api } from './client';
import type { RecurringTask, RecurringTaskCreate, RecurringTaskUpdate } from './types';

export const recurringTasksApi = {
  list: (query?: { projectId?: string; includeInactive?: boolean }) => {
    const params = new URLSearchParams();
    if (query?.projectId) {
      params.set('project_id', query.projectId);
    }
    if (query?.includeInactive) {
      params.set('include_inactive', 'true');
    }
    const suffix = params.toString();
    return api.get<RecurringTask[]>(`/recurring-tasks${suffix ? `?${suffix}` : ''}`);
  },

  getById: (id: string) => api.get<RecurringTask>(`/recurring-tasks/${id}`),

  create: (data: RecurringTaskCreate) =>
    api.post<RecurringTask>('/recurring-tasks', data),

  update: (id: string, data: RecurringTaskUpdate) =>
    api.patch<RecurringTask>(`/recurring-tasks/${id}`, data),

  delete: (id: string) => api.delete<void>(`/recurring-tasks/${id}`),

  generateTasks: (id: string) =>
    api.post<{ created_count: number; skipped_count: number }>(
      `/recurring-tasks/${id}/generate-tasks`,
      {}
    ),

  deleteGeneratedTasks: (id: string) =>
    api.delete<{ deleted_count: number }>(`/recurring-tasks/${id}/generated-tasks`),
};
