import { FaComments } from 'react-icons/fa6';
import { useHeartbeatUnreadCount } from '../../hooks/useHeartbeatUnreadCount';
import './ChatWidget.css';

interface ChatWidgetProps {
  forceOpen?: () => void;
}

export function ChatWidget({ forceOpen }: ChatWidgetProps) {
  const { count } = useHeartbeatUnreadCount();
  const hasUnread = count > 0;
  const labelSuffix = count > 1 ? 's' : '';
  const ariaLabel = hasUnread
    ? `Open chat (${count} new heartbeat message${labelSuffix})`
    : 'Open chat';

  return (
    <button
      className="chat-fab"
      onClick={forceOpen}
      aria-label={ariaLabel}
    >
      <FaComments className="fab-icon" />
      {hasUnread && (
        <span className="chat-fab-badge" aria-hidden="true">
          {count}
        </span>
      )}
    </button>
  );
}
