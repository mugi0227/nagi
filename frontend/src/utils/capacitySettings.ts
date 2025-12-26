export const DEFAULT_DAILY_CAPACITY_HOURS = 8;
export const DEFAULT_DAILY_BUFFER_HOURS = 1;
export const DEFAULT_WEEKLY_CAPACITY_HOURS = Array(7).fill(DEFAULT_DAILY_CAPACITY_HOURS);

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

export const getCapacitySettings = () => {
  const capacityHours = parseNumber(
    localStorage.getItem('dailyCapacityHours'),
    DEFAULT_DAILY_CAPACITY_HOURS
  );
  const bufferHours = parseNumber(
    localStorage.getItem('dailyBufferHours'),
    DEFAULT_DAILY_BUFFER_HOURS
  );
  const capacityByWeekday = parseWeeklyCapacity(
    localStorage.getItem('weeklyCapacityHours'),
    capacityHours
  );
  const todayIndex = new Date().getDay();
  const todayCapacityHours = capacityByWeekday[todayIndex] ?? capacityHours;

  return { capacityHours: todayCapacityHours, bufferHours, capacityByWeekday };
};
