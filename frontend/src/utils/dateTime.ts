import { DateTime } from 'luxon';
import { userStorage } from './userStorage';

const TIMEZONE_STORAGE_KEY = 'userTimezone';
const DEFAULT_TIMEZONE = 'Asia/Tokyo';

const isDateOnly = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);
const hasTimezoneInfo = (value: string) => /([zZ]|[+-]\d{2}:?\d{2})$/.test(value);

export const getStoredTimezone = () => {
  return (
    userStorage.get(TIMEZONE_STORAGE_KEY) ||
    Intl.DateTimeFormat().resolvedOptions().timeZone ||
    DEFAULT_TIMEZONE
  );
};

export const setStoredTimezone = (timezone: string) => {
  if (!timezone) return;
  userStorage.set(TIMEZONE_STORAGE_KEY, timezone);
};

export const toDateTime = (value: string | Date, timezone = getStoredTimezone()) => {
  if (value instanceof Date) {
    return DateTime.fromJSDate(value).setZone(timezone);
  }
  if (isDateOnly(value)) {
    return DateTime.fromISO(value, { zone: timezone });
  }
  if (hasTimezoneInfo(value)) {
    return DateTime.fromISO(value, { setZone: true }).setZone(timezone);
  }
  // バックエンドからのタイムゾーン情報なしの日時はUTCとして解釈し、ユーザーのタイムゾーンに変換
  return DateTime.fromISO(value, { zone: 'UTC' }).setZone(timezone);
};

export const toDateKey = (value: string | Date, timezone?: string) => {
  const dt = toDateTime(value, timezone ?? getStoredTimezone());
  return dt.isValid ? dt.toISODate() ?? '' : '';
};

export const formatDate = (
  value: string | Date,
  options: Intl.DateTimeFormatOptions,
  timezone?: string,
  locale = 'ja-JP',
) => {
  const dt = toDateTime(value, timezone ?? getStoredTimezone());
  if (!dt.isValid) {
    return typeof value === 'string' ? value : '';
  }
  return dt.setLocale(locale).toLocaleString(options);
};

export const startOfDay = (value: string | Date, timezone?: string) => {
  return toDateTime(value, timezone ?? getStoredTimezone()).startOf('day');
};

export const todayInTimezone = (timezone?: string) => {
  return DateTime.now().setZone(timezone ?? getStoredTimezone()).startOf('day');
};

export const nowInTimezone = (timezone?: string) => {
  return DateTime.now().setZone(timezone ?? getStoredTimezone());
};

export const toDateTimeLocalValue = (value?: string | null, timezone?: string) => {
  if (!value) return '';
  const dt = toDateTime(value, timezone ?? getStoredTimezone());
  return dt.isValid ? dt.toFormat("yyyy-LL-dd'T'HH:mm") : '';
};

export const toUtcIsoString = (value?: string | null, timezone?: string) => {
  if (!value) return undefined;
  const dt = DateTime.fromISO(value, { zone: timezone ?? getStoredTimezone() });
  return dt.isValid ? dt.toUTC().toISO() ?? undefined : undefined;
};
