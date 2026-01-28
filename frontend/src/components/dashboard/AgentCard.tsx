import { useMemo } from 'react';
import { FaRobot, FaPlay } from 'react-icons/fa6';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import { useTimezone } from '../../hooks/useTimezone';
import { useTodayTasks } from '../../hooks/useTodayTasks';
import { nowInTimezone } from '../../utils/dateTime';
import { resolveDisplayName } from '../../utils/displayName';
import './AgentCard.css';

type AgentCardProps = {
  onOpenDailyBriefing?: () => void;
};

export function AgentCard({ onOpenDailyBriefing }: AgentCardProps) {
  const { data: currentUser } = useCurrentUser();
  const timezone = useTimezone();
  const { data: todayResponse } = useTodayTasks();

  const displayName = currentUser
    ? resolveDisplayName({
        firstName: currentUser.first_name,
        lastName: currentUser.last_name,
        displayName: currentUser.display_name,
        userId: currentUser.id,
      })
    : '';

  const hour = useMemo(() => nowInTimezone(timezone).hour, [timezone]);

  const getGreeting = () => {
    if (hour < 12) return 'おはようございます';
    if (hour < 18) return 'こんにちは';
    return 'おつかれさまです';
  };

  const adviceMessage = useMemo(() => {
    const todayTasks = todayResponse?.today_tasks ?? [];
    const top3Ids = todayResponse?.top3_ids ?? [];
    const top3Tasks = todayTasks.filter(t => top3Ids.includes(t.id));
    const top3Count = top3Tasks.length;
    const top3DoneCount = top3Tasks.filter(t => t.status === 'DONE').length;
    const todayTaskCount = todayTasks.length;
    const todayDoneCount = todayTasks.filter(t => t.status === 'DONE').length;
    const isOverflow = todayResponse?.overflow ?? false;
    const capacityMinutes = todayResponse?.capacity_minutes ?? 0;
    const totalMinutes = todayResponse?.total_estimated_minutes ?? 0;
    const capacityPercent = capacityMinutes > 0
      ? Math.round((totalMinutes / capacityMinutes) * 100)
      : 0;

    // 優先タスク全て完了
    if (top3Count > 0 && top3DoneCount === top3Count) {
      return '優先タスクを全て完了しました！すばらしい集中力です。';
    }

    // オーバーフロー警告
    if (isOverflow) {
      return 'タスクが詰まりすぎています。無理せず、明日に回せるものは回しましょう。';
    }

    // キャパシティ高い（80%以上）
    if (capacityPercent >= 80) {
      return '今日は盛りだくさん。焦らず、1つずつ進めていきましょう。';
    }

    // 朝（タスクが多い場合）
    if (hour < 12 && todayTaskCount >= 5) {
      return 'やることがたくさんありますね。まずは優先タスクに集中しましょう。';
    }

    // 朝（タスクが少ない場合）
    if (hour < 12 && todayTaskCount < 5) {
      return '今日は余裕がありそうです。いいペースでスタートしましょう。';
    }

    // 午後（進捗あり）
    if (hour >= 12 && hour < 18 && todayDoneCount > 0) {
      return '順調に進んでいますね。このまま続けていきましょう。';
    }

    // 午後（進捗なし）
    if (hour >= 12 && hour < 18 && todayDoneCount === 0) {
      return '午後からでも大丈夫。小さな一歩から始めましょう。';
    }

    // 夜
    if (hour >= 18) {
      return '今日もお疲れさまです。残りのタスクを確認して、明日に備えましょう。';
    }

    // デフォルト
    return '今日も一緒に頑張りましょう。';
  }, [todayResponse, hour]);

  return (
    <div className="agent-card">
      <div className="agent-card-glass"></div>
      <div className="agent-content">
        <div className="agent-status-section">
          <div className="agent-avatar-container">
            <div className="avatar-glow"></div>
            <div className="pulse-rings">
              <div className="ring"></div>
              <div className="ring"></div>
              <div className="ring"></div>
            </div>
            <div className="agent-avatar-icon">
              <FaRobot />
            </div>
          </div>

          <div className="agent-text-content">
            <span className="agent-badge">AI ASSISTANT</span>
            <h2 className="agent-greeting">{getGreeting()}{displayName ? `、${displayName}さん` : ''}</h2>
            <p className="agent-message">{adviceMessage}</p>
          </div>
        </div>

        <div className="agent-actions-section">
          <button
            className="primary-action-btn"
            onClick={onOpenDailyBriefing}
            type="button"
          >
            <div className="btn-icon">
              <FaPlay />
            </div>
            <div className="btn-text">
              <span className="btn-label">デイリーブリーフィング</span>
              <span className="btn-subtext">3分で今日を整える</span>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
