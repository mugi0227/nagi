import type { TourStep } from './types';

export const achievementTourSteps: TourStep[] = [
  {
    target: '.weekly-generator',
    title: '週次振り返り',
    content:
      '金曜締めで1週間の達成を振り返ります。「週次を生成」で自動的にまとめが作成されます。',
    placement: 'auto',
    disableBeacon: true,
  },
  {
    target: '.achievement-list',
    title: '過去の振り返り',
    content:
      '生成された振り返りの一覧です。編集や再生成もできます。',
    placement: 'auto',
    disableBeacon: true,
  },
];
