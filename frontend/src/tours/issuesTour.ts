import type { TourStep } from './types';

export const issuesTourSteps: TourStep[] = [
  {
    target: '.issues-page .submit-button',
    title: '要望を投稿',
    content:
      'ここからアプリへの要望やバグ報告を投稿できます。AIが整理してくれます。',
    placement: 'bottom',
    disableBeacon: true,
  },
  {
    target: '.issues-filters',
    title: 'フィルター・並び替え',
    content:
      '新着順・人気順の切り替えや、カテゴリ・ステータスでの絞り込みができます。',
    placement: 'bottom',
    disableBeacon: true,
  },
];
