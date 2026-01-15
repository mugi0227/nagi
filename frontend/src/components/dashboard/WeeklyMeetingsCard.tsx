import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { tasksApi } from '../../api/tasks';
import type { Task, TaskUpdate } from '../../api/types';
import { TaskDetailModal } from '../tasks/TaskDetailModal';
import { TaskFormModal } from '../tasks/TaskFormModal';
import './WeeklyMeetingsCard.css';

const TEXT = {
  title: 'Weekly Meetings',
  tag: 'Meetings',
  empty: 'No meetings this week',
  loading: 'Loading...',
  error: 'Failed to load meetings',
  today: '今週',
  prev: '←',
  next: '→',
};

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

const formatRangeLabel = (start: Date, end: Date) => {
  const startLabel = start.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' });
  const endLabel = end.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' });
  return `${startLabel} - ${endLabel}`;
};

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
};

const formatTime = (date: Date) => (
  date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
);

export function WeeklyMeetingsCard() {
  const queryClient = useQueryClient();
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);
  const [editingMeeting, setEditingMeeting] = useState<Task | null>(null);
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
    queryKey: ['meetings', 'week', weekStartKey],
    queryFn: () => tasksApi.getAll({ includeDone: true, onlyMeetings: true }),
    staleTime: 30_000,
  });

  const invalidateAfterChange = () => {
    queryClient.invalidateQueries({ queryKey: ['meetings'] });
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
    queryClient.invalidateQueries({ queryKey: ['schedule'] });
    queryClient.invalidateQueries({ queryKey: ['today-tasks'] });
  };

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: TaskUpdate }) =>
      tasksApi.update(id, data),
    onSuccess: () => {
      invalidateAfterChange();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (taskId: string) => tasksApi.delete(taskId),
    onSuccess: () => {
      invalidateAfterChange();
    },
  });

  const selectedMeeting = useMemo(() => (
    selectedMeetingId
      ? meetingTasks.find(task => task.id === selectedMeetingId) ?? null
      : null
  ), [meetingTasks, selectedMeetingId]);

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

  const rangeLabel = useMemo(() => {
    const weekEndDate = new Date(weekEndKey + 'T00:00:00');
    weekEndDate.setDate(weekEndDate.getDate() - 1);
    return formatRangeLabel(weekStart, weekEndDate);
  }, [weekStart, weekEndKey]);
  const gridHeight = hourCount * HOUR_HEIGHT;

  return (
    <div className="weekly-meetings-card">
      <div className="card-header weekly-meetings-header">
        <div className="weekly-meetings-title">
          <div className="weekly-meetings-title-row">
            <h3>{TEXT.title}</h3>
            <span className="tag info">{TEXT.tag}</span>
          </div>
          <div className="weekly-meetings-nav">
            <button
              type="button"
              className="weekly-meetings-nav-btn"
              onClick={goToPrevWeek}
              aria-label="Previous week"
            >
              {TEXT.prev}
            </button>
            <span className="weekly-meetings-range">{rangeLabel}</span>
            <button
              type="button"
              className="weekly-meetings-nav-btn"
              onClick={goToNextWeek}
              aria-label="Next week"
            >
              {TEXT.next}
            </button>
            {!isCurrentWeek && (
              <button
                type="button"
                className="weekly-meetings-today-btn"
                onClick={goToCurrentWeek}
              >
                {TEXT.today}
              </button>
            )}
          </div>
        </div>
      </div>

      {error && <div className="error-message">{TEXT.error}</div>}
      {isLoading && <div className="loading-state">{TEXT.loading}</div>}
      {!isLoading && !error && meetings.length === 0 && (
        <div className="weekly-meetings-empty">{TEXT.empty}</div>
      )}

      {!isLoading && !error && meetings.length > 0 && (
        <div className="weekly-meetings-grid">
          <div className="weekly-meetings-header-row" style={{ '--days': days.length } as CSSProperties}>
            <div className="weekly-meetings-time-header" />
            {days.map(day => (
              <div key={toLocalDateKey(day)} className="weekly-meetings-day-header">
                {formatDayLabel(day)}
              </div>
            ))}
          </div>
          <div className="weekly-meetings-body" style={{ '--days': days.length, '--hour-height': `${HOUR_HEIGHT}px` } as CSSProperties}>
            <div className="weekly-meetings-time-col">
              {hours.map(hour => (
                <div key={hour} className="weekly-meetings-time-slot">
                  {String(hour).padStart(2, '0')}:00
                </div>
              ))}
            </div>
            {days.map(day => {
              const dayKey = toLocalDateKey(day);
              const dayMeetings = meetingsByDay.get(dayKey) ?? [];
              return (
                <div key={dayKey} className="weekly-meetings-day-col" style={{ height: `${gridHeight}px` }}>
                  <div className="weekly-meetings-hour-lines">
                    {hours.map(hour => (
                      <span key={hour} className="weekly-meetings-hour-line" />
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
                        className={`weekly-meeting-block ${meeting.status === 'DONE' ? 'done' : ''}`}
                        style={{ top: `${top}px`, height: `${height}px`, left: `${left}%`, width: `${width}%` }}
                        title={`${meeting.title} (${timeLabel})`}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedMeetingId(meeting.id)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            setSelectedMeetingId(meeting.id);
                          }
                        }}
                      >
                        <div className="weekly-meeting-title">{meeting.title}</div>
                        <div className="weekly-meeting-time">{timeLabel}</div>
                        {meeting.location && <div className="weekly-meeting-location">{meeting.location}</div>}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {selectedMeeting && (
        <TaskDetailModal
          task={selectedMeeting}
          allTasks={meetingTasks}
          onClose={() => setSelectedMeetingId(null)}
          onEdit={(task) => {
            setEditingMeeting(task);
            setSelectedMeetingId(null);
          }}
          onDelete={(task) => {
            if (deleteMutation.isPending) return;
            const confirmed = window.confirm(`Delete meeting \"${task.title}\"?`);
            if (!confirmed) return;
            setSelectedMeetingId(null);
            deleteMutation.mutate(task.id);
          }}
        />
      )}

      {editingMeeting && (
        <TaskFormModal
          task={editingMeeting}
          allTasks={meetingTasks}
          onClose={() => setEditingMeeting(null)}
          onSubmit={(data) => {
            updateMutation.mutate({ id: editingMeeting.id, data: data as TaskUpdate });
            setEditingMeeting(null);
          }}
          isSubmitting={updateMutation.isPending}
        />
      )}
    </div>
  );
}
