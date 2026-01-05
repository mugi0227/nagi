import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTop3 } from '../../hooks/useTop3';
import { useTodayTasks } from '../../hooks/useTodayTasks';
import { useTasks } from '../../hooks/useTasks';
import { useCapacitySettings } from '../../hooks/useCapacitySettings';
import { tasksApi } from '../../api/tasks';
import type { Task } from '../../api/types';
import './DailyBriefingCard.css';

const TEXT = {
  title: 'Daily Briefing',
  reviewTag: 'Review',
  conditionTag: 'Condition',
  focusTag: 'The One Thing',
  ignitionTag: 'Ignition',
  reviewTitle: '昨日のあなたを、静かに整える',
  reviewBody: '結果は波のように揺れます。揺れた分だけ、今日は滑らかになります。',
  conditionTitle: '今日のキャパを、軽く知る',
  focusTitle: '一点だけを、冷たく光らせる',
  ignitionTitle: '最初の3分で、流れを作る',
  yesterdayEmpty: '昨日完了したタスクはまだありません。',
  focusEmpty: '今日のTop3がまだありません。',
  startAction: '着火する',
  next: 'NEXT',
  back: 'BACK',
  done: 'DONE',
};

const formatMinutes = (minutes: number) => {
  if (!minutes) return '0分';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours && mins) return `${hours}時間${mins}分`;
  if (hours) return `${hours}時間`;
  return `${mins}分`;
};

const getDateLabel = () => {
  const today = new Date();
  return today.toLocaleDateString('ja-JP', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });
};

const getYesterdayRange = () => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const start = new Date(yesterday);
  start.setHours(0, 0, 0, 0);
  const end = new Date(yesterday);
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

type DailyBriefingCardProps = {
  onFocusTaskClick?: (task: Task) => void;
  onFinish?: () => void;
};

