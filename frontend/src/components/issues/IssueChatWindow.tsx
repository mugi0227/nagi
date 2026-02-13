import { useRef, useEffect, useState, FormEvent, ChangeEvent, ClipboardEvent } from 'react';
import { FaComments, FaXmark, FaSpinner, FaCheck, FaImage } from 'react-icons/fa6';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useIssueChat, type IssueChatMessage } from '../../hooks/useIssueChat';
import { QuestionsPanel } from '../chat/QuestionsPanel';
import { useTimezone } from '../../hooks/useTimezone';
import { formatDate } from '../../utils/dateTime';
import nagiIcon from '../../assets/nagi_icon.png';
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
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const processImageFile = (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      alert('画像ファイルは5MB以下にしてください');
      return;
    }
    if (!file.type.startsWith('image/')) {
      alert('画像ファイルを選択してください');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setSelectedImage(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleImageSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processImageFile(file);
  };

  const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    if (isStreaming) return;
    const items = Array.from(e.clipboardData?.items ?? []);
    const imageItem = items.find((item) => item.type.startsWith('image/'));
    if (!imageItem) return;
    const pastedText = e.clipboardData?.getData('text/plain');
    if (!pastedText) e.preventDefault();
    const file = imageItem.getAsFile();
    if (file) processImageFile(file);
  };

  const handleRemoveImage = () => {
    setSelectedImage(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && !selectedImage) || isStreaming) return;
    sendMessage(input.trim(), selectedImage || undefined);
    setInput('');
    setSelectedImage(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
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
            {selectedImage && (
              <div className="issue-chat-image-preview">
                <img src={selectedImage} alt="Preview" />
                <button type="button" className="issue-chat-image-remove" onClick={handleRemoveImage} title="画像を削除">
                  <FaXmark />
                </button>
              </div>
            )}
            <div className="issue-chat-input-row">
              <input
                type="file"
                ref={fileInputRef}
                accept="image/*"
                onChange={handleImageSelect}
                style={{ display: 'none' }}
              />
              <button
                type="button"
                className="issue-chat-image-btn"
                onClick={() => fileInputRef.current?.click()}
                disabled={isStreaming}
                title="画像を添付"
              >
                <FaImage />
              </button>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                placeholder="要望を入力... (Ctrl+Vで画像貼り付け)"
                disabled={isStreaming}
                rows={2}
                className="issue-chat-textarea"
              />
              <button
                type="submit"
                disabled={(!input.trim() && !selectedImage) || isStreaming}
                className="issue-chat-send-btn"
              >
                {isStreaming ? '...' : '送信'}
              </button>
            </div>
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
        {isUser ? '👤' : <img src={nagiIcon} alt="Nagi" className="avatar-icon-img" />}
      </div>
      <div className="issue-message-body">
        {toolChips}
        {message.imageBase64 && (
          <div className="issue-message-image">
            <img src={message.imageBase64} alt="Attached" />
          </div>
        )}
        {messageText}
        <div className="issue-message-time">{formatTime(message.timestamp)}</div>
      </div>
    </div>
  );
}
