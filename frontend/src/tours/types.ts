import type { Step } from 'react-joyride';

export type TourStep = Step & {
  disableBeacon: true;
};
