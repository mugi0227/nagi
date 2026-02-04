import { todayInTimezone } from './dateTime';
import { userStorage } from './userStorage';

export type WorkBreak = {
  start: string;
  end: string;
};

export type WorkdayHours = {
  enabled: boolean;
  start: string;
  end: string;
  breaks: WorkBreak[];
};

export const DEFAULT_DAILY_CAPACITY_HOURS = 8;
export const DEFAULT_DAILY_BUFFER_HOURS = 1;
export const DEFAULT_WEEKLY_CAPACITY_HOURS = Array(7).fill(DEFAULT_DAILY_CAPACITY_HOURS);
export const DEFAULT_WORKDAY_START = '09:00';
export const DEFAULT_WORKDAY_END = '18:00';
export const DEFAULT_BREAK_START = '12:00';
export const DEFAULT_BREAK_END = '13:00';
export const DEFAULT_BREAK_AFTER_TASK_MINUTES = 5;
export const DEFAULT_WEEKLY_WORK_HOURS: WorkdayHours[] = Array.from({ length: 7 }, () => ({
  enabled: true,
  start: DEFAULT_WORKDAY_START,
  end: DEFAULT_WORKDAY_END,
  breaks: [{ start: DEFAULT_BREAK_START, end: DEFAULT_BREAK_END }],
}));

const parseNumber = (value: string | null, fallback: number) => {
  if (value === null) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseWeeklyCapacity = (value: string | null, fallback: number) => {
  if (!value) return [...DEFAULT_WEEKLY_CAPACITY_HOURS].map(() => fallback);
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.length !== 7) {
      return Array(7).fill(fallback);
    }
    return parsed.map((entry: unknown) => {
      if (typeof entry === 'number' && Number.isFinite(entry)) return entry;
      const numeric = Number(entry);
      return Number.isFinite(numeric) ? numeric : fallback;
    });
  } catch {
    return Array(7).fill(fallback);
  }
};

const parseTimeToMinutes = (value: string) => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
};

const cloneBreaks = (breaks: WorkBreak[]) => breaks.map(item => ({ ...item }));

const normalizeWorkday = (value: unknown, fallback: WorkdayHours): WorkdayHours => {
  if (!value || typeof value !== 'object') {
    return { ...fallback, breaks: cloneBreaks(fallback.breaks) };
  }
  const record = value as Partial<WorkdayHours>;
  const enabled = typeof record.enabled === 'boolean' ? record.enabled : fallback.enabled;
  const start = typeof record.start === 'string' ? record.start : fallback.start;
  const end = typeof record.end === 'string' ? record.end : fallback.end;
  const breaks = Array.isArray(record.breaks)
    ? record.breaks
        .map(item => {
          if (!item || typeof item !== 'object') return null;
          const entry = item as Partial<WorkBreak>;
          if (typeof entry.start !== 'string' || typeof entry.end !== 'string') return null;
          return { start: entry.start, end: entry.end };
        })
        .filter(Boolean) as WorkBreak[]
    : cloneBreaks(fallback.breaks);

  return { enabled, start, end, breaks };
};

export const parseWeeklyWorkHours = (value: string | null, fallback = DEFAULT_WEEKLY_WORK_HOURS) => {
  if (!value) {
    return fallback.map(day => ({ ...day, breaks: cloneBreaks(day.breaks) }));
  }
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.length !== 7) {
      return fallback.map(day => ({ ...day, breaks: cloneBreaks(day.breaks) }));
    }
    return parsed.map((entry, index) => normalizeWorkday(entry, fallback[index] ?? fallback[0]));
  } catch {
    return fallback.map(day => ({ ...day, breaks: cloneBreaks(day.breaks) }));
  }
};

export const computeWorkdayCapacityMinutes = (workday: WorkdayHours) => {
  if (!workday.enabled) return 0;
  const startMinutes = parseTimeToMinutes(workday.start);
  const endMinutes = parseTimeToMinutes(workday.end);
  if (startMinutes == null || endMinutes == null || endMinutes <= startMinutes) return 0;
  const workMinutes = endMinutes - startMinutes;
  const breakMinutes = workday.breaks.reduce((total, entry) => {
    const breakStart = parseTimeToMinutes(entry.start);
    const breakEnd = parseTimeToMinutes(entry.end);
    if (breakStart == null || breakEnd == null || breakEnd <= breakStart) return total;
    const overlapStart = Math.max(startMinutes, breakStart);
    const overlapEnd = Math.min(endMinutes, breakEnd);
    if (overlapEnd <= overlapStart) return total;
    return total + (overlapEnd - overlapStart);
  }, 0);
  return Math.max(0, workMinutes - breakMinutes);
};

export const computeWorkdayCapacityHours = (workday: WorkdayHours) => {
  return computeWorkdayCapacityMinutes(workday) / 60;
};

export const getCapacitySettings = () => {
  const bufferHours = parseNumber(
    userStorage.get('dailyBufferHours'),
    DEFAULT_DAILY_BUFFER_HOURS
  );
  const breakAfterTaskMinutes = Math.max(
    0,
    parseNumber(userStorage.get('breakAfterTaskMinutes'), DEFAULT_BREAK_AFTER_TASK_MINUTES),
  );
  const weeklyWorkHoursRaw = userStorage.get('weeklyWorkHours');
  const weeklyWorkHours = weeklyWorkHoursRaw
    ? parseWeeklyWorkHours(weeklyWorkHoursRaw)
    : undefined;
  const todayIndex = todayInTimezone().weekday % 7;

  if (weeklyWorkHours) {
    const capacityByWeekday = weeklyWorkHours.map(computeWorkdayCapacityHours);
    const todayCapacityHours = capacityByWeekday[todayIndex] ?? DEFAULT_DAILY_CAPACITY_HOURS;
    return { capacityHours: todayCapacityHours, bufferHours, capacityByWeekday, weeklyWorkHours, breakAfterTaskMinutes };
  }

  const capacityHours = parseNumber(
    userStorage.get('dailyCapacityHours'),
    DEFAULT_DAILY_CAPACITY_HOURS
  );
  const capacityByWeekday = parseWeeklyCapacity(
    userStorage.get('weeklyCapacityHours'),
    capacityHours
  );
  const todayCapacityHours = capacityByWeekday[todayIndex] ?? capacityHours;

  return { capacityHours: todayCapacityHours, bufferHours, capacityByWeekday, weeklyWorkHours, breakAfterTaskMinutes };
};
