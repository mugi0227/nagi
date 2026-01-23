/**
 * Achievements API client
 */

import { apiClient } from './client';
import type {
  Achievement,
  AchievementCreate,
  AchievementListResponse,
  CompletedTasksPreviewResponse,
} from './types';

export const achievementsApi = {
  /**
   * Generate a new achievement for a period
   */
  async create(data: AchievementCreate): Promise<Achievement> {
    const response = await apiClient.post<Achievement>('/achievements', data);
    return response.data;
  },

  /**
   * List achievements with optional period filter
   */
  async list(params?: {
    period_start?: string;
    period_end?: string;
    limit?: number;
    offset?: number;
  }): Promise<AchievementListResponse> {
    const response = await apiClient.get<AchievementListResponse>('/achievements', {
      params,
    });
    return response.data;
  },

  /**
   * Get latest achievement
   */
  async getLatest(): Promise<Achievement | null> {
    const response = await apiClient.get<Achievement | null>('/achievements/latest');
    return response.data;
  },

  /**
   * Get achievement by ID
   */
  async get(id: string): Promise<Achievement> {
    const response = await apiClient.get<Achievement>(`/achievements/${id}`);
    return response.data;
  },

  /**
   * Delete an achievement
   */
  async delete(id: string): Promise<void> {
    await apiClient.delete(`/achievements/${id}`);
  },

  /**
   * Trigger auto-generation if conditions are met
   */
  async autoGenerate(): Promise<Achievement | null> {
    const response = await apiClient.post<Achievement | null>('/achievements/auto-generate');
    return response.data;
  },

  /**
   * Preview completed tasks for a period
   */
  async previewCompletedTasks(
    period_start: string,
    period_end: string
  ): Promise<CompletedTasksPreviewResponse> {
    const response = await apiClient.get<CompletedTasksPreviewResponse>(
      '/achievements/preview/completed-tasks',
      {
        params: { period_start, period_end },
      }
    );
    return response.data;
  },
};
