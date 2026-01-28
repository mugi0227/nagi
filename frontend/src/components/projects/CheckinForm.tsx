/**
 * CheckinForm - Structured check-in form (V2)
 *
 * Modern ADHD-friendly design with visual hierarchy.
 * Card-based sections with clear visual feedback.
 */
import { useState } from 'react';
import type {
  CheckinCreateV2,
  CheckinItem,
  CheckinItemCategory,
  CheckinMood,
  Task,
  ProjectMember,
} from '../../api/types';
import { useTimezone } from '../../hooks/useTimezone';
import { formatDate, toDateKey, todayInTimezone } from '../../utils/dateTime';

interface CheckinFormProps {
  projectId: string;
  members: ProjectMember[];
  tasks: Task[];
  currentUserId: string;
  onSubmit: (data: CheckinCreateV2) => Promise<void>;
  onCancel: () => void;
  isSubmitting?: boolean;
  hideCancel?: boolean;
  compact?: boolean;
}

const MOOD_OPTIONS: { value: CheckinMood; label: string; emoji: string; color: string; bgColor: string }[] = [
  { value: 'good', label: '順調', emoji: '😊', color: '#059669', bgColor: '#d1fae5' },
  { value: 'okay', label: 'まあまあ', emoji: '😐', color: '#d97706', bgColor: '#fef3c7' },
  { value: 'struggling', label: '厳しい', emoji: '😰', color: '#dc2626', bgColor: '#fee2e2' },
];

