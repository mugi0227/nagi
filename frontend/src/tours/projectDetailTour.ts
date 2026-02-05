import type { TourStep } from './types';

export const projectDetailTourSteps: TourStep[] = [
  {
    target: '.project-v2-header',
    title: 'プロジェクト情報',
    content:
      'プロジェクトの概要やメンバーが表示されます。クリックで編集できます。',
    placement: 'auto',
    disableBeacon: true,
  },
  {
    target: '.project-v2-tabs',
    title: 'タブ切り替え',
    content:
      'ダッシュボード・タイムライン・ボード・ガント・ミーティング・達成項目を切り替えられます。',
    placement: 'bottom',
    disableBeacon: true,
  },
  {
    target: '.project-v2-header-actions',
    title: 'プロジェクト操作',
    content:
      'フェーズ管理やメンバー招待などの操作ができます。',
    placement: 'bottom',
    disableBeacon: true,
  },
];
