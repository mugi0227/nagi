import type { TourStep } from './types';

export const tasksTourSteps: TourStep[] = [
  {
    target: '.tasks-page .primary-btn',
    title: '新規タスク',
    content:
      'ここから手動でタスクを作成できます。AIチャットからも作成可能です。',
    placement: 'bottom',
    disableBeacon: true,
  },
  {
    target: '.filter-toggle-btn',
    title: 'フィルター',
    content:
      '個人タスクだけに絞り込めます。プロジェクトタスクも一緒に見たい場合はオフに。',
    placement: 'bottom',
    disableBeacon: true,
  },
  {
    target: '.kanban-board',
    title: 'カンバンボード',
    content:
      'ドラッグ&ドロップでステータスを変更できます。未着手→進行中→完了。',
    placement: 'auto',
    disableBeacon: true,
  },
];
