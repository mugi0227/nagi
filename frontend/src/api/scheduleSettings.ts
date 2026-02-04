import { api } from './client';
import type { ScheduleSettings, ScheduleSettingsUpdate } from './types';

export const scheduleSettingsApi = {
  get: () => api.get<ScheduleSettings>('/schedule-settings'),
  update: (data: ScheduleSettingsUpdate) => api.put<ScheduleSettings>('/schedule-settings', data),
};
