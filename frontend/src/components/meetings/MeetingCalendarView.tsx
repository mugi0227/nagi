import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { useQuery } from '@tanstack/react-query';
import { tasksApi } from '../../api/tasks';
import type { Task } from '../../api/types';

const DEFAULT_START_HOUR = 8;
const DEFAULT_END_HOUR = 20;
const MIN_START_HOUR = 6;
const MAX_END_HOUR = 22;
const HOUR_HEIGHT = 44;

const toLocalDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const startOfWeek = (date: Date) => {
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const start = new Date(date);
  start.setDate(date.getDate() + diff);
  start.setHours(0, 0, 0, 0);
  return start;
};

const formatDayLabel = (date: Date) => (
  date.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short' })
);

const formatTime = (date: Date) => (
  date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
);

type MeetingBlock = {
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
  status: Task['status'];
  recurringMeetingId?: string;
};

interface MeetingCalendarViewProps {
  projectId?: string;
  onMeetingSelect?: (task: Task, date: Date) => void;
}

export function MeetingCalendarView({
  projectId,
  onMeetingSelect
}: MeetingCalendarViewProps) {
  const [weekOffset, setWeekOffset] = useState(0);

  const today = new Date();
  const currentWeekStart = startOfWeek(today);
  const currentWeekStartKey = toLocalDateKey(currentWeekStart);

  const weekStart = useMemo(() => {
    const start = new Date(currentWeekStart);
    start.setDate(start.getDate() + weekOffset * 7);
    return start;
  }, [currentWeekStartKey, weekOffset]);

  const weekStartKey = toLocalDateKey(weekStart);
  const weekEndKey = useMemo(() => {
    const end = new Date(weekStart);
    end.setDate(weekStart.getDate() + 7);
    return toLocalDateKey(end);
  }, [weekStartKey]);

  const isCurrentWeek = weekOffset === 0;
  const goToPrevWeek = () => setWeekOffset(prev => prev - 1);
  const goToNextWeek = () => setWeekOffset(prev => prev + 1);
  const goToCurrentWeek = () => setWeekOffset(0);

  const days = useMemo(() => (
    Array.from({ length: 7 }, (_, index) => {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + index);
      return date;
    })
  ), [weekStartKey]);

  const { data: meetingTasks = [], isLoading, error } = useQuery({
    queryKey: ['meetings', 'week', weekStartKey, projectId],
    queryFn: () => tasksApi.getAll({
      includeDone: true,
      onlyMeetings: true,
      ...(projectId ? { project_id: projectId } : {})
    }),
    staleTime: 30_000,
  });

  const meetings = useMemo(() => {
    const [startYear, startMonth, startDay] = weekStartKey.split('-').map(Number);
    const [endYear, endMonth, endDay] = weekEndKey.split('-').map(Number);
    const weekStartDate = new Date(startYear, startMonth - 1, startDay, 0, 0, 0, 0);
    const weekEndDate = new Date(endYear, endMonth - 1, endDay, 0, 0, 0, 0);

    return meetingTasks
      .filter(task => task.is_fixed_time && task.start_time && task.end_time)
      .map(task => {
        const start = new Date(task.start_time as string);
        const end = new Date(task.end_time as string);
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
        if (start < weekStartDate || start >= weekEndDate) return null;
        const startMinutes = start.getHours() * 60 + start.getMinutes();
        const endMinutesRaw = end.getHours() * 60 + end.getMinutes();
        const endMinutes = Math.max(startMinutes + 15, endMinutesRaw);
        return {
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
          status: task.status,
          recurringMeetingId: task.recurring_meeting_id,
        } satisfies MeetingBlock;
      })
      .filter(Boolean) as MeetingBlock[];
  }, [meetingTasks, weekStartKey, weekEndKey]);

  const timeBounds = useMemo(() => {
    if (!meetings.length) {
      return { startHour: DEFAULT_START_HOUR, endHour: DEFAULT_END_HOUR };
    }
    const minStart = Math.min(...meetings.map(meeting => meeting.startMinutes));
    const maxEnd = Math.max(...meetings.map(meeting => meeting.endMinutes));
    let startHour = Math.min(DEFAULT_START_HOUR, Math.floor(minStart / 60));
    let endHour = Math.max(DEFAULT_END_HOUR, Math.ceil(maxEnd / 60));
    startHour = Math.max(MIN_START_HOUR, startHour);
    endHour = Math.min(MAX_END_HOUR, Math.max(startHour + 1, endHour));
    return { startHour, endHour };
  }, [meetings]);

  const meetingsByDay = useMemo(() => {
    const grouped = new Map<string, MeetingBlock[]>();
    meetings.forEach(meeting => {
      const list = grouped.get(meeting.dayKey) ?? [];
      list.push({ ...meeting });
      grouped.set(meeting.dayKey, list);
    });

    const results = new Map<string, MeetingBlock[]>();
    grouped.forEach((list, dayKey) => {
      const sorted = [...list].sort((a, b) => a.startMinutes - b.startMinutes);
      const laneEnds: number[] = [];
      const withLanes = sorted.map(item => {
        let laneIndex = laneEnds.findIndex(end => item.startMinutes >= end);
        if (laneIndex === -1) {
          laneIndex = laneEnds.length;
          laneEnds.push(item.endMinutes);
        } else {
          laneEnds[laneIndex] = item.endMinutes;
        }
        return { ...item, lane: laneIndex };
      });
      const laneCount = Math.max(1, laneEnds.length);
      results.set(
        dayKey,
        withLanes.map(item => ({ ...item, laneCount }))
      );
    });

    return results;
  }, [meetings]);

  const hourCount = timeBounds.endHour - timeBounds.startHour;
  const hours = useMemo(() => (
    Array.from({ length: hourCount }, (_, index) => timeBounds.startHour + index)
  ), [hourCount, timeBounds.startHour]);

  const gridHeight = hourCount * HOUR_HEIGHT;

  const handleMeetingClick = (meeting: MeetingBlock) => {
    if (onMeetingSelect) {
      const task = meetingTasks.find(t => t.id === meeting.id);
      if (task) {
        onMeetingSelect(task, meeting.start);
      }
    }
  };

  const rangeLabel = useMemo(() => {
    const weekEndDate = new Date(weekEndKey + 'T00:00:00');
    weekEndDate.setDate(weekEndDate.getDate() - 1);
    const startLabel = weekStart.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' });
    const endLabel = weekEndDate.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' });
    return `${startLabel} - ${endLabel}`;
  }, [weekStart, weekEndKey]);

  return (
    <div className="meeting-calendar-view">
      <div className="meeting-calendar-header">
        <div className="meeting-calendar-nav">
          <button
            type="button"
            className="meeting-calendar-nav-btn"
            onClick={goToPrevWeek}
            aria-label="前の週"
          >
            ←
          </button>
          <span className="meeting-calendar-range">{rangeLabel}</span>
          <button
            type="button"
            className="meeting-calendar-nav-btn"
            onClick={goToNextWeek}
            aria-label="次の週"
          >
            →
          </button>
          {!isCurrentWeek && (
            <button
              type="button"
              className="meeting-calendar-today-btn"
              onClick={goToCurrentWeek}
            >
              今週
            </button>
          )}
        </div>
      </div>

      {error && <div className="error-message">会議の読み込みに失敗しました</div>}
      {isLoading && <div className="loading-state">読み込み中...</div>}
      {!isLoading && !error && meetings.length === 0 && (
        <div className="meeting-calendar-empty">この週には会議がありません</div>
      )}

      {!isLoading && !error && (
        <div className="meeting-calendar-grid">
          <div className="meeting-calendar-header-row" style={{ '--days': days.length } as CSSProperties}>
            <div className="meeting-calendar-time-header" />
            {days.map(day => {
              const dayKey = toLocalDateKey(day);
              const isToday = dayKey === toLocalDateKey(today);
              return (
                <div
                  key={dayKey}
                  className={`meeting-calendar-day-header ${isToday ? 'today' : ''}`}
                >
                  {formatDayLabel(day)}
                </div>
              );
            })}
          </div>
          <div className="meeting-calendar-body" style={{ '--days': days.length, '--hour-height': `${HOUR_HEIGHT}px` } as CSSProperties}>
            <div className="meeting-calendar-time-col">
              {hours.map(hour => (
                <div key={hour} className="meeting-calendar-time-slot">
                  {String(hour).padStart(2, '0')}:00
                </div>
              ))}
            </div>
            {days.map(day => {
              const dayKey = toLocalDateKey(day);
              const dayMeetings = meetingsByDay.get(dayKey) ?? [];
              return (
                <div key={dayKey} className="meeting-calendar-day-col" style={{ height: `${gridHeight}px` }}>
                  <div className="meeting-calendar-hour-lines">
                    {hours.map(hour => (
                      <span key={hour} className="meeting-calendar-hour-line" />
                    ))}
                  </div>
                  {dayMeetings.map(meeting => {
                    const startBound = timeBounds.startHour * 60;
                    const endBound = timeBounds.endHour * 60;
                    const clampedStart = Math.max(startBound, meeting.startMinutes);
                    const clampedEnd = Math.min(endBound, meeting.endMinutes);
                    const top = ((clampedStart - startBound) / 60) * HOUR_HEIGHT;
                    const height = Math.max(18, ((clampedEnd - clampedStart) / 60) * HOUR_HEIGHT);
                    const width = 100 / meeting.laneCount;
                    const left = width * meeting.lane;
                    const timeLabel = `${formatTime(meeting.start)} - ${formatTime(meeting.end)}`;
                    return (
                      <div
                        key={meeting.id}
                        className={`meeting-calendar-block ${meeting.status === 'DONE' ? 'done' : ''}`}
                        style={{ top: `${top}px`, height: `${height}px`, left: `${left}%`, width: `${width}%` }}
                        title={`${meeting.title} (${timeLabel})`}
                        role="button"
                        tabIndex={0}
                        onClick={() => handleMeetingClick(meeting)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            handleMeetingClick(meeting);
                          }
                        }}
                      >
                        <div className="meeting-calendar-block-title">{meeting.title}</div>
                        <div className="meeting-calendar-block-time">{timeLabel}</div>
                        {meeting.location && <div className="meeting-calendar-block-location">{meeting.location}</div>}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
