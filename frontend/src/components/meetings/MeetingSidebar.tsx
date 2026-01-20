import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FaCalendarDay, FaRedo } from 'react-icons/fa';
import { RecurringMeeting, Task } from '../../api/types';
import { tasksApi } from '../../api/tasks';
import { useTimezone } from '../../hooks/useTimezone';
import { formatDate, toDateTime } from '../../utils/dateTime';

interface MeetingSidebarProps {
    projectId: string;
    recurringMeetings: RecurringMeeting[];
    selectedTask?: Task | null;
    onSelectTask: (task: Task, date: Date) => void;
    isLoading: boolean;
}

export function MeetingSidebar({
    projectId,
    recurringMeetings,
    selectedTask,
    onSelectTask,
    isLoading
}: MeetingSidebarProps) {
    const timezone = useTimezone();
    // Fetch all meeting Tasks (both recurring and standalone)
    const { data: meetingTasks = [] } = useQuery({
        queryKey: ['meetings', 'project', projectId],
        queryFn: () => tasksApi.getAll({
            includeDone: true,
            onlyMeetings: true,
            projectId: projectId
        }),
        staleTime: 30_000,
    });

    // Create a lookup map for RecurringMeeting by ID
    const recurringMeetingMap = useMemo(() => {
        const map: Record<string, RecurringMeeting> = {};
        recurringMeetings.forEach(m => {
            map[m.id] = m;
        });
        return map;
    }, [recurringMeetings]);

    // Group meeting tasks by recurring_meeting_id
    const { recurringMeetingTasks, standaloneMeetings } = useMemo(() => {
        const recurring: Record<string, { recurringMeeting: RecurringMeeting; tasks: Task[] }> = {};
        const standalone: Task[] = [];

        meetingTasks
            .filter(task => task.is_fixed_time && task.start_time)
            .forEach(task => {
                if (task.recurring_meeting_id) {
                    const rmId = task.recurring_meeting_id;
                    if (!recurring[rmId]) {
                        const rm = recurringMeetingMap[rmId];
                        if (rm) {
                            recurring[rmId] = { recurringMeeting: rm, tasks: [] };
                        } else {
                            // RecurringMeeting not found (maybe deleted), treat as standalone
                            standalone.push(task);
                            return;
                        }
                    }
                    recurring[rmId].tasks.push(task);
                } else {
                    standalone.push(task);
                }
            });

        // Sort tasks within each recurring meeting group by start_time (newest first)
        Object.values(recurring).forEach(group => {
            group.tasks.sort((a, b) => {
                const aTime = a.start_time ? toDateTime(a.start_time, timezone).toMillis() : 0;
                const bTime = b.start_time ? toDateTime(b.start_time, timezone).toMillis() : 0;
                return bTime - aTime;
            });
        });

        // Sort standalone meetings by start_time (newest first)
        standalone.sort((a, b) => {
            const aTime = a.start_time ? toDateTime(a.start_time, timezone).toMillis() : 0;
            const bTime = b.start_time ? toDateTime(b.start_time, timezone).toMillis() : 0;
            return bTime - aTime;
        });

        return { recurringMeetingTasks: recurring, standaloneMeetings: standalone };
    }, [meetingTasks, recurringMeetingMap]);

    const formatDateLabel = (value: string | Date) =>
        formatDate(value, { month: 'numeric', day: 'numeric', weekday: 'short' }, timezone);

    const formatTimeLabel = (value: string | Date) =>
        formatDate(value, { hour: '2-digit', minute: '2-digit' }, timezone);

    const formatTimeDisplay = (task: Task) => {
        if (task.is_all_day) {
            return '終日';
        }
        return formatTimeLabel(task.start_time!);
    };

    const hasNoMeetings = Object.keys(recurringMeetingTasks).length === 0 && standaloneMeetings.length === 0;

    if (isLoading) {
        return (
            <div className="meetings-sidebar">
                <div className="meetings-sidebar-header">
                    <h3 className="meetings-sidebar-title">ミーティング一覧</h3>
                </div>
                <div className="meetings-sidebar-content">
                    <div className="p-4 text-gray-500">読み込み中...</div>
                </div>
            </div>
        );
    }

    if (hasNoMeetings) {
        return (
            <div className="meetings-sidebar">
                <div className="meetings-sidebar-header">
                    <h3 className="meetings-sidebar-title">ミーティング一覧</h3>
                </div>
                <div className="meetings-sidebar-content">
                    <div className="p-4 text-gray-500">ミーティングがありません。</div>
                </div>
            </div>
        );
    }

    return (
        <div className="meetings-sidebar">
            <div className="meetings-sidebar-header">
                <h3 className="meetings-sidebar-title">ミーティング一覧</h3>
            </div>
            <div className="meetings-sidebar-content">
                {/* Recurring meeting tasks */}
                {Object.entries(recurringMeetingTasks).map(([rmId, { recurringMeeting, tasks }]) => (
                    <div key={rmId} className="meeting-nav-group">
                        <div className="meeting-nav-title">
                            <FaRedo className="meeting-nav-title-icon" />
                            {recurringMeeting.title}
                        </div>
                        {tasks.map((task) => {
                            const date = toDateTime(task.start_time!, timezone);
                            const isSelected = selectedTask?.id === task.id;
                            return (
                                <div
                                    key={task.id}
                                    className={`meeting-nav-item ${isSelected ? 'active' : ''}`}
                                    onClick={() => onSelectTask(task, date.toJSDate())}
                                >
                                    <div className="meeting-nav-item-content">
                                        <span>{formatDateLabel(task.start_time!)}</span>
                                        <span className="meeting-nav-item-time">{formatTimeDisplay(task)}</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ))}

                {/* Standalone meetings */}
                {standaloneMeetings.length > 0 && (
                    <div className="meeting-nav-group">
                        <div className="meeting-nav-title">
                            <FaCalendarDay className="meeting-nav-title-icon" />
                            単発ミーティング
                        </div>
                        {standaloneMeetings.map((task) => {
                            const date = toDateTime(task.start_time!, timezone);
                            const isSelected = selectedTask?.id === task.id;
                            return (
                                <div
                                    key={task.id}
                                    className={`meeting-nav-item ${isSelected ? 'active' : ''}`}
                                    onClick={() => onSelectTask(task, date.toJSDate())}
                                >
                                    <div className="meeting-nav-item-content">
                                        <span>{formatDateLabel(task.start_time!)}</span>
                                        <span className="meeting-nav-item-time">{formatTimeDisplay(task)}</span>
                                    </div>
                                    <div className="meeting-nav-item-title">{task.title}</div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}

