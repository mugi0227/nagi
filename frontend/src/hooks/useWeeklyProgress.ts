import { useQuery } from '@tanstack/react-query';
import { tasksApi } from '../api/tasks';
import { useTimezone } from './useTimezone';
import { toDateTime, todayInTimezone } from '../utils/dateTime';

interface DayData {
  day: string;
  date: Date;
  completedCount: number;
  height: number;
  active: boolean;
}

export function useWeeklyProgress() {
  const timezone = useTimezone();
  const { data: allTasks = [] } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => tasksApi.getAll(),
  });

  // Get current week (Mon-Sun)
  const today = todayInTimezone(timezone);
  const daysFromMonday = today.weekday - 1;
  const weekStart = today.minus({ days: daysFromMonday }).startOf('day');

  const dayLabels = ['月', '火', '水', '木', '金', '土', '日'];

  // Count completed tasks per day
  const weekData: DayData[] = dayLabels.map((day, index) => {
    const date = weekStart.plus({ days: index });
    const nextDay = date.plus({ days: 1 });
    const isToday = date.hasSame(today, 'day');

    const completedCount = allTasks.filter(task => {
      if (task.status !== 'DONE' || !task.updated_at) return false;
      const taskDate = toDateTime(task.updated_at, timezone);
      return (
        taskDate.isValid &&
        taskDate.toMillis() >= date.toMillis() &&
        taskDate.toMillis() < nextDay.toMillis()
      );
    }).length;

    return {
      day,
      date: date.toJSDate(),
      completedCount,
      height: 0,
      active: isToday,
    };
  });

  // Calculate max for scaling
  const maxCount = Math.max(...weekData.map(d => d.completedCount), 1);

  // Calculate height percentages
  weekData.forEach(day => {
    day.height = Math.max((day.completedCount / maxCount) * 100, 10);
  });

  // Total stats
  const totalDone = weekData.reduce((sum, day) => sum + day.completedCount, 0);
  const totalPending = allTasks.filter(task => task.status !== 'DONE').length;

  return {
    weekData,
    totalDone,
    totalPending,
  };
}
