/**
 * Notifications API client
 */

import { api } from './client';
import type {
  Notification,
  NotificationListResponse,
  UnreadCountResponse,
} from './types';

export const notificationsApi = {
  /**
   * List notifications with optional filter
   */
  list: (params?: {
    unread_only?: boolean;
    limit?: number;
    offset?: number;
  }) => {
    const searchParams = new URLSearchParams();
    if (params?.unread_only) {
      searchParams.set('unread_only', 'true');
    }
    if (params?.limit !== undefined) {
      searchParams.set('limit', String(params.limit));
    }
    if (params?.offset !== undefined) {
      searchParams.set('offset', String(params.offset));
    }
    const suffix = searchParams.toString();
    return api.get<NotificationListResponse>(
      `/notifications${suffix ? `?${suffix}` : ''}`
    );
  },

  /**
   * Get unread notification count
   */
  getUnreadCount: () => api.get<UnreadCountResponse>('/notifications/unread-count'),

  /**
   * Get a specific notification
   */
  get: (id: string) => api.get<Notification>(`/notifications/${id}`),

  /**
   * Mark a notification as read
   */
  markAsRead: (id: string) =>
    api.post<Notification>(`/notifications/${id}/read`, {}),

  /**
   * Mark all notifications as read
   */
  markAllAsRead: () =>
    api.post<{ updated_count: number }>('/notifications/read-all', {}),

  /**
   * Delete a notification
   */
  delete: (id: string) => api.delete<void>(`/notifications/${id}`),
};
