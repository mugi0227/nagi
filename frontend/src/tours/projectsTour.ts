import type { TourStep } from './types';

export const projectsTourSteps: TourStep[] = [
  {
    target: '.projects-page .button-primary',
    title: '新規プロジェクト',
    content:
      'ここからプロジェクトを作成できます。AIチャットでも作成可能です。',
    placement: 'bottom',
    disableBeacon: true,
  },
  {
    target: '.projects-grid',
    title: 'プロジェクト一覧',
    content:
      'カードをクリックすると詳細ページに移動します。進捗状況も一目でわかります。',
    placement: 'auto',
    disableBeacon: true,
  },
];
