import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { FaClock, FaComments, FaImage, FaPlus, FaRobot, FaXmark } from 'react-icons/fa6';
import { tasksApi } from '../../api/tasks';
import type { Task } from '../../api/types';
import { useChat } from '../../hooks/useChat';
import { ChatInput } from './ChatInput';
import { ChatMessage } from './ChatMessage';
import './ChatWindow.css';

interface ChatWindowProps {
  isOpen: boolean;
  onClose: () => void;
  initialMessage?: string | null;
  onInitialMessageConsumed?: () => void;
}

export function ChatWindow({ isOpen, onClose, initialMessage, onInitialMessageConsumed }: ChatWindowProps) {
  const {
    messages,
    sendMessageStream,
    cancelStream,
    clearChat,
    isLoading,
    isStreaming,
    sessions,
    fetchSessions,
    loadHistory,
    sessionId,
    isLoadingSessions,
    isLoadingHistory,
  } = useChat();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const shouldAutoScroll = useRef(true);
  const [isDragging, setIsDragging] = useState(false);
  const [draggedImage, setDraggedImage] = useState<string | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const { data: meetingTasks = [] } = useQuery<Task[]>({
    queryKey: ['meetings', 'chat-preview'],
    queryFn: () => tasksApi.getAll({ includeDone: true, onlyMeetings: true }),
    staleTime: 30_000,
    enabled: isOpen,
  });

  useEffect(() => {
    if (messagesEndRef.current) {
      const behavior = shouldAutoScroll.current ? 'auto' : 'smooth';
      messagesEndRef.current.scrollIntoView({ behavior });
      shouldAutoScroll.current = false;
    }
  }, [messages]);

  useEffect(() => {
    if (isHistoryOpen) {
      fetchSessions();
    }
  }, [isHistoryOpen, fetchSessions]);

  // Note: initialMessage is now passed to ChatInput instead of auto-sending

  const processImageFile = (file: File) => {
    // Check file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('画像ファイルは5MB以下にしてください');
      return;
    }

    // Check file type
    if (!file.type.startsWith('image/')) {
      alert('画像ファイルを選択してください');
      return;
    }

    // Convert to Base64
    const reader = new FileReader();
    reader.onload = () => {
      setDraggedImage(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isLoading && e.dataTransfer.types.includes('Files')) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only hide overlay when leaving the window entirely
    if (e.currentTarget === e.target) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (isLoading) return;

    const files = Array.from(e.dataTransfer.files);
    const imageFile = files.find(file => file.type.startsWith('image/'));

    if (imageFile) {
      processImageFile(imageFile);
    }
  };

  if (!isOpen) return null;

  const handleSelectSession = async (targetSessionId: string) => {
    try {
      shouldAutoScroll.current = true;
      await loadHistory(targetSessionId);
      setIsHistoryOpen(false);
    } catch (error) {
      console.error('Failed to load history:', error);
      alert('Failed to load history.');
    }
  };

  const formatSessionDate = (value?: string) => {
    if (!value) return 'Recent';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Recent';
    return date.toLocaleString();
  };

  return (
    <div
      className={`chat-window ${isDragging ? 'dragging' : ''}`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="chat-drag-overlay">
          <div className="drag-overlay-content">
            <FaImage size={64} />
            <p>画像をドロップしてください</p>
          </div>
        </div>
      )}
      <div className="chat-header">
        <div className="chat-title">
          <FaRobot />
          <span>Secretary Partner</span>
        </div>
        <div className="chat-header-actions">
          <button className="header-btn" onClick={() => setIsHistoryOpen((prev) => !prev)} title="History">
            <FaClock />
          </button>
          <button className="header-btn" onClick={clearChat} title="New chat">
            <FaPlus />
          </button>
          <button className="header-btn close-btn" onClick={onClose} title="Close">
            <FaXmark />
          </button>
        </div>
      </div>

      {isHistoryOpen && (
        <div className="chat-history-panel">
          <div className="history-panel-header">
            <span>Recent Chats</span>
            <button className="header-btn close-btn" onClick={() => setIsHistoryOpen(false)} title="Close history">
              <FaXmark />
            </button>
          </div>
          <div className="history-panel-list">
            {(isLoadingSessions || isLoadingHistory) && (
              <div className="history-panel-empty">Loading history...</div>
            )}
            {!isLoadingSessions && !isLoadingHistory && sessions.length === 0 && (
              <div className="history-panel-empty">No sessions yet.</div>
            )}
            {!isLoadingSessions && !isLoadingHistory && sessions.map((session) => (
              <button
                key={session.session_id}
                className={`history-panel-item ${session.session_id === sessionId ? 'active' : ''}`}
                onClick={() => handleSelectSession(session.session_id)}
                type="button"
                disabled={isLoadingHistory}
              >
                <span className="history-panel-title">{session.title || 'New Chat'}</span>
                <span className="history-panel-date">{formatSessionDate(session.updated_at)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="chat-history">
        {messages.length === 0 && (
          <div className="chat-empty">
            <div className="empty-icon">
              <FaComments />
            </div>
            <p className="empty-title">会話を始めましょう</p>
            <p className="empty-hint">
              何か頭にあることを書き出しますか？それともタスクの相談をしますか？
            </p>
          </div>
        )}
        {messages.map((message) => (
          <ChatMessage
            key={message.id}
            role={message.role}
            content={message.content}
            timestamp={message.timestamp}
            toolCalls={message.toolCalls}
            proposals={message.proposals}
            meetingTasks={meetingTasks}
            isStreaming={message.isStreaming}
            imageUrl={message.imageUrl}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>

      <ChatInput
        onSend={sendMessageStream}
        onCancel={cancelStream}
        disabled={isLoading}
        isStreaming={isStreaming}
        externalImage={draggedImage}
        onImageClear={() => setDraggedImage(null)}
        initialValue={initialMessage}
        onInitialValueConsumed={onInitialMessageConsumed}
      />
    </div>
  );
}
