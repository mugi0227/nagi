/**
 * Project Achievements API client
 */

import { api } from './client';
import type {
  ProjectAchievement,
  ProjectAchievementCreate,
  ProjectAchievementListResponse,
  ProjectAchievementUpdate,
} from './types';

export const projectAchievementsApi = {
  /**
   * Generate a new project achievement for a period
   */
  create: (projectId: string, data: ProjectAchievementCreate) =>
    api.post<ProjectAchievement>(`/projects/${projectId}/achievements`, data),

  /**
   * List project achievements with optional period filter
   */
  list: (
    projectId: string,
    params?: {
      period_start?: string;
      period_end?: string;
      limit?: number;
      offset?: number;
    }
  ) => {
    const searchParams = new URLSearchParams();
    if (params?.period_start) {
      searchParams.set('period_start', params.period_start);
    }
    if (params?.period_end) {
      searchParams.set('period_end', params.period_end);
    }
    if (params?.limit !== undefined) {
      searchParams.set('limit', String(params.limit));
    }
    if (params?.offset !== undefined) {
      searchParams.set('offset', String(params.offset));
    }
    const suffix = searchParams.toString();
    return api.get<ProjectAchievementListResponse>(
      `/projects/${projectId}/achievements${suffix ? `?${suffix}` : ''}`
    );
  },

  /**
   * Get the latest project achievement
   */
  getLatest: (projectId: string) =>
    api.get<ProjectAchievement | null>(`/projects/${projectId}/achievements/latest`),

  /**
   * Get a specific project achievement
   */
  get: (projectId: string, achievementId: string) =>
    api.get<ProjectAchievement>(`/projects/${projectId}/achievements/${achievementId}`),

  /**
   * Delete a project achievement
   */
  delete: (projectId: string, achievementId: string) =>
    api.delete<void>(`/projects/${projectId}/achievements/${achievementId}`),

  update: (projectId: string, achievementId: string, data: ProjectAchievementUpdate) =>
    api.patch<ProjectAchievement>(
      `/projects/${projectId}/achievements/${achievementId}`,
      data
    ),

  summarize: (projectId: string, achievementId: string) =>
    api.post<ProjectAchievement>(
      `/projects/${projectId}/achievements/${achievementId}/ai-summary`,
      {}
    ),
};
