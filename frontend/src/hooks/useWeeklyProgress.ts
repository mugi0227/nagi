import { useQuery } from '@tanstack/react-query';
import { tasksApi } from '../api/tasks';

interface DayData {
  day: string;
  date: Date;
  completedCount: number;
  height: number;
  active: boolean;
}

export function useWeeklyProgress() {
  const { data: allTasks = [] } = useQuery({
    queryKey: ['tasks'],
    queryFn: tasksApi.getAll,
  });

  // Get current week (Mon-Sun)
  const today = new Date();
  const currentDayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, ...
  const daysFromMonday = currentDayOfWeek === 0 ? 6 : currentDayOfWeek - 1;

  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - daysFromMonday);
  weekStart.setHours(0, 0, 0, 0);

  const dayLabels = ['月', '火', '水', '木', '金', '土', '日'];

  // Count completed tasks per day
  const weekData: DayData[] = dayLabels.map((day, index) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + index);

    const nextDay = new Date(date);
    nextDay.setDate(date.getDate() + 1);

    const isToday = date.toDateString() === today.toDateString();

    const completedCount = allTasks.filter(task => {
      if (task.status !== 'DONE' || !task.updated_at) return false;
      const taskDate = new Date(task.updated_at);
      return taskDate >= date && taskDate < nextDay;
    }).length;

    return {
      day,
      date,
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
