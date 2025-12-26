/**
 * useTodayTasks - Fetch today's tasks derived from the schedule
 */

import { useQuery } from '@tanstack/react-query';
import { tasksApi } from '../api/tasks';
import { useCapacitySettings } from './useCapacitySettings';

export function useTodayTasks() {
  const { capacityHours, bufferHours, capacityByWeekday } = useCapacitySettings();
  return useQuery({
    queryKey: ['today-tasks', capacityHours, bufferHours, capacityByWeekday],
    queryFn: () => tasksApi.getToday({ capacityHours, bufferHours, capacityByWeekday }),
    staleTime: 30_000,
  });
}
