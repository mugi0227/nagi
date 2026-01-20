import { api } from './client';
import type { RecurringMeeting, RecurringMeetingCreate, RecurringMeetingUpdate } from './types';

export const recurringMeetingsApi = {
  list: (query?: { projectId?: string; includeInactive?: boolean }) => {
    const params = new URLSearchParams();
    if (query?.projectId) {
      params.set('project_id', query.projectId);
    }
    if (query?.includeInactive) {
      params.set('include_inactive', 'true');
    }
    const suffix = params.toString();
    return api.get<RecurringMeeting[]>(`/recurring-meetings${suffix ? `?${suffix}` : ''}`);
  },

  getById: (id: string) => api.get<RecurringMeeting>(`/recurring-meetings/${id}`),

  create: (data: RecurringMeetingCreate) =>
    api.post<RecurringMeeting>('/recurring-meetings', data),

  update: (id: string, data: RecurringMeetingUpdate) =>
    api.patch<RecurringMeeting>(`/recurring-meetings/${id}`, data),

  delete: (id: string) => api.delete<void>(`/recurring-meetings/${id}`),

  generateTasks: (id: string, lookaheadDays: number = 30) => {
    const params = new URLSearchParams();
    params.set('lookahead_days', lookaheadDays.toString());
    return api.post<{ created_count: number; meetings: unknown[] }>(
      `/recurring-meetings/${id}/generate-tasks?${params.toString()}`,
      {}
    );
  },
};
