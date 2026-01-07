import { FaSpinner, FaCheck, FaWrench } from 'react-icons/fa6';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useQueryClient } from '@tanstack/react-query';
import type { ToolCall, ProposalInfo } from '../../hooks/useChat';
import { ProposalCard } from './ProposalCard';
import './ChatMessage.css';

interface ChatMessageProps {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  toolCalls?: ToolCall[];
  proposals?: ProposalInfo[];
  isStreaming?: boolean;
  imageUrl?: string;  // Added for image attachments
}

export function ChatMessage({ role, content, timestamp, toolCalls, proposals, isStreaming, imageUrl }: ChatMessageProps) {
  const queryClient = useQueryClient();

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('ja-JP', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getToolDisplayName = (toolName: string): string => {
    const toolNames: Record<string, string> = {
      get_current_datetime: '日時取得',
      create_task: 'タスク作成',
      update_task: 'タスク更新',
      delete_task: 'タスク削除',
      search_similar_tasks: 'タスク検索',
      breakdown_task: 'タスク分解',
      search_work_memory: 'メモリ検索',
      add_to_memory: 'メモリ追加',
      schedule_agent_task: 'スケジュール',
      propose_task: 'タスク提案',
      propose_project: 'プロジェクト提案',
      propose_skill: 'スキル提案',
    };
    return toolNames[toolName] || toolName;
  };

  const handleProposalAction = () => {
    // Invalidate queries to refresh data after approval/rejection
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
    queryClient.invalidateQueries({ queryKey: ['top3'] });
    queryClient.invalidateQueries({ queryKey: ['projects'] });
  };

  return (
    <div className={`chat-message ${role}`}>
      <div className="message-avatar">
        {role === 'assistant' ? '🤖' : '👤'}
      </div>
      <div className="message-content">
        {/* Tool Calls */}
        {toolCalls && toolCalls.length > 0 && (
          <div className="tool-calls">
            {toolCalls.map((tool) => (
              <div key={tool.id} className={`tool-call ${tool.status}`}>
                <div className="tool-icon">
                  {tool.status === 'running' ? (
                    <FaSpinner className="spinner" />
                  ) : (
                    <FaCheck />
                  )}
                </div>
                <div className="tool-info">
                  <div className="tool-name">
                    <FaWrench className="tool-wrench" />
                    {getToolDisplayName(tool.name)}
                  </div>
                  {tool.status === 'running' && (
                    <div className="tool-status">実行中...</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Image Attachment */}
        {imageUrl && role === 'user' && (
          <div className="message-image">
            <img src={imageUrl} alt="Uploaded attachment" />
          </div>
        )}

        {/* Proposals */}
        {proposals && proposals.length > 0 && (
          <div className="proposals">
            {proposals.map((proposal) => (
              <ProposalCard
                key={proposal.id}
                proposalId={proposal.proposalId}
                proposalType={proposal.proposalType}
                description={proposal.description}
                payload={proposal.payload}
                onApprove={handleProposalAction}
                onReject={handleProposalAction}
              />
            ))}
          </div>
        )}

        {/* Message Text */}
        {content ? (
          <div className="message-text markdown-content">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {content}
            </ReactMarkdown>
            {isStreaming && <span className="streaming-cursor">▋</span>}
          </div>
        ) : isStreaming && (!toolCalls || toolCalls.length === 0) ? (
          <div className="thinking-animation">
            <div className="thinking-dots">
              <span></span>
              <span></span>
              <span></span>
            </div>
            <span className="thinking-text">Thinking...</span>
          </div>
        ) : null}

        <div className="message-time">{formatTime(timestamp)}</div>
      </div>
    </div>
  );
}
