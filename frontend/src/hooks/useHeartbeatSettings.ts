import { useQuery } from '@tanstack/react-query';
import { heartbeatApi } from '../api/heartbeat';

export function useHeartbeatSettings() {
  return useQuery({
    queryKey: ['heartbeat-settings'],
    queryFn: heartbeatApi.getSettings,
    staleTime: 60_000,
  });
}
