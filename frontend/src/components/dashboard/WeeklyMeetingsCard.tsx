import { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import type { CSSProperties } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tasksApi } from '../../api/tasks';
import type { Task } from '../../api/types';
import { useCapacitySettings } from '../../hooks/useCapacitySettings';
import { useTaskModal } from '../../hooks/useTaskModal';
import { useTimezone } from '../../hooks/useTimezone';
import { formatDate, toDateKey, toDateTime, todayInTimezone, nowInTimezone } from '../../utils/dateTime';
import { DEFAULT_WEEKLY_WORK_HOURS } from '../../utils/capacitySettings';
import { PostponePopover } from './PostponePopover';
import './WeeklyMeetingsCard.css';

const TEXT = {
  title: '\u30b9\u30b1\u30b8\u30e5\u30fc\u30eb',
  tag: '\u30ab\u30ec\u30f3\u30c0\u30fc',
  empty: 'No meetings this week',
  loading: 'Loading...',
  error: 'Failed to load meetings',
  today: '\u4eca\u65e5',
  thisWeek: '\u4eca\u9031',
  prev: '<',
  next: '>',
  viewWeek: '\u9031\u9593',
  viewWorkdays: '\u7a3c\u50cd\u65e5',
  viewToday: '\u4eca\u65e5',
  reschedule: '\u518d\u914d\u7f6e',
  dependencyAlert: '\u4f9d\u5b58\u30bf\u30b9\u30af\u304c\u5b8c\u4e86\u3057\u3066\u3044\u306a\u3044\u305f\u3081\u5b8c\u4e86\u3067\u304d\u307e\u305b\u3093',
  statusError: '\u30b9\u30c6\u30fc\u30bf\u30b9\u5909\u66f4\u306b\u5931\u6557\u3057\u307e\u3057\u305f',
  doTodayError: '\u4eca\u65e5\u3084\u308b\u306e\u8a2d\u5b9a\u306b\u5931\u6557\u3057\u307e\u3057\u305f',
};

const DEFAULT_START_HOUR = 8;
const DEFAULT_END_HOUR = 20;
const MIN_START_HOUR = 6;
const MAX_END_HOUR = 22;
const MIN_HOUR_HEIGHT = 28;
const MAX_HOUR_HEIGHT = 120;
const DEFAULT_HOUR_HEIGHT = MAX_HOUR_HEIGHT;
const HOUR_ZOOM_STEP = 4;
const WARMUP_MINUTES = 15;

type ViewMode = 'week' | 'workdays' | 'today';

const VIEW_OPTIONS: { id: ViewMode; label: string }[] = [
  { id: 'week', label: TEXT.viewWeek },
  { id: 'workdays', label: TEXT.viewWorkdays },
  { id: 'today', label: TEXT.viewToday },
];

type WeeklyMeetingsCardProps = {
  embedded?: boolean;
  defaultViewMode?: ViewMode;
  onTaskClick?: (taskId: string) => void;
};

const toLocalDateKey = (date: Date, timezone: string) => toDateKey(date, timezone);

const startOfWeek = (date: ReturnType<typeof todayInTimezone>) => {
  const diff = date.weekday - 1;
  return date.minus({ days: diff }).startOf('day');
};

const formatDayLabel = (date: Date, timezone: string) => (
  formatDate(date, { month: 'numeric', day: 'numeric', weekday: 'short' }, timezone)
);

const formatRangeLabel = (start: Date, end: Date, timezone: string) => {
  const startLabel = formatDate(start, { month: 'numeric', day: 'numeric' }, timezone);
  const endLabel = formatDate(end, { month: 'numeric', day: 'numeric' }, timezone);
  return `${startLabel} - ${endLabel}`;
};

type MeetingBlock = {
  id: string;
  taskId: string;
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
  kind: 'meeting' | 'auto';
  pinnedDate?: string;
};

const formatTime = (date: Date, timezone: string) => (
  formatDate(date, { hour: '2-digit', minute: '2-digit' }, timezone)
);

const parseTimeToMinutes = (value: string) => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
};

type TimeInterval = {
  startMinutes: number;
  endMinutes: number;
};

