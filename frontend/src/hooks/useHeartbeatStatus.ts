import { useQuery } from '@tanstack/react-query';
import { heartbeatApi } from '../api/heartbeat';

export function useHeartbeatStatus() {
  return useQuery({
    queryKey: ['heartbeat-status'],
    queryFn: heartbeatApi.getStatus,
    staleTime: 30_000,
  });
}
