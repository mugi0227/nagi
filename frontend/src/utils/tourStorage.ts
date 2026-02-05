import { userStorage } from './userStorage';

const TOUR_PREFIX = 'tour_completed';

const PAGE_KEYS = [
  'dashboard',
  'tasks',
  'projects',
  'projectDetail',
  'memories',
  'achievement',
  'issues',
] as const;

export const tourStorage = {
  isCompleted(pageKey: string): boolean {
    return userStorage.get(`${TOUR_PREFIX}:${pageKey}`) === 'true';
  },
  markCompleted(pageKey: string): void {
    userStorage.set(`${TOUR_PREFIX}:${pageKey}`, 'true');
  },
  reset(pageKey: string): void {
    userStorage.remove(`${TOUR_PREFIX}:${pageKey}`);
  },
  resetAll(): void {
    PAGE_KEYS.forEach((k) => userStorage.remove(`${TOUR_PREFIX}:${k}`));
  },
};