type WorkdayConfig = {
  workWindow: TimeInterval[];
  taskIntervals: TimeInterval[];
  breaks: TimeInterval[];
};

const cloneIntervals = (intervals: TimeInterval[]) => (
  intervals.map(interval => ({ ...interval }))
);

const subtractIntervals = (base: TimeInterval[], remove: TimeInterval[]) => {
  if (remove.length === 0) return base;
  let intervals = base;
  remove.forEach(block => {
    intervals = intervals.flatMap(interval => {
      if (block.endMinutes <= interval.startMinutes || block.startMinutes >= interval.endMinutes) {
        return [interval];
      }
      const next: TimeInterval[] = [];
      if (block.startMinutes > interval.startMinutes) {
        next.push({
          startMinutes: interval.startMinutes,
          endMinutes: Math.min(block.startMinutes, interval.endMinutes),
        });
      }
      if (block.endMinutes < interval.endMinutes) {
        next.push({
          startMinutes: Math.max(block.endMinutes, interval.startMinutes),
          endMinutes: interval.endMinutes,
        });
      }
      return next;
    });
  });
  return intervals.filter(interval => interval.endMinutes > interval.startMinutes);
};

const getNonWorkIntervals = (
  workIntervals: TimeInterval[],
  startBound: number,
  endBound: number,
) => {
  if (endBound <= startBound) return [];
  if (workIntervals.length === 0) {
    return [{ startMinutes: startBound, endMinutes: endBound }];
  }
  return subtractIntervals([{ startMinutes: startBound, endMinutes: endBound }], workIntervals);
};

