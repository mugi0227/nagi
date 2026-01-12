import { getAuthToken } from '../api/auth';

const STORAGE_PREFIX = 'user';

const decodeJwtPayload = (token: string): Record<string, unknown> | null => {
  const parts = token.split('.');
  if (parts.length < 2) return null;
  const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const padLength = (4 - (payload.length % 4)) % 4;
  const padded = payload.padEnd(payload.length + padLength, '=');
  try {
    const json = atob(padded);
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
};

export const getUserStorageId = (): string => {
  const { token } = getAuthToken();
  if (!token) return 'guest';
  const payload = decodeJwtPayload(token);
  const sub = payload?.sub;
  if (typeof sub === 'string' && sub.trim()) {
    return sub;
  }
  const userId = payload?.user_id;
  if (typeof userId === 'string' && userId.trim()) {
    return userId;
  }
  return token;
};

const buildKey = (key: string) => `${STORAGE_PREFIX}:${getUserStorageId()}:${key}`;

export const userStorage = {
  get(key: string): string | null {
    const scopedKey = buildKey(key);
    const value = localStorage.getItem(scopedKey);
    if (value !== null) {
      return value;
    }
    const legacy = localStorage.getItem(key);
    if (legacy !== null) {
      localStorage.setItem(scopedKey, legacy);
      return legacy;
    }
    return null;
  },
  set(key: string, value: string) {
    localStorage.setItem(buildKey(key), value);
  },
  remove(key: string) {
    localStorage.removeItem(buildKey(key));
  },
  getJson<T>(key: string, fallback: T): T {
    const raw = this.get(key);
    if (!raw) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  },
  setJson(key: string, value: unknown) {
    this.set(key, JSON.stringify(value));
  },
};
