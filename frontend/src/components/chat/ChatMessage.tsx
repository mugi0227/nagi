import type { CSSProperties } from 'react';
import { FaSpinner, FaCheck, FaWrench } from 'react-icons/fa6';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useQueryClient } from '@tanstack/react-query';
import type { ToolCall, ProposalInfo } from '../../hooks/useChat';
import type { Task } from '../../api/types';
import { ProposalCard } from './ProposalCard';
import './ChatMessage.css';

const PREVIEW_DEFAULT_START = 8;
const PREVIEW_DEFAULT_END = 20;
const PREVIEW_MIN_START = 6;
const PREVIEW_MAX_END = 22;
const PREVIEW_HOUR_HEIGHT = 24;

type MeetingPreviewBlock = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  dayKey: string;
  startMinutes: number;
  endMinutes: number;
  lane: number;
  laneCount: number;
  location?: string;
  kind: 'proposal' | 'existing';
};

type MeetingPreviewDay = {
  key: string;
  date: Date;
  label: string;
};

type MeetingPreviewData = {
  days: MeetingPreviewDay[];
  hours: number[];
  startHour: number;
  endHour: number;
  gridHeight: number;
  rangeLabel: string;
  blocksByDay: Map<string, MeetingPreviewBlock[]>;
};

const toLocalDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatDayLabel = (date: Date) =>
  date.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short' });

const formatRangeLabel = (start: Date, end: Date) => {
  const startLabel = start.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' });
  const endLabel = end.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' });
  return `${startLabel} - ${endLabel}`;
};

const formatTimeLabel = (date: Date) =>
  date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });

const buildCombinedMeetingPreview = (
  proposals?: ProposalInfo[],
  existingMeetings?: Task[]
): MeetingPreviewData | null => {
  if (!proposals || proposals.length === 0) return null;

  const proposalMeetings: MeetingPreviewBlock[] = [];
  proposals.forEach((proposal) => {
    if (proposal.proposalType !== 'create_task') return;
    const payload = proposal.payload as {
      title?: string;
      is_fixed_time?: boolean;
      start_time?: string;
      end_time?: string;
      location?: string;
    };
    if (!payload.is_fixed_time || !payload.start_time || !payload.end_time) return;

    const start = new Date(payload.start_time);
    const end = new Date(payload.end_time);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return;
    if (end <= start) return;

    const startMinutes = start.getHours() * 60 + start.getMinutes();
    const endMinutesRaw = end.getHours() * 60 + end.getMinutes();
    const endMinutes = Math.max(startMinutes + 15, endMinutesRaw);

    proposalMeetings.push({
      id: proposal.id,
      title: payload.title || 'Meeting',
      start,
      end,
      dayKey: toLocalDateKey(start),
      startMinutes,
      endMinutes,
      lane: 0,
      laneCount: 1,
      location: payload.location,
      kind: 'proposal',
    });
  });

  if (proposalMeetings.length === 0) return null;

  proposalMeetings.sort((a, b) => a.start.getTime() - b.start.getTime());
  const rangeStart = new Date(proposalMeetings[0].start);
  rangeStart.setHours(0, 0, 0, 0);
  const rangeEnd = new Date(proposalMeetings[proposalMeetings.length - 1].start);
  rangeEnd.setHours(23, 59, 59, 999);

  const existingBlocks: MeetingPreviewBlock[] = [];
  if (existingMeetings && existingMeetings.length > 0) {
    existingMeetings.forEach((task) => {
      if (!task.is_fixed_time || !task.start_time || !task.end_time) return;
      const start = new Date(task.start_time);
      const end = new Date(task.end_time);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return;
      if (start < rangeStart || start > rangeEnd) return;
      const startMinutes = start.getHours() * 60 + start.getMinutes();
      const endMinutesRaw = end.getHours() * 60 + end.getMinutes();
      const endMinutes = Math.max(startMinutes + 15, endMinutesRaw);
      existingBlocks.push({
        id: task.id,
        title: task.title,
        start,
        end,
        dayKey: toLocalDateKey(start),
        startMinutes,
        endMinutes,
        lane: 0,
        laneCount: 1,
        location: task.location,
        kind: 'existing',
      });
    });
  }

  const meetings = [...proposalMeetings, ...existingBlocks];
  meetings.sort((a, b) => a.start.getTime() - b.start.getTime());

  const dayMap = new Map<string, Date>();
  meetings.forEach((meeting) => {
    if (!dayMap.has(meeting.dayKey)) {
      const date = new Date(meeting.start);
      date.setHours(0, 0, 0, 0);
      dayMap.set(meeting.dayKey, date);
    }
  });

  const days = Array.from(dayMap.entries())
    .sort((a, b) => a[1].getTime() - b[1].getTime())
    .map(([key, date]) => ({ key, date, label: formatDayLabel(date) }));

  const minStart = Math.min(...meetings.map((meeting) => meeting.startMinutes));
  const maxEnd = Math.max(...meetings.map((meeting) => meeting.endMinutes));
  let startHour = Math.min(PREVIEW_DEFAULT_START, Math.floor(minStart / 60));
  let endHour = Math.max(PREVIEW_DEFAULT_END, Math.ceil(maxEnd / 60));
  startHour = Math.max(PREVIEW_MIN_START, startHour);
  endHour = Math.min(PREVIEW_MAX_END, Math.max(startHour + 1, endHour));

  const hourCount = endHour - startHour;
  const hours = Array.from({ length: hourCount }, (_, index) => startHour + index);
  const gridHeight = hourCount * PREVIEW_HOUR_HEIGHT;

  const blocksByDay = new Map<string, MeetingPreviewBlock[]>();
  days.forEach((day) => {
    const dayMeetings = meetings
      .filter((meeting) => meeting.dayKey === day.key)
      .sort((a, b) => a.startMinutes - b.startMinutes)
      .map((meeting) => ({ ...meeting }));

    const laneEnds: number[] = [];
    dayMeetings.forEach((meeting) => {
      let laneIndex = laneEnds.findIndex((end) => meeting.startMinutes >= end);
      if (laneIndex === -1) {
        laneIndex = laneEnds.length;
        laneEnds.push(meeting.endMinutes);
      } else {
        laneEnds[laneIndex] = meeting.endMinutes;
      }
      meeting.lane = laneIndex;
    });

    const laneCount = Math.max(1, laneEnds.length);
    dayMeetings.forEach((meeting) => {
      meeting.laneCount = laneCount;
    });

    blocksByDay.set(day.key, dayMeetings);
  });

  const rangeLabel = days.length > 0
    ? formatRangeLabel(days[0].date, days[days.length - 1].date)
    : '';

  return {
    days,
    hours,
    startHour,
    endHour,
    gridHeight,
    rangeLabel,
    blocksByDay,
  };
};

