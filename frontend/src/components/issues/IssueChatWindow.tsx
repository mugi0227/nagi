import { useRef, useEffect, useState, FormEvent } from 'react';
import { FaComments, FaXmark, FaSpinner, FaCheck } from 'react-icons/fa6';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useIssueChat, type IssueChatMessage } from '../../hooks/useIssueChat';
import { QuestionsPanel } from '../chat/QuestionsPanel';
import { useTimezone } from '../../hooks/useTimezone';
import { formatDate } from '../../utils/dateTime';
import './IssueChatWindow.css';

interface Props {
  onClose: () => void;
}

const TOOL_DISPLAY_NAMES: Record<string, string> = {
  create_issue: 'Create issue',
  update_issue: 'Update issue',
  get_issue: 'Get issue',
  search_issues: 'Search issues',
};

export function IssueChatWindow({ onClose }: Props) {
  const timezone = useTimezone();
  const { messages, isStreaming, sendMessage, pendingQuestionsData, markQuestionsProcessed } = useIssueChat();
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;
    sendMessage(input.trim());
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as FormEvent);
    }
  };

  const handleQuestionsSubmit = (answer: string) => {
    markQuestionsProcessed();
    sendMessage(answer);
  };

  const handleQuestionsCancel = () => {
    markQuestionsProcessed();
  };

  return (
    <div className="issue-chat-overlay" onClick={onClose}>
      <div className="issue-chat-window" onClick={(e) => e.stopPropagation()}>
        <div className="issue-chat-header">
          <div className="issue-chat-title">
            <FaComments className="issue-chat-icon" />
            <span>要望を伝える</span>
          </div>
          <button className="issue-chat-close-btn" onClick={onClose} title="閉じる">
            <FaXmark />
          </button>
        </div>

        <div className="issue-chat-messages">
          {messages.length === 0 && (
            <div className="issue-chat-empty">
              <div className="issue-chat-empty-icon">
                <FaComments />
              </div>
              <p className="issue-chat-empty-title">会話を始めましょう</p>
              <p className="issue-chat-empty-hint">
                アプリへの要望やバグ報告をお聞かせください
              </p>
            </div>
          )}

          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} timezone={timezone} />
          ))}

          <div ref={messagesEndRef} />
        </div>

        {/* Priority: QuestionsPanel > ChatInput */}
        {pendingQuestionsData ? (
          <QuestionsPanel
            questions={pendingQuestionsData.questions}
            context={pendingQuestionsData.context}
            onSubmit={handleQuestionsSubmit}
            onCancel={handleQuestionsCancel}
          />
        ) : (
          <form className="issue-chat-input-area" onSubmit={handleSubmit}>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="要望を入力..."
              disabled={isStreaming}
              rows={2}
              className="issue-chat-textarea"
            />
            <button
              type="submit"
              disabled={!input.trim() || isStreaming}
              className="issue-chat-send-btn"
            >
              {isStreaming ? '...' : '送信'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

interface MessageBubbleProps {
  message: IssueChatMessage;
  timezone: string;
}

function MessageBubble({ message, timezone }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  const getToolDisplayName = (toolName: string): string => {
    return TOOL_DISPLAY_NAMES[toolName] || toolName;
  };

  const formatTime = (date: Date) => {
    return formatDate(date, { hour: '2-digit', minute: '2-digit' }, timezone);
  };

  // Tool chips (before content)
  const toolChips = message.toolCalls && message.toolCalls.length > 0 ? (
    <div className="issue-tool-chips">
      {message.toolCalls.map((tc, i) => (
        <div key={i} className={`issue-tool-chip ${tc.status}`}>
          <span className="issue-tool-chip-icon">
            {tc.status === 'running' ? (
              <FaSpinner className="spinner" />
            ) : (
              <FaCheck />
            )}
          </span>
          <span className="issue-tool-chip-name">{getToolDisplayName(tc.name)}</span>
        </div>
      ))}
    </div>
  ) : null;

  // Message text with thinking animation or markdown
  const messageText = message.isStreaming && !message.content ? (
    <div className="issue-thinking-animation">
      <div className="issue-thinking-dots">
        <span></span>
        <span></span>
        <span></span>
      </div>
      <span className="issue-thinking-text">Thinking...</span>
    </div>
  ) : message.content ? (
    <div className="issue-message-text markdown-content">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {message.content}
      </ReactMarkdown>
    </div>
  ) : null;

  return (
    <div className={`issue-message ${isUser ? 'user' : 'assistant'}`}>
      <div className="issue-message-avatar">
        {isUser ? '👤' : '🤖'}
      </div>
      <div className="issue-message-body">
        {toolChips}
        {messageText}
        <div className="issue-message-time">{formatTime(message.timestamp)}</div>
      </div>
    </div>
  );
}
