import { FaComments } from 'react-icons/fa6';
import './ChatWidget.css';

interface ChatWidgetProps {
  forceOpen?: () => void;
}

export function ChatWidget({ forceOpen }: ChatWidgetProps) {
  return (
    <button
      className="chat-fab"
      onClick={forceOpen}
      aria-label="Open chat"
    >
      <FaComments className="fab-icon" />
    </button>
  );
}
