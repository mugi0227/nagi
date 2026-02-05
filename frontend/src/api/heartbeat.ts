import { api } from './client';
import type {
  HeartbeatUnreadCountResponse,
  HeartbeatSettingsResponse,
  HeartbeatSettingsUpdate,
  HeartbeatStatusResponse,
} from './types';

export const heartbeatApi = {
  getStatus: () => api.get<HeartbeatStatusResponse>('/heartbeat/status'),
  getSettings: () => api.get<HeartbeatSettingsResponse>('/heartbeat/settings'),
  updateSettings: (payload: HeartbeatSettingsUpdate) =>
    api.put<HeartbeatSettingsResponse>('/heartbeat/settings', payload),
  getUnreadCount: () => api.get<HeartbeatUnreadCountResponse>('/heartbeat/unread-count'),
  markRead: () => api.post<HeartbeatUnreadCountResponse>('/heartbeat/mark-read', {}),
};
