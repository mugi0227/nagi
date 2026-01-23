import { useRef, useEffect, useState, FormEvent } from 'react';
import { useIssueChat, type IssueChatMessage } from '../../hooks/useIssueChat';
import './IssueChatWindow.css';

interface Props {
  onClose: () => void;
}

export function IssueChatWindow({ onClose }: Props) {
  const { messages, isStreaming, sendMessage } = useIssueChat();
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

  return (
    <div className="issue-chat-overlay" onClick={onClose}>
      <div className="issue-chat-window" onClick={(e) => e.stopPropagation()}>
        <div className="issue-chat-header">
          <h3>要望を伝える</h3>
          <button className="close-button" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="issue-chat-messages">
          {messages.length === 0 && (
            <div className="welcome-message">
              <p>こんにちは！アプリへの要望やバグ報告をお聞かせください。</p>
              <p className="hint">例: 「音声でタスク追加できたら便利なのに」</p>
            </div>
          )}

          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}

          <div ref={messagesEndRef} />
        </div>

        <form className="issue-chat-input" onSubmit={handleSubmit}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="要望を入力..."
            disabled={isStreaming}
            rows={2}
          />
          <button type="submit" disabled={!input.trim() || isStreaming}>
            {isStreaming ? '...' : '送信'}
          </button>
        </form>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: IssueChatMessage }) {
  const isUser = message.role === 'user';

  return (
    <div className={`message-bubble ${isUser ? 'user' : 'assistant'}`}>
      <div className="message-content">
        {message.content || (message.isStreaming ? '考え中...' : '')}

        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="tool-calls">
            {message.toolCalls.map((tc, i) => (
              <div key={i} className={`tool-call ${tc.status}`}>
                <span className="tool-name">
                  {tc.status === 'running' ? '⏳' : '✓'} {tc.name}
                </span>
                {tc.result !== undefined && tc.result !== null && (
                  <span className="tool-result">
                    {typeof tc.result === 'object'
                      ? JSON.stringify(tc.result)
                      : String(tc.result as string | number | boolean)}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