export function WeeklyMeetingsCard({
  embedded = false,
  defaultViewMode = 'workdays',
  onTaskClick,
}: WeeklyMeetingsCardProps) {
  const queryClient = useQueryClient();
  const timezone = useTimezone();
  const {
    capacityHours,
    bufferHours,
    capacityByWeekday,
    weeklyWorkHours,
    breakAfterTaskMinutes,
  } = useCapacitySettings();
  const [viewMode, setViewMode] = useState<ViewMode>(defaultViewMode);
  const [weekOffset, setWeekOffset] = useState(0);
  const [dayOffset, setDayOffset] = useState(0);
  const [hourHeight, setHourHeight] = useState(DEFAULT_HOUR_HEIGHT);
  const [isSubmitting, setIsSubmitting] = useState<string | null>(null);
  const [localDoneIds, setLocalDoneIds] = useState<Set<string>>(new Set());
  const [rescheduleFromNow, setRescheduleFromNow] = useState(false);
  const gridRef = useRef<HTMLDivElement | null>(null);

  const today = todayInTimezone(timezone);
  const todayKey = toDateKey(today.toJSDate(), timezone);
  const currentWeekStart = startOfWeek(today);
  const currentWeekStartKey = toDateKey(currentWeekStart.toJSDate(), timezone);
  const weekStart = useMemo(
    () => currentWeekStart.plus({ days: weekOffset * 7 }),
    [currentWeekStartKey, weekOffset],
  );
  const dayStart = useMemo(
    () => today.plus({ days: dayOffset }),
    [dayOffset, todayKey],
  );
  const viewStart = viewMode === 'today' ? dayStart : weekStart;
  const viewDaysCount = viewMode === 'today' ? 1 : viewMode === 'workdays' ? 5 : 7;
  const viewEnd = viewStart.plus({ days: viewDaysCount });
  const viewStartKey = toDateKey(viewStart.toJSDate(), timezone);
  const viewEndKey = toDateKey(viewEnd.toJSDate(), timezone);
  const todayStart = today.startOf('day');
  const viewStartDay = viewStart.startOf('day');
  const scheduleStart = viewStartDay < todayStart ? todayStart : viewStartDay;
  const scheduleStartKey = toDateKey(scheduleStart.toJSDate(), timezone);
  const pastDaysCount = viewStartDay < todayStart
    ? Math.round(todayStart.diff(viewStartDay, 'days').days)
    : 0;
  const scheduleDaysCount = Math.max(0, viewDaysCount - pastDaysCount);

  const isCurrentView = viewMode === 'today' ? dayOffset === 0 : weekOffset === 0;
  const goToPrevRange = () => {
    if (viewMode === 'today') {
      setDayOffset(prev => prev - 1);
    } else {
      setWeekOffset(prev => prev - 1);
    }
  };
  const goToNextRange = () => {
    if (viewMode === 'today') {
      setDayOffset(prev => prev + 1);
    } else {
      setWeekOffset(prev => prev + 1);
    }
  };
  const goToCurrentRange = () => {
    if (viewMode === 'today') {
      setDayOffset(0);
    } else {
      setWeekOffset(0);
    }
  };

  const days = useMemo(() => (
    Array.from({ length: viewDaysCount }, (_, index) => {
      return viewStart.plus({ days: index });
    })
  ), [viewStartKey, viewDaysCount]);

  const { data: scheduleData } = useQuery({
    queryKey: [
      'schedule',
      'view',
      viewMode,
      scheduleStartKey,
      scheduleDaysCount,
      capacityHours,
      bufferHours,
      capacityByWeekday,
    ],
    queryFn: () => tasksApi.getSchedule({
      startDate: scheduleStartKey,
      maxDays: scheduleDaysCount,
      capacityHours,
      bufferHours,
      capacityByWeekday,
      filterByAssignee: true,
    }),
    staleTime: Infinity,
    enabled: scheduleDaysCount > 0,
  });

  const { data: meetingTasks = [], isLoading, error, refetch } = useQuery({
    queryKey: ['meetings', 'view', viewMode, viewStartKey, viewDaysCount],
    queryFn: () => tasksApi.getAll({ includeDone: true, onlyMeetings: true }),
    staleTime: 30_000,
  });

  const invalidateAfterChange = (includeSchedule = false) => {
    const keys = [
      ['meetings'], ['tasks'], ['subtasks'], ['top3'], ['today-tasks'],
      ['task-detail'], ['task-assignments'], ['project'],
    ];
    if (includeSchedule) keys.push(['schedule']);
    for (const key of keys) {
      queryClient.invalidateQueries({ queryKey: key });
    }
  };

  // useTaskModal for modal management
  const taskModal = useTaskModal({
    tasks: meetingTasks,
    onRefetch: () => {
      refetch();
      invalidateAfterChange(true);
    },
  });
  const showTitle = !embedded;
  const handleTaskClick = (taskId: string) => {
    if (onTaskClick) {
      onTaskClick(taskId);
      return;
    }
    taskModal.openTaskDetailById(taskId);
  };

  const handleToggleComplete = async (taskId: string, currentStatus: Task['status'], e: React.MouseEvent) => {
    e.stopPropagation();
    if (isSubmitting) return;

    if (currentStatus === 'DONE') {
      setIsSubmitting(taskId);
      try {
        setLocalDoneIds(prev => { const next = new Set(prev); next.delete(taskId); return next; });
        await tasksApi.update(taskId, { status: 'TODO' });
        invalidateAfterChange(true);
      } catch {
        alert(TEXT.statusError);
      } finally {
        setIsSubmitting(null);
      }
      return;
    }

    setIsSubmitting(taskId);
    try {
      const task = await tasksApi.getById(taskId);
      if (task.dependency_ids && task.dependency_ids.length > 0) {
        const deps = await Promise.all(
          task.dependency_ids.map(depId => tasksApi.getById(depId).catch(() => null))
        );
        const hasPending = deps.some(dep => !dep || dep.status !== 'DONE');
        if (hasPending) {
          alert(TEXT.dependencyAlert);
          setIsSubmitting(null);
          return;
        }
      }
      setLocalDoneIds(prev => new Set(prev).add(taskId));
      await tasksApi.update(taskId, { status: 'DONE' });
      invalidateAfterChange(true);
    } catch {
      setLocalDoneIds(prev => { const next = new Set(prev); next.delete(taskId); return next; });
      alert(TEXT.statusError);
    } finally {
      setIsSubmitting(null);
    }
  };

  const handleDoToday = async (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (isSubmitting) return;
    setIsSubmitting(taskId);
    try {
      await tasksApi.doToday(taskId, { pin: true });
      invalidateAfterChange(true);
    } catch {
      alert(TEXT.doTodayError);
    } finally {
      setIsSubmitting(null);
    }
  };

  const meetings = useMemo(() => {
    const viewStartDate = viewStart.startOf('day');
    const viewEndDate = viewEnd.startOf('day');

    return meetingTasks
      .filter(task => task.is_fixed_time && task.start_time && task.end_time)
      .map(task => {
        const start = toDateTime(task.start_time as string, timezone);
        const end = toDateTime(task.end_time as string, timezone);
        if (!start.isValid || !end.isValid) return null;
        if (start.toMillis() < viewStartDate.toMillis() || start.toMillis() >= viewEndDate.toMillis()) return null;
        const startMinutes = start.hour * 60 + start.minute;
        const endMinutesRaw = end.hour * 60 + end.minute;
        const endMinutes = Math.max(startMinutes + 15, endMinutesRaw);
        return {
          id: task.id,
          taskId: task.id,
          title: task.title,
          start: start.toJSDate(),
          end: end.toJSDate(),
          dayKey: toLocalDateKey(start.toJSDate(), timezone),
          startMinutes,
          endMinutes,
          lane: 0,
          laneCount: 1,
          location: task.location,
          status: task.status,
          kind: 'meeting',
        } satisfies MeetingBlock;
      })
      .filter(Boolean) as MeetingBlock[];
  }, [meetingTasks, viewStartKey, viewEndKey, timezone]);

  const meetingTaskIds = useMemo(() => new Set(meetingTasks.map(task => task.id)), [meetingTasks]);

  const meetingIntervalsByDay = useMemo(() => {
    const grouped = new Map<string, TimeInterval[]>();
    meetings.forEach(meeting => {
      const list = grouped.get(meeting.dayKey) ?? [];
      list.push({ startMinutes: meeting.startMinutes, endMinutes: meeting.endMinutes });
      grouped.set(meeting.dayKey, list);
    });
    return grouped;
  }, [meetings]);

  const workdayConfigByDay = useMemo(() => {
    const resolvedWeekly = weeklyWorkHours ?? DEFAULT_WEEKLY_WORK_HOURS;
    const map = new Map<string, WorkdayConfig>();

    days.forEach(day => {
      const weekdayIndex = day.toJSDate().getDay();
      const config = resolvedWeekly[weekdayIndex] ?? DEFAULT_WEEKLY_WORK_HOURS[weekdayIndex];
      if (!config?.enabled) return;
      const startMinutes = parseTimeToMinutes(config.start);
      const endMinutes = parseTimeToMinutes(config.end);
      if (startMinutes == null || endMinutes == null || endMinutes <= startMinutes) return;
      const manualBreaks = (config.breaks ?? [])
        .map(entry => {
          const breakStart = parseTimeToMinutes(entry.start);
          const breakEnd = parseTimeToMinutes(entry.end);
          if (breakStart == null || breakEnd == null || breakEnd <= breakStart) return null;
          const overlapStart = Math.max(startMinutes, breakStart);
          const overlapEnd = Math.min(endMinutes, breakEnd);
          if (overlapEnd <= overlapStart) return null;
          return { startMinutes: overlapStart, endMinutes: overlapEnd };
        })
        .filter(Boolean) as TimeInterval[];
      const workWindow = [{ startMinutes, endMinutes }];
      const withoutManualBreaks = subtractIntervals(workWindow, manualBreaks);
      const warmupBreaks: TimeInterval[] = [];
      if (withoutManualBreaks.length > 0) {
        const first = withoutManualBreaks[0];
        const warmupEnd = Math.min(first.endMinutes, first.startMinutes + WARMUP_MINUTES);
        if (warmupEnd > first.startMinutes) {
          warmupBreaks.push({ startMinutes: first.startMinutes, endMinutes: warmupEnd });
        }
      }
      const withoutWarmup = subtractIntervals(withoutManualBreaks, warmupBreaks);
      const taskIntervals = withoutWarmup;
      map.set(toLocalDateKey(day.toJSDate(), timezone), {
        workWindow,
        taskIntervals,
        breaks: manualBreaks,
      });
    });

    return map;
  }, [days, timezone, weeklyWorkHours]);

  // Current time indicator state (updates every minute)
  const [nowMinutes, setNowMinutes] = useState(() => {
    const now = nowInTimezone(timezone);
    return now.hour * 60 + now.minute;
  });

  useEffect(() => {
    const tick = () => {
      const now = nowInTimezone(timezone);
      setNowMinutes(now.hour * 60 + now.minute);
    };
    const interval = setInterval(tick, 60_000);
    return () => clearInterval(interval);
  }, [timezone]);

  const autoBlocks = useMemo(() => {
    if (!scheduleData?.days || !scheduleData.tasks) return [] as MeetingBlock[];
    const taskInfoMap = new Map(scheduleData.tasks.map(task => [task.task_id, task]));
    const scheduleDayMap = new Map(
      scheduleData.days.map(day => [toDateKey(day.date, timezone), day])
    );
    const blocks: MeetingBlock[] = [];

    days.forEach(day => {
      const dayKey = toLocalDateKey(day.toJSDate(), timezone);
      const scheduleDay = scheduleDayMap.get(dayKey);
      if (!scheduleDay || scheduleDay.task_allocations.length === 0) return;

      const baseWorkday = workdayConfigByDay.get(dayKey);
      const fallbackInterval: TimeInterval = {
        startMinutes: DEFAULT_START_HOUR * 60,
        endMinutes: DEFAULT_END_HOUR * 60,
      };
      let available = baseWorkday?.taskIntervals.length ? cloneIntervals(baseWorkday.taskIntervals) : [];
      if (available.length === 0) {
        available = [fallbackInterval];
      }

      const meetingIntervals = meetingIntervalsByDay.get(dayKey) ?? [];
      available = subtractIntervals(available, meetingIntervals);

      // Reschedule: clip today's available intervals to start from now
      if (rescheduleFromNow && dayKey === todayKey) {
        available = available
          .map(interval => ({
            startMinutes: Math.max(interval.startMinutes, nowMinutes),
            endMinutes: interval.endMinutes,
          }))
          .filter(interval => interval.endMinutes > interval.startMinutes);
      }

      let segmentIndex = 0;
      scheduleDay.task_allocations.forEach(allocation => {
        if (meetingTaskIds.has(allocation.task_id)) {
          return;
        }
        const taskInfo = taskInfoMap.get(allocation.task_id);
        if (!taskInfo) return;
        let remaining = allocation.minutes;
        while (remaining > 0 && available.length > 0) {
          const current = available[0];
          const duration = Math.min(remaining, current.endMinutes - current.startMinutes);
          if (duration <= 0) {
            available.shift();
            continue;
          }
          const startMinutes = current.startMinutes;
          const endMinutes = startMinutes + duration;
          const dayStart = day.startOf('day');
          const startDate = dayStart.plus({ minutes: startMinutes }).toJSDate();
          const endDate = dayStart.plus({ minutes: endMinutes }).toJSDate();
          blocks.push({
            id: `${allocation.task_id}-${segmentIndex}`,
            taskId: allocation.task_id,
            title: taskInfo.title,
            start: startDate,
            end: endDate,
            dayKey,
            startMinutes,
            endMinutes,
            lane: 0,
            laneCount: 1,
            status: (taskInfo.status === 'DONE' ? 'DONE' : 'TODO') as Task['status'],
            kind: 'auto',
            pinnedDate: taskInfo.pinned_date ?? undefined,
          });
          segmentIndex += 1;
          remaining -= duration;
          const nextStartMinutes = remaining <= 0
            ? endMinutes + breakAfterTaskMinutes
            : endMinutes;
          current.startMinutes = nextStartMinutes;
          if (current.startMinutes >= current.endMinutes) {
            available.shift();
          }
        }
      });
    });

    return blocks;
  }, [days, meetingIntervalsByDay, scheduleData?.days, scheduleData?.tasks, timezone, workdayConfigByDay, rescheduleFromNow, todayKey, nowMinutes]);

  const autoBlocksByDay = useMemo(() => {
    const grouped = new Map<string, MeetingBlock[]>();
    autoBlocks.forEach(block => {
      const list = grouped.get(block.dayKey) ?? [];
      list.push(block);
      grouped.set(block.dayKey, list);
    });
    return grouped;
  }, [autoBlocks]);

  const timeBounds = useMemo(() => {
    const workdayBounds = Array.from(workdayConfigByDay.values()).reduce<TimeInterval | null>(
      (acc, current) => {
        if (!current.workWindow.length) return acc;
        const minStart = Math.min(...current.workWindow.map(interval => interval.startMinutes));
        const maxEnd = Math.max(...current.workWindow.map(interval => interval.endMinutes));
        if (!acc) return { startMinutes: minStart, endMinutes: maxEnd };
        return {
          startMinutes: Math.min(acc.startMinutes, minStart),
          endMinutes: Math.max(acc.endMinutes, maxEnd),
        };
      },
      null
    );
    const allBlocks = [...meetings, ...autoBlocks];
    if (!allBlocks.length && !workdayBounds) {
      return { startHour: DEFAULT_START_HOUR, endHour: DEFAULT_END_HOUR };
    }
    const minStart = allBlocks.length
      ? Math.min(...allBlocks.map(block => block.startMinutes))
      : (workdayBounds?.startMinutes ?? DEFAULT_START_HOUR * 60);
    const maxEnd = allBlocks.length
      ? Math.max(...allBlocks.map(block => block.endMinutes))
      : (workdayBounds?.endMinutes ?? DEFAULT_END_HOUR * 60);
    const effectiveMinStart = workdayBounds
      ? Math.min(workdayBounds.startMinutes, minStart)
      : minStart;
    const effectiveMaxEnd = workdayBounds
      ? Math.max(workdayBounds.endMinutes, maxEnd)
      : maxEnd;
    let startHour = Math.min(DEFAULT_START_HOUR, Math.floor(effectiveMinStart / 60));
    let endHour = Math.max(DEFAULT_END_HOUR, Math.ceil(effectiveMaxEnd / 60));
    startHour = Math.max(MIN_START_HOUR, startHour);
    endHour = Math.min(MAX_END_HOUR, Math.max(startHour + 1, endHour));
    return { startHour, endHour };
  }, [autoBlocks, meetings, workdayConfigByDay]);

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
    if (viewMode === 'today') {
      return formatDate(viewStart.toJSDate(), { month: 'numeric', day: 'numeric', weekday: 'short' }, timezone);
    }
    const viewEndDate = viewEnd.minus({ days: 1 });
    return formatRangeLabel(viewStart.toJSDate(), viewEndDate.toJSDate(), timezone);
  }, [viewMode, viewStartKey, viewEndKey, timezone]);
  const gridHeight = hourCount * hourHeight;
  const scheduleHasItems = meetings.length > 0 || autoBlocks.length > 0;

  const currentTimeInBounds =
    nowMinutes >= timeBounds.startHour * 60 && nowMinutes < timeBounds.endHour * 60;

  // Auto-scroll to current time at ~30% from top
  const hasAutoScrolled = useRef(false);
  const scrollToCurrentTime = useCallback(() => {
    const grid = gridRef.current;
    if (!grid || !currentTimeInBounds) return;
    const startBound = timeBounds.startHour * 60;
    const currentOffset = ((nowMinutes - startBound) / 60) * hourHeight;
    const viewportHeight = grid.clientHeight;
    const targetScroll = currentOffset - viewportHeight * 0.3;
    grid.scrollTop = Math.max(0, targetScroll);
  }, [currentTimeInBounds, timeBounds.startHour, nowMinutes, hourHeight]);

  useEffect(() => {
    if (!hasAutoScrolled.current && scheduleHasItems) {
      // Small delay to ensure DOM is rendered
      requestAnimationFrame(() => {
        scrollToCurrentTime();
        hasAutoScrolled.current = true;
      });
    }
  }, [scheduleHasItems, scrollToCurrentTime]);

  useEffect(() => {
    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      const grid = gridRef.current;
      if (!grid || !(event.target instanceof Node) || !grid.contains(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      const direction = event.deltaY > 0 ? -1 : 1;
      setHourHeight(prev => {
        const next = prev + direction * HOUR_ZOOM_STEP;
        return Math.min(MAX_HOUR_HEIGHT, Math.max(MIN_HOUR_HEIGHT, next));
      });
    };
    window.addEventListener('wheel', handleWheel, { passive: false, capture: true });
    return () => window.removeEventListener('wheel', handleWheel, { capture: true });
  }, []);

  return (
    <div className={`weekly-meetings-card ${embedded ? 'embedded' : ''}`}>
      <div className="card-header weekly-meetings-header">
        <div className="weekly-meetings-title">
          <div className="weekly-meetings-title-row">
            {showTitle && (
              <div className="weekly-meetings-title-group">
                <h3>{TEXT.title}</h3>
                <span className="tag info">{TEXT.tag}</span>
              </div>
            )}
            <div className="weekly-meetings-view-tabs">
              {VIEW_OPTIONS.map(option => (
                <button
                  key={option.id}
                  type="button"
                  className={`weekly-meetings-view-tab ${viewMode === option.id ? 'active' : ''}`}
                  onClick={() => setViewMode(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div className="weekly-meetings-nav">
            <button
              type="button"
              className="weekly-meetings-nav-btn"
              onClick={goToPrevRange}
              aria-label={viewMode === 'today' ? 'Previous day' : 'Previous week'}
            >
              {TEXT.prev}
            </button>
            <span className="weekly-meetings-range">{rangeLabel}</span>
            <button
              type="button"
              className="weekly-meetings-nav-btn"
              onClick={goToNextRange}
              aria-label={viewMode === 'today' ? 'Next day' : 'Next week'}
            >
              {TEXT.next}
            </button>
            {!isCurrentView && (
              <button
                type="button"
                className="weekly-meetings-today-btn"
                onClick={goToCurrentRange}
              >
                {viewMode === 'today' ? TEXT.today : TEXT.thisWeek}
              </button>
            )}
            <button
              type="button"
              className={`weekly-meetings-reschedule-btn ${rescheduleFromNow ? 'active' : ''}`}
              onClick={() => {
                setRescheduleFromNow(prev => !prev);
                setLocalDoneIds(new Set());
                queryClient.invalidateQueries({ queryKey: ['schedule'] });
              }}
              title="今の時刻から再配置（スケジュール再計算）"
            >
              {TEXT.reschedule}
            </button>
          </div>
        </div>
      </div>

      {error && <div className="error-message">{TEXT.error}</div>}
      {isLoading && <div className="loading-state">{TEXT.loading}</div>}
      {!isLoading && !error && !scheduleHasItems && (
        <div className="weekly-meetings-empty">{TEXT.empty}</div>
      )}

      {!isLoading && !error && scheduleHasItems && (
        <div className="weekly-meetings-grid" ref={gridRef}>
          <div className="weekly-meetings-header-row" style={{ '--days': days.length } as CSSProperties}>
            <div className="weekly-meetings-time-header" />
            {days.map(day => {
              const dayKey = toLocalDateKey(day.toJSDate(), timezone);
              const isToday = dayKey === todayKey;
              return (
                <div key={dayKey} className={`weekly-meetings-day-header ${isToday ? 'today' : ''}`}>
                  {formatDayLabel(day.toJSDate(), timezone)}
                </div>
              );
            })}
          </div>
          <div className="weekly-meetings-body" style={{ '--days': days.length, '--hour-height': `${hourHeight}px` } as CSSProperties}>
            <div className="weekly-meetings-time-col">
              {hours.map(hour => (
                <div key={hour} className="weekly-meetings-time-slot">
                  {String(hour).padStart(2, '0')}:00
                </div>
              ))}
            </div>
            {days.map(day => {
              const dayKey = toLocalDateKey(day.toJSDate(), timezone);
              const isToday = dayKey === todayKey;
              const dayMeetings = meetingsByDay.get(dayKey) ?? [];
              const dayAutoBlocks = autoBlocksByDay.get(dayKey) ?? [];
              const dayBlocks = [...dayAutoBlocks, ...dayMeetings];
              const workdayConfig = workdayConfigByDay.get(dayKey);
              const startBound = timeBounds.startHour * 60;
              const endBound = timeBounds.endHour * 60;
              const nonWorkIntervals = getNonWorkIntervals(
                workdayConfig?.workWindow ?? [],
                startBound,
                endBound,
              );
              return (
                <div key={dayKey} className={`weekly-meetings-day-col ${isToday ? 'today' : ''}`} style={{ height: `${gridHeight}px` }}>
                  <div className="weekly-workhours-layer">
                    {nonWorkIntervals.map(interval => {
                      const clampedStart = Math.max(startBound, interval.startMinutes);
                      const clampedEnd = Math.min(endBound, interval.endMinutes);
                      if (clampedEnd <= clampedStart) return null;
                        const top = ((clampedStart - startBound) / 60) * hourHeight;
                        const height = Math.max(1, ((clampedEnd - clampedStart) / 60) * hourHeight);
                      return (
                        <div
                          key={`${dayKey}-off-${interval.startMinutes}`}
                          className="weekly-nonwork-block"
                          style={{ top: `${top}px`, height: `${height}px` }}
                        />
                        );
                      })}
                  </div>
                  <div className="weekly-meetings-hour-lines">
                    {hours.map(hour => (
                      <span key={hour} className="weekly-meetings-hour-line" />
                    ))}
                  </div>
                  {isToday && currentTimeInBounds && (
                    <div
                      className="weekly-current-time-line"
                      style={{
                        top: `${((nowMinutes - startBound) / 60) * hourHeight}px`,
                      }}
                    />
                  )}
                  {dayBlocks.map(meeting => {
                    const startBound = timeBounds.startHour * 60;
                    const endBound = timeBounds.endHour * 60;
                    const clampedStart = Math.max(startBound, meeting.startMinutes);
                    const clampedEnd = Math.min(endBound, meeting.endMinutes);
                    const top = ((clampedStart - startBound) / 60) * hourHeight;
                    const height = Math.max(1, ((clampedEnd - clampedStart) / 60) * hourHeight);
                    const width = 100 / meeting.laneCount;
                    const left = width * meeting.lane;
                    const timeLabel = `${formatTime(meeting.start, timezone)} - ${formatTime(meeting.end, timezone)}`;
                    const effectiveStatus = localDoneIds.has(meeting.taskId) ? 'DONE' : meeting.status;
                    return (
                      <div
                        key={meeting.id}
                        className={`weekly-meeting-block ${meeting.kind === 'auto' ? 'auto-slot' : ''} ${
                          effectiveStatus === 'DONE' ? 'done' : ''
                        }`}
                        style={{ top: `${top}px`, height: `${height}px`, left: `${left}%`, width: `${width}%` }}
                        title={`${meeting.title} (${timeLabel})`}
                        role="button"
                        tabIndex={0}
                        onClick={() => handleTaskClick(meeting.taskId)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            handleTaskClick(meeting.taskId);
                          }
                        }}
                      >
                        <div className="weekly-block-actions">
                          <button
                            type="button"
                            className={`weekly-block-check ${effectiveStatus === 'DONE' ? 'checked' : ''}`}
                            onClick={(e) => handleToggleComplete(meeting.taskId, effectiveStatus, e)}
                            disabled={isSubmitting === meeting.taskId}
                            title={effectiveStatus === 'DONE' ? '未完了に戻す' : '完了にする'}
                          >
                            {effectiveStatus === 'DONE' ? '✓' : ''}
                          </button>
                          {meeting.kind === 'auto' && effectiveStatus !== 'DONE' && !isToday && (
                            <button
                              type="button"
                              className="weekly-block-do-today"
                              onClick={(e) => handleDoToday(meeting.taskId, e)}
                              disabled={isSubmitting === meeting.taskId}
                              title="今日やる"
                            >
                              ←
                            </button>
                          )}
                          {meeting.kind === 'auto' && effectiveStatus !== 'DONE' && (
                            <PostponePopover
                              taskId={meeting.taskId}
                              className="weekly-block-postpone"
                              onSuccess={() => invalidateAfterChange()}
                            />
                          )}
                        </div>
                        <div className="weekly-meeting-title">
                          {meeting.title}
                          {meeting.pinnedDate && (
                            <span className="weekly-pin-badge" title={`${meeting.pinnedDate} に固定中`}>
                              📌{new Date(meeting.pinnedDate + 'T00:00:00').getMonth() + 1}/{new Date(meeting.pinnedDate + 'T00:00:00').getDate()}
                            </span>
                          )}
                        </div>
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

      {!onTaskClick && taskModal.renderModals()}
    </div>
  );
}