export function DailyBriefingCard({ onFocusTaskClick, onFinish }: DailyBriefingCardProps) {
  const [step, setStep] = useState(0);
  const { data: top3Response, isLoading: top3Loading } = useTop3();
  const { data: todayResponse, isLoading: todayLoading } = useTodayTasks();
  const { tasks, isLoading: tasksLoading } = useTasks();
  const { capacityHours, bufferHours, capacityByWeekday } = useCapacitySettings();

  const todayKey = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const { data: scheduleResponse } = useQuery({
    queryKey: ['schedule', 'daily-briefing', todayKey, capacityHours, bufferHours, capacityByWeekday],
    queryFn: () => tasksApi.getSchedule({
      startDate: todayKey,
      capacityHours,
      bufferHours,
      capacityByWeekday,
      maxDays: 1,
    }),
    staleTime: 30_000,
  });

  const focusTask = top3Response?.tasks?.[0] ?? null;

  const yesterdayStats = useMemo(() => {
    if (!tasks.length) {
      return { count: 0, totalMinutes: 0, highlights: [] as Task[] };
    }
    const { start, end } = getYesterdayRange();
    const doneYesterday = tasks.filter(task => {
      if (task.status !== 'DONE' || !task.updated_at) return false;
      const updated = new Date(task.updated_at);
      return updated >= start && updated <= end;
    });
    const totalMinutes = doneYesterday.reduce((sum, task) => sum + (task.estimated_minutes || 0), 0);
    const highlights = doneYesterday.slice(0, 3);
    return { count: doneYesterday.length, totalMinutes, highlights };
  }, [tasks]);

  const capacityMinutes = todayResponse?.capacity_minutes ?? 0;
  const allocatedMinutes = todayResponse?.total_estimated_minutes ?? 0;
  const capacityRatio = capacityMinutes
    ? Math.round((allocatedMinutes / capacityMinutes) * 100)
    : 0;
  const capacityPercent = Math.min(100, Math.max(0, capacityRatio));

  const scheduleDay = scheduleResponse?.days?.[0];
  const meetingMinutes = scheduleDay?.meeting_minutes ?? 0;
  const availableMinutes = scheduleDay?.available_minutes
    ?? Math.max(capacityMinutes - allocatedMinutes, 0);

  const conditionMessage = useMemo(() => {
    if (todayLoading) return '状態を読み取り中です。';
    if (capacityPercent >= 90) {
      return '予定が密です。波を穏やかにするため、余白を少し確保しましょう。';
    }
    if (capacityPercent >= 60) {
      return '良い密度です。集中ゾーンを守って、丁寧に進めましょう。';
    }
    return '余白が多めです。深呼吸とともに、軽いタスクから滑り出せます。';
  }, [capacityPercent, todayLoading]);

  const goPrev = () => setStep(prev => Math.max(0, prev - 1));
  const goNext = () => setStep(prev => Math.min(3, prev + 1));
  const handleFinish = () => {
    if (onFinish) {
      onFinish();
    } else {
      setStep(0);
    }
  };

  return (
    <div
      className="daily-briefing-card"
      style={{ '--brief-progress': `${((step + 1) / 4) * 100}%` } as CSSProperties}
    >
      <div className="briefing-progress" />
      <div className="briefing-header">
        <div>
          <div className="briefing-title">{TEXT.title}</div>
          <div className="briefing-date">{getDateLabel()}</div>
        </div>
        <div className="briefing-step">
          {String(step + 1).padStart(2, '0')} / 04
        </div>
      </div>

      <div className="briefing-slides">
        <section className={`briefing-slide ${step === 0 ? 'active' : ''}`}>
          <span className="briefing-tag">{TEXT.reviewTag}</span>
          <h2 className="briefing-hero">{TEXT.reviewTitle}</h2>
          <p className="briefing-description">{TEXT.reviewBody}</p>

          <div className="briefing-card">
            <div className="briefing-card-title">昨日の達成</div>
            {tasksLoading ? (
              <div className="briefing-muted">読み込み中...</div>
            ) : yesterdayStats.count === 0 ? (
              <div className="briefing-muted">{TEXT.yesterdayEmpty}</div>
            ) : (
              <ul className="briefing-list">
                {yesterdayStats.highlights.map(task => (
                  <li key={task.id}>{task.title}</li>
                ))}
              </ul>
            )}
          </div>

          <div className="briefing-stats">
            <div className="briefing-stat-card">
              <div className="briefing-stat-label">完了タスク</div>
              <div className="briefing-stat-value">{yesterdayStats.count}件</div>
            </div>
            <div className="briefing-stat-card">
              <div className="briefing-stat-label">完了時間</div>
              <div className="briefing-stat-value">{formatMinutes(yesterdayStats.totalMinutes)}</div>
            </div>
          </div>
        </section>

        <section className={`briefing-slide ${step === 1 ? 'active' : ''}`}>
          <span className="briefing-tag">{TEXT.conditionTag}</span>
          <h2 className="briefing-hero">{TEXT.conditionTitle}</h2>

          <div
            className="capacity-ring"
            style={{ '--brief-ring': `${capacityPercent}%` } as CSSProperties}
          >
            <div className="capacity-ring-inner">
              <div className="capacity-ring-value">{todayLoading ? '--' : `${capacityPercent}%`}</div>
              <div className="capacity-ring-label">CAPACITY</div>
            </div>
          </div>

          <div className="briefing-card">
            <div className="briefing-card-title">今日の状態</div>
            <p className="briefing-description">{conditionMessage}</p>
          </div>

          <div className="briefing-stats">
            <div className="briefing-stat-card">
              <div className="briefing-stat-label">会議</div>
              <div className="briefing-stat-value">{formatMinutes(meetingMinutes)}</div>
            </div>
            <div className="briefing-stat-card">
              <div className="briefing-stat-label">作業余白</div>
              <div className="briefing-stat-value">{formatMinutes(availableMinutes)}</div>
            </div>
          </div>
        </section>

        <section className={`briefing-slide ${step === 2 ? 'active' : ''}`}>
          <span className="briefing-tag">{TEXT.focusTag}</span>
          <h2 className="briefing-hero">{TEXT.focusTitle}</h2>

          <div className="briefing-focus-card">
            {top3Loading ? (
              <div className="briefing-muted">読み込み中...</div>
            ) : focusTask ? (
              <>
                <div className="focus-eyebrow">ULTIMATE FOCUS</div>
                <button
                  type="button"
                  className="focus-title"
                  onClick={() => focusTask && onFocusTaskClick?.(focusTask)}
                >
                  {focusTask.title}
                </button>
                <div className="focus-meta">
                  {formatMinutes(focusTask.estimated_minutes || 0)}
                  {focusTask.due_date ? ` / 期限 ${new Date(focusTask.due_date).toLocaleDateString('ja-JP')}` : ''}
                </div>
              </>
            ) : (
              <div className="briefing-muted">{TEXT.focusEmpty}</div>
            )}
          </div>

          <p className="briefing-description briefing-center">
            今日のあなたは、ひとつの深さで十分です。
          </p>
        </section>

        <section className={`briefing-slide ${step === 3 ? 'active' : ''}`}>
          <span className="briefing-tag">{TEXT.ignitionTag}</span>
          <h2 className="briefing-hero">{TEXT.ignitionTitle}</h2>

          <div className="briefing-card briefing-ignite">
            <div className="ignite-label">ONLY 3 MINUTES</div>
            <div className="ignite-title">
              {focusTask ? `${focusTask.title}を開く` : 'タスク一覧を開く'}
            </div>
            <p className="briefing-description">
              手を動かした瞬間に、脳の重さはほどけ始めます。
            </p>
          </div>

          <button type="button" className="briefing-cta" onClick={handleFinish}>
            {TEXT.startAction}
          </button>
        </section>
      </div>

      <div className="briefing-footer">
        <button
          type="button"
          className="briefing-nav"
          onClick={goPrev}
          disabled={step === 0}
        >
          {TEXT.back}
        </button>
        {step < 3 ? (
          <button type="button" className="briefing-nav primary" onClick={goNext}>
            {TEXT.next}
          </button>
        ) : (
          <button type="button" className="briefing-nav primary" onClick={handleFinish}>
            {TEXT.done}
          </button>
        )}
      </div>
    </div>
  );
}
