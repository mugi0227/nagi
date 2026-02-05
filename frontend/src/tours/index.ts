import type { TourStep } from './types';
import { dashboardTourSteps } from './dashboardTour';
import { tasksTourSteps } from './tasksTour';
import { projectsTourSteps } from './projectsTour';
import { projectDetailTourSteps } from './projectDetailTour';
import { memoriesTourSteps } from './memoriesTour';
import { achievementTourSteps } from './achievementTour';
import { issuesTourSteps } from './issuesTour';

export const tourRegistry: Record<string, TourStep[]> = {
  dashboard: dashboardTourSteps,
  tasks: tasksTourSteps,
  projects: projectsTourSteps,
  projectDetail: projectDetailTourSteps,
  memories: memoriesTourSteps,
  achievement: achievementTourSteps,
  issues: issuesTourSteps,
};
