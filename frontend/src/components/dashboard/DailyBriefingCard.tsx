import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTodayTasks } from '../../hooks/useTodayTasks';
import { useTasks } from '../../hooks/useTasks';
import { useCapacitySettings } from '../../hooks/useCapacitySettings';
import { tasksApi } from '../../api/tasks';
import type { Task } from '../../api/types';
import { useTimezone } from '../../hooks/useTimezone';
import { formatDate, toDateKey, toDateTime, todayInTimezone } from '../../utils/dateTime';
import './DailyBriefingCard.css';

const TEXT = {
  title: 'Daily Briefing',
  reviewTag: 'ふりかえり',
  conditionTag: 'コンディション',
  focusTag: 'フォーカス',
  ignitionTag: 'スタート',
  reviewTitle: '昨日を振り返る',
  reviewBody: '完了したタスクを確認して、今日に活かしましょう。',
  conditionTitle: '今日のキャパシティ',
  focusTitle: '今日の最優先',
  ignitionTitle: 'まず3分、始めてみよう',
  yesterdayEmpty: '昨日完了したタスクはありませんでした。今日は新しいスタートです。',
  focusEmpty: '今日の優先タスクがまだ設定されていません。',
  startAction: 'はじめる',
  next: '次へ',
  back: '戻る',
  done: '完了',
};

const formatMinutes = (minutes: number) => {
  if (!minutes) return '0分';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours && mins) return `${hours}時間${mins}分`;
  if (hours) return `${hours}時間`;
  return `${mins}分`;
};

const getDateLabel = (timezone: string) => {
  return formatDate(
    todayInTimezone(timezone).toJSDate(),
    { month: 'long', day: 'numeric', weekday: 'short' },
    timezone,
  );
};

const getYesterdayRange = (timezone: string) => {
  const yesterday = todayInTimezone(timezone).minus({ days: 1 });
  const start = yesterday.startOf('day');
  const end = yesterday.endOf('day');
  return { start, end };
};

type DailyBriefingCardProps = {
  onFocusTaskClick?: (task: Task) => void;
  onFinish?: () => void;
};

export function DailyBriefingCard({ onFocusTaskClick, onFinish }: DailyBriefingCardProps) {
  const timezone = useTimezone();
  const [step, setStep] = useState(0);
  const { data: todayResponse, isLoading: todayLoading } = useTodayTasks();
  const { tasks, isLoading: tasksLoading } = useTasks();
  const { capacityHours, bufferHours, capacityByWeekday } = useCapacitySettings();

  const todayKey = useMemo(
    () => toDateKey(todayInTimezone(timezone).toJSDate(), timezone),
    [timezone],
  );

  const { data: scheduleResponse } = useQuery({
    queryKey: ['schedule', 'daily-briefing', todayKey, capacityHours, bufferHours, capacityByWeekday],
    queryFn: () => tasksApi.getSchedule({
      startDate: todayKey,
      capacityHours,
      bufferHours,
      capacityByWeekday,
      maxDays: 1,
    }),
    staleTime: Infinity,
  });

  // top3_idsの最初のタスクをフォーカスタスクとして取得
  const focusTask = useMemo(() => {
    const top3Ids = todayResponse?.top3_ids ?? [];
    if (top3Ids.length === 0) return null;
    const todayTasks = todayResponse?.today_tasks ?? [];
    return todayTasks.find(task => task.id === top3Ids[0]) ?? null;
  }, [todayResponse]);

  const yesterdayStats = useMemo(() => {
    if (!tasks.length) {
      return { count: 0, totalMinutes: 0, highlights: [] as Task[] };
    }
    const { start, end } = getYesterdayRange(timezone);
    const doneYesterday = tasks.filter(task => {
      if (task.status !== 'DONE' || !task.updated_at) return false;
      const updated = toDateTime(task.updated_at, timezone);
      return (
        updated.isValid &&
        updated.toMillis() >= start.toMillis() &&
        updated.toMillis() <= end.toMillis()
      );
    });
    const totalMinutes = doneYesterday.reduce((sum, task) => sum + (task.estimated_minutes || 0), 0);
    const highlights = doneYesterday.slice(0, 3);
    return { count: doneYesterday.length, totalMinutes, highlights };
  }, [tasks, timezone]);

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
    if (todayLoading) return '状態を確認中...';
    if (capacityPercent >= 90) {
      return '今日は予定がいっぱいです。優先度の高いものから、無理せず進めましょう。';
    }
    if (capacityPercent >= 60) {
      return 'ちょうどいいペースです。集中タイムを確保して取り組みましょう。';
    }
    if (capacityPercent >= 30) {
      return '余裕のある一日です。じっくり取り組めそうですね。';
    }
    return 'タスクが少なめの日です。ゆったりスタートしましょう。';
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
          <div className="briefing-date">{getDateLabel(timezone)}</div>
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

          <div className="capacity-row">
            <div
              className="capacity-ring"
              style={{ '--brief-ring': `${capacityPercent}%` } as CSSProperties}
            >
              <div className="capacity-ring-inner">
                <div className="capacity-ring-value">{todayLoading ? '--' : `${capacityPercent}%`}</div>
                <div className="capacity-ring-label">CAPACITY</div>
              </div>
            </div>

            <div className="capacity-stats">
              <div className="briefing-stat-card">
                <div className="briefing-stat-label">会議</div>
                <div className="briefing-stat-value">{formatMinutes(meetingMinutes)}</div>
              </div>
              <div className="briefing-stat-card">
                <div className="briefing-stat-label">作業余白</div>
                <div className="briefing-stat-value">{formatMinutes(availableMinutes)}</div>
              </div>
            </div>
          </div>

          <div className="briefing-card">
            <div className="briefing-card-title">今日の状態</div>
            <p className="briefing-description">{conditionMessage}</p>
          </div>
        </section>

        <section className={`briefing-slide ${step === 2 ? 'active' : ''}`}>
          <span className="briefing-tag">{TEXT.focusTag}</span>
          <h2 className="briefing-hero">{TEXT.focusTitle}</h2>

          <div className="briefing-focus-card">
            {todayLoading ? (
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
                  {focusTask.due_date
                    ? ` / 期限 ${formatDate(
                        focusTask.due_date,
                        { year: 'numeric', month: 'numeric', day: 'numeric' },
                        timezone,
                      )}`
                    : ''}
                </div>
              </>
            ) : (
              <div className="briefing-muted">{TEXT.focusEmpty}</div>
            )}
          </div>

          <p className="briefing-description briefing-center">
            {focusTask
              ? 'これが今日の最優先。まずはこれに集中しましょう。'
              : '優先タスクを設定すると、ここに表示されます。'}
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
              まず3分だけ。始めてしまえば、続きは自然とできます。
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
