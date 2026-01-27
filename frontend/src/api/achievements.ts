/**
 * Achievements API client
 */

import { api } from './client';
import type {
  Achievement,
  AchievementCreate,
  AchievementListResponse,
  AchievementUpdate,
  CompletedTasksPreviewResponse,
} from './types';

export const achievementsApi = {
  /**
   * Generate a new achievement for a period
   */
  create: (data: AchievementCreate) =>
    api.post<Achievement>('/achievements', data),

  /**
   * List achievements with optional period filter
   */
  list: (params?: {
    period_start?: string;
    period_end?: string;
    limit?: number;
    offset?: number;
  }) => {
    const searchParams = new URLSearchParams();
    if (params?.period_start) searchParams.set('period_start', params.period_start);
    if (params?.period_end) searchParams.set('period_end', params.period_end);
    if (params?.limit !== undefined) searchParams.set('limit', String(params.limit));
    if (params?.offset !== undefined) searchParams.set('offset', String(params.offset));
    const suffix = searchParams.toString();
    return api.get<AchievementListResponse>(`/achievements${suffix ? `?${suffix}` : ''}`);
  },

  /**
   * Get latest achievement
   */
  getLatest: () => api.get<Achievement | null>('/achievements/latest'),

  /**
   * Get achievement by ID
   */
  get: (id: string) => api.get<Achievement>(`/achievements/${id}`),

  /**
   * Delete an achievement
   */
  delete: (id: string) => api.delete<void>(`/achievements/${id}`),

  update: (id: string, data: AchievementUpdate) =>
    api.patch<Achievement>(`/achievements/${id}`, data),
  summarize: (id: string) => api.post<Achievement>(`/achievements/${id}/ai-summary`, {}),

  /**
   * Trigger auto-generation if conditions are met
   */
  autoGenerate: () =>
    api.post<Achievement | null>('/achievements/auto-generate', {}),

  /**
   * Preview completed tasks for a period
   */
  previewCompletedTasks: (period_start: string, period_end: string) => {
    const params = new URLSearchParams();
    params.set('period_start', period_start);
    params.set('period_end', period_end);
    return api.get<CompletedTasksPreviewResponse>(
      `/achievements/preview/completed-tasks?${params.toString()}`
    );
  },
};