interface ChatMessageProps {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  toolCalls?: ToolCall[];
  proposals?: ProposalInfo[];
  meetingTasks?: Task[];
  isStreaming?: boolean;
  imageUrl?: string;  // Added for image attachments
}

export function ChatMessage({
  role,
  content,
  timestamp,
  toolCalls,
  proposals,
  meetingTasks,
  isStreaming,
  imageUrl,
}: ChatMessageProps) {
  const queryClient = useQueryClient();
  const combinedPreview = buildCombinedMeetingPreview(proposals, meetingTasks);

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
      propose_phase_breakdown: 'Phase breakdown proposal',
      plan_project_phases: 'Phase planning',
      plan_phase_tasks: 'Phase task breakdown',
      propose_task_assignment: 'Task assignment',
      list_project_members: 'Project members',
      list_project_invitations: 'Project invitations',
      list_project_assignments: 'Project assignments',
      list_task_assignments: 'Task assignments',
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
            {combinedPreview && (
              <div className="proposal-combined-preview">
                <div className="proposal-preview-header">
                  <div className="proposal-preview-title">Combined preview</div>
                  <div className="proposal-preview-range">{combinedPreview.rangeLabel}</div>
                </div>
                <div
                  className="proposal-preview-grid"
                  style={{
                    '--preview-days': combinedPreview.days.length,
                    '--preview-hour-height': `${PREVIEW_HOUR_HEIGHT}px`,
                  } as CSSProperties}
                >
                  <div
                    className="proposal-preview-header-row"
                    style={{ '--preview-days': combinedPreview.days.length } as CSSProperties}
                  >
                    <div className="proposal-preview-time-header" />
                    {combinedPreview.days.map((day) => (
                      <div key={day.key} className="proposal-preview-day-header">
                        {day.label}
                      </div>
                    ))}
                  </div>
                  <div className="proposal-preview-body">
                    <div className="proposal-preview-time-col">
                      {combinedPreview.hours.map((hour) => (
                        <div key={hour} className="proposal-preview-time-slot">
                          {String(hour).padStart(2, '0')}:00
                        </div>
                      ))}
                    </div>
                    {combinedPreview.days.map((day) => {
                      const blocks = combinedPreview.blocksByDay.get(day.key) ?? [];
                      return (
                        <div
                          key={day.key}
                          className="proposal-preview-day-col"
                          style={{ height: `${combinedPreview.gridHeight}px` }}
                        >
                          <div className="proposal-preview-hour-lines">
                            {combinedPreview.hours.map((hour) => (
                              <span key={hour} className="proposal-preview-hour-line" />
                            ))}
                          </div>
                          {blocks.map((meeting) => {
                            const startBound = combinedPreview.startHour * 60;
                            const endBound = combinedPreview.endHour * 60;
                            const clampedStart = Math.max(startBound, meeting.startMinutes);
                            const clampedEnd = Math.min(endBound, meeting.endMinutes);
                            const top = ((clampedStart - startBound) / 60) * PREVIEW_HOUR_HEIGHT;
                            const height = Math.max(12, ((clampedEnd - clampedStart) / 60) * PREVIEW_HOUR_HEIGHT);
                            const width = 100 / meeting.laneCount;
                            const left = width * meeting.lane;
                            return (
                              <div
                                key={meeting.id}
                                className={`proposal-preview-block ${meeting.kind}`}
                                style={{ top: `${top}px`, height: `${height}px`, left: `${left}%`, width: `${width}%` }}
                              >
                                <div className="proposal-preview-block-title">{meeting.title}</div>
                                <div className="proposal-preview-block-time">
                                  {formatTimeLabel(meeting.start)} - {formatTimeLabel(meeting.end)}
                                </div>
                                {meeting.location && (
                                  <div className="proposal-preview-block-location">{meeting.location}</div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
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
