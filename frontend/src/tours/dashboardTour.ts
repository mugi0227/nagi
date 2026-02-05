import type { TourStep } from './types';

export const dashboardTourSteps: TourStep[] = [
  {
    target: '.sidebar-nav',
    title: 'ナビゲーション',
    content:
      'サイドバーから各ページに移動できます。プロジェクトへの直接アクセスも可能です。',
    placement: 'right',
    disableBeacon: true,
  },
  {
    target: '.chat-fab, .chat-sidebar',
    title: 'AIチャット',
    content:
      'タスク作成や相談はここから。何でも気軽に話しかけてください。',
    placement: 'left',
    disableBeacon: true,
  },
  {
    target: '.agent-card',
    title: 'AIアシスタント',
    content:
      '今日の状況に合わせたアドバイスが表示されます。ブリーフィングボタンで1日をスタート。',
    placement: 'auto',
    disableBeacon: true,
  },
  {
    target: '.today-tasks-card',
    title: '今日のタスク',
    content:
      '今日やるべきタスクの一覧です。チェックを入れて完了にできます。',
    placement: 'auto',
    disableBeacon: true,
  },
  {
    target: '.schedule-overview-card',
    title: 'スケジュール',
    content:
      '直近の予定を確認できます。カレンダーやガント表示への切り替えも可能。',
    placement: 'auto',
    disableBeacon: true,
  },
];