export function CheckinForm({
  projectId: _projectId,
  members,
  tasks,
  currentUserId,
  onSubmit,
  onCancel,
  isSubmitting = false,
  hideCancel = false,
  compact = false,
}: CheckinFormProps) {
  const timezone = useTimezone();
  const currentMember = members.find(m => m.member_user_id === currentUserId);
  const memberUserId = currentMember?.member_user_id || currentUserId;

  // Form state
  const [hasBlocker, setHasBlocker] = useState(false);
  const [blockerContent, setBlockerContent] = useState('');
  const [blockerTaskId, setBlockerTaskId] = useState<string | undefined>();
  const [discussionContent, setDiscussionContent] = useState('');
  const [hasRequest, setHasRequest] = useState(false);
  const [requestContent, setRequestContent] = useState('');
  const [mood, setMood] = useState<CheckinMood | undefined>();
  const [freeComment, setFreeComment] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const getTaskTitle = (taskId: string | undefined): string | undefined => {
    if (!taskId || taskId === 'other') return undefined;
    const task = tasks.find(t => t.id === taskId);
    return task?.title;
  };

  const buildItems = (): CheckinItem[] => {
    const items: CheckinItem[] = [];
    if (hasBlocker && blockerContent.trim()) {
      let content = blockerContent.trim();
      const taskTitle = getTaskTitle(blockerTaskId);
      if (taskTitle) content = `[${taskTitle}] ${content}`;
      else if (blockerTaskId === 'other') content = `[その他] ${content}`;
      items.push({
        category: 'blocker' as CheckinItemCategory,
        content,
        related_task_id: blockerTaskId === 'other' ? undefined : blockerTaskId,
        urgency: 'high',
      });
    }
    if (discussionContent.trim()) {
      items.push({
        category: 'discussion' as CheckinItemCategory,
        content: discussionContent.trim(),
        urgency: 'medium',
      });
    }
    if (hasRequest && requestContent.trim()) {
      items.push({
        category: 'request' as CheckinItemCategory,
        content: requestContent.trim(),
        urgency: 'medium',
      });
    }
    return items;
  };

  const handleSubmit = async () => {
    const items = buildItems();
    const trimmedComment = freeComment.trim();
    const hasContent = items.length > 0 || Boolean(mood) || Boolean(trimmedComment);
    if (!hasContent) {
      setFormError('どれか1つは入力してください。');
      return;
    }
    setFormError(null);
    const today = toDateKey(todayInTimezone(timezone).toJSDate(), timezone);
    const data: CheckinCreateV2 = {
      member_user_id: memberUserId,
      checkin_date: today,
      items,
      mood,
      free_comment: trimmedComment || undefined,
    };
    await onSubmit(data);
  };

  const activeTasks = tasks.filter(t => t.status !== 'DONE' && !t.is_fixed_time);

  // Toggle button component
  const ToggleButton = ({
    active,
    onClick,
    activeColor = 'blue',
    children
  }: {
    active: boolean;
    onClick: () => void;
    activeColor?: 'blue' | 'red' | 'yellow';
    children: React.ReactNode;
  }) => {
    const colors = {
      blue: { bg: '#3b82f6', hover: '#2563eb' },
      red: { bg: '#ef4444', hover: '#dc2626' },
      yellow: { bg: '#f59e0b', hover: '#d97706' },
    };
    const color = colors[activeColor];

    return (
      <button
        type="button"
        onClick={onClick}
        style={{
          padding: '8px 20px',
          borderRadius: '9999px',
          fontSize: '14px',
          fontWeight: 500,
          transition: 'all 0.2s',
          backgroundColor: active ? color.bg : '#f3f4f6',
          color: active ? 'white' : '#6b7280',
          border: active ? `2px solid ${color.hover}` : '2px solid transparent',
          boxShadow: active ? '0 2px 8px rgba(0,0,0,0.15)' : 'none',
        }}
      >
        {children}
      </button>
    );
  };

  return (
    <div style={{
      backgroundColor: 'white',
      borderRadius: compact ? '12px' : '16px',
      boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        padding: compact ? '12px 16px' : '20px 24px',
        color: 'white',
      }}>
        <h3 style={{ fontSize: compact ? '16px' : '20px', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: compact ? '18px' : '24px' }}>📋</span>
          Check-in
        </h3>
        <p style={{ fontSize: compact ? '12px' : '14px', opacity: 0.9, marginTop: '2px' }}>
          {formatDate(
            todayInTimezone(timezone).toJSDate(),
            { month: 'long', day: 'numeric', weekday: 'short' },
            timezone,
          )}
        </p>
      </div>

      <div style={{ padding: compact ? '16px' : '24px', display: 'flex', flexDirection: 'column', gap: compact ? '16px' : '24px' }}>
        {/* Question 1: Blocker */}
        <div style={{
          backgroundColor: hasBlocker ? '#fef2f2' : '#f9fafb',
          borderRadius: compact ? '8px' : '12px',
          padding: compact ? '12px' : '20px',
          border: hasBlocker ? '2px solid #fecaca' : '2px solid transparent',
          transition: 'all 0.2s',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: compact ? '8px' : '12px', marginBottom: compact ? '10px' : '16px' }}>
            <span style={{ fontSize: compact ? '18px' : '24px' }}>🚧</span>
            <span style={{ fontSize: compact ? '13px' : '15px', fontWeight: 600, color: '#374151' }}>
              進捗が止まっていることは？
            </span>
          </div>

          <div style={{ display: 'flex', gap: '12px', marginBottom: hasBlocker ? '16px' : 0 }}>
            <ToggleButton active={!hasBlocker} onClick={() => setHasBlocker(false)}>
              なし
            </ToggleButton>
            <ToggleButton active={hasBlocker} onClick={() => setHasBlocker(true)} activeColor="red">
              あり
            </ToggleButton>
          </div>

          {hasBlocker && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '16px' }}>
              <select
                value={blockerTaskId || ''}
                onChange={(e) => setBlockerTaskId(e.target.value || undefined)}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  borderRadius: '8px',
                  border: '1px solid #d1d5db',
                  fontSize: '14px',
                  backgroundColor: 'white',
                  cursor: 'pointer',
                }}
              >
                <option value="">関連タスクを選択（任意）</option>
                {activeTasks.map((task) => (
                  <option key={task.id} value={task.id}>{task.title}</option>
                ))}
                <option value="other">その他（タスク外）</option>
              </select>
              <textarea
                value={blockerContent}
                onChange={(e) => setBlockerContent(e.target.value)}
                placeholder="何で止まっているか教えてください..."
                rows={3}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  borderRadius: '8px',
                  border: '1px solid #d1d5db',
                  fontSize: '14px',
                  resize: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          )}
        </div>

        {/* Question 2: Discussion */}
        <div style={{
          backgroundColor: discussionContent ? '#eff6ff' : '#f9fafb',
          borderRadius: compact ? '8px' : '12px',
          padding: compact ? '12px' : '20px',
          border: discussionContent ? '2px solid #bfdbfe' : '2px solid transparent',
          transition: 'all 0.2s',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: compact ? '8px' : '12px', marginBottom: compact ? '10px' : '16px' }}>
            <span style={{ fontSize: compact ? '18px' : '24px' }}>💬</span>
            <span style={{ fontSize: compact ? '13px' : '15px', fontWeight: 600, color: '#374151' }}>
              次の定例で相談したいことは？
            </span>
          </div>
          <textarea
            value={discussionContent}
            onChange={(e) => setDiscussionContent(e.target.value)}
            placeholder="相談したいこと、話し合いたいことがあれば..."
            rows={3}
            style={{
              width: '100%',
              padding: '12px 16px',
              borderRadius: '8px',
              border: '1px solid #d1d5db',
              fontSize: '14px',
              resize: 'none',
              backgroundColor: 'white',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Question 3: Help Request */}
        <div style={{
          backgroundColor: hasRequest ? '#fefce8' : '#f9fafb',
          borderRadius: compact ? '8px' : '12px',
          padding: compact ? '12px' : '20px',
          border: hasRequest ? '2px solid #fde68a' : '2px solid transparent',
          transition: 'all 0.2s',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: compact ? '8px' : '12px', marginBottom: compact ? '10px' : '16px' }}>
            <span style={{ fontSize: compact ? '18px' : '24px' }}>🙋</span>
            <span style={{ fontSize: compact ? '13px' : '15px', fontWeight: 600, color: '#374151' }}>
              誰かに助けてほしいことは？
            </span>
          </div>

          <div style={{ display: 'flex', gap: '12px', marginBottom: hasRequest ? '16px' : 0 }}>
            <ToggleButton active={!hasRequest} onClick={() => setHasRequest(false)}>
              なし
            </ToggleButton>
            <ToggleButton active={hasRequest} onClick={() => setHasRequest(true)} activeColor="yellow">
              あり
            </ToggleButton>
          </div>

          {hasRequest && (
            <textarea
              value={requestContent}
              onChange={(e) => setRequestContent(e.target.value)}
              placeholder="どんな助けが必要か教えてください..."
              rows={3}
              style={{
                width: '100%',
                padding: '12px 16px',
                borderRadius: '8px',
                border: '1px solid #d1d5db',
                fontSize: '14px',
                resize: 'none',
                backgroundColor: 'white',
                marginTop: '16px',
                boxSizing: 'border-box',
              }}
            />
          )}
        </div>

        {/* Question 4: Mood */}
        <div style={{
          backgroundColor: '#f9fafb',
          borderRadius: compact ? '8px' : '12px',
          padding: compact ? '12px' : '20px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: compact ? '8px' : '12px', marginBottom: compact ? '10px' : '16px' }}>
            <span style={{ fontSize: compact ? '18px' : '24px' }}>💭</span>
            <span style={{ fontSize: compact ? '13px' : '15px', fontWeight: 600, color: '#374151' }}>
              今の調子は？
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: compact ? '8px' : '12px' }}>
            {MOOD_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setMood(option.value)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  padding: compact ? '10px 8px' : '16px 12px',
                  borderRadius: compact ? '8px' : '12px',
                  border: mood === option.value ? `3px solid ${option.color}` : '3px solid transparent',
                  backgroundColor: mood === option.value ? option.bgColor : 'white',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  boxShadow: mood === option.value ? '0 4px 12px rgba(0,0,0,0.1)' : '0 1px 3px rgba(0,0,0,0.05)',
                  transform: mood === option.value ? 'scale(1.05)' : 'scale(1)',
                }}
              >
                <span style={{ fontSize: compact ? '24px' : '36px', marginBottom: compact ? '4px' : '8px' }}>{option.emoji}</span>
                <span style={{
                  fontSize: compact ? '12px' : '14px',
                  fontWeight: 600,
                  color: mood === option.value ? option.color : '#6b7280',
                }}>
                  {option.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Question 5: Free Comment */}
        <div style={{
          backgroundColor: '#f9fafb',
          borderRadius: compact ? '8px' : '12px',
          padding: compact ? '12px' : '20px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: compact ? '8px' : '12px', marginBottom: compact ? '10px' : '16px' }}>
            <span style={{ fontSize: compact ? '18px' : '24px' }}>📝</span>
            <span style={{ fontSize: compact ? '13px' : '15px', fontWeight: 600, color: '#374151' }}>
              その他（自由記述）
            </span>
          </div>
          <textarea
            value={freeComment}
            onChange={(e) => setFreeComment(e.target.value)}
            placeholder="その他、共有したいことがあれば..."
            rows={3}
            style={{
              width: '100%',
              padding: '12px 16px',
              borderRadius: '8px',
              border: '1px solid #d1d5db',
              fontSize: '14px',
              resize: 'none',
              backgroundColor: 'white',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Actions */}
        <div style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '12px',
          paddingTop: compact ? '12px' : '16px',
          borderTop: '1px solid #e5e7eb',
        }}>
          {formError && (
            <p style={{ color: '#dc2626', fontSize: compact ? '11px' : '12px', marginRight: 'auto' }}>
              {formError}
            </p>
          )}
          {!hideCancel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={isSubmitting}
              style={{
                padding: compact ? '8px 16px' : '12px 24px',
                borderRadius: '8px',
                fontSize: compact ? '13px' : '14px',
                fontWeight: 500,
                backgroundColor: 'white',
                color: '#374151',
                border: '1px solid #d1d5db',
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                opacity: isSubmitting ? 0.5 : 1,
              }}
            >
              キャンセル
            </button>
          )}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            style={{
              padding: compact ? '8px 20px' : '12px 32px',
              borderRadius: '8px',
              fontSize: compact ? '13px' : '14px',
              fontWeight: 600,
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white',
              border: 'none',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              opacity: isSubmitting ? 0.5 : 1,
              boxShadow: '0 4px 12px rgba(102, 126, 234, 0.4)',
              width: hideCancel ? '100%' : 'auto',
            }}
          >
            {isSubmitting ? '保存中...' : '保存する'}
          </button>
        </div>
      </div>
    </div>
  );
}
