import { FaRobot, FaPlay } from 'react-icons/fa6';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import { useTimezone } from '../../hooks/useTimezone';
import { nowInTimezone } from '../../utils/dateTime';
import './AgentCard.css';

type AgentCardProps = {
  onOpenDailyBriefing?: () => void;
};

export function AgentCard({ onOpenDailyBriefing }: AgentCardProps) {
  const { data: currentUser } = useCurrentUser();
  const timezone = useTimezone();
  const displayName = currentUser?.username
    || currentUser?.display_name
    || currentUser?.email
    || 'there';
  const getGreeting = () => {
    const hour = nowInTimezone(timezone).hour;
    if (hour < 12) return 'Good Morning';
    if (hour < 18) return 'Good Afternoon';
    return 'Good Evening';
  };

  const getAdviceMessage = () => {
    // デザイナー注: ここは動的なメッセージに将来的に置き換え可能
    return 'タスクのエネルギーレベルと優先度を分析しました。本日の推奨アクションはこちらです。';
  };

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
            <h2 className="agent-greeting">{getGreeting()}, {displayName}!</h2>
            <p className="agent-message">{getAdviceMessage()}</p>
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
