import type { TourStep } from './types';

export const memoriesTourSteps: TourStep[] = [
  {
    target: '.memories-tabs',
    title: 'メモリーのタブ',
    content:
      '仕事メモリ・個人メモリ・プロジェクトメモリを切り替えられます。AIはここから必要な情報を参照します。',
    placement: 'bottom',
    disableBeacon: true,
  },
  {
    target: '.memories-panel',
    title: 'メモリー一覧',
    content:
      'AIが学習した情報が表示されます。検索やタイプでフィルタリングできます。',
    placement: 'auto',
    disableBeacon: true,
  },
];
