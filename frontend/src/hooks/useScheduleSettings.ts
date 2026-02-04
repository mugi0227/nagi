import { useQuery } from '@tanstack/react-query';
import { scheduleSettingsApi } from '../api/scheduleSettings';

export function useScheduleSettings() {
  return useQuery({
    queryKey: ['schedule-settings'],
    queryFn: () => scheduleSettingsApi.get(),
    staleTime: 60_000,
  });
}
