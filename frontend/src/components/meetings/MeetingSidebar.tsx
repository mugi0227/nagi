import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FaCalendarDay, FaRedo } from 'react-icons/fa';
import { RecurringMeeting, Task } from '../../api/types';
import { tasksApi } from '../../api/tasks';

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
                const aTime = new Date(a.start_time!).getTime();
                const bTime = new Date(b.start_time!).getTime();
                return bTime - aTime;
            });
        });

        // Sort standalone meetings by start_time (newest first)
        standalone.sort((a, b) => {
            const aTime = new Date(a.start_time!).getTime();
            const bTime = new Date(b.start_time!).getTime();
            return bTime - aTime;
        });

        return { recurringMeetingTasks: recurring, standaloneMeetings: standalone };
    }, [meetingTasks, recurringMeetingMap]);

    const formatDate = (date: Date) => {
        return date.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short' });
    };

    const formatTime = (date: Date) => {
        return date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
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
                            const date = new Date(task.start_time!);
                            const isSelected = selectedTask?.id === task.id;
                            return (
                                <div
                                    key={task.id}
                                    className={`meeting-nav-item ${isSelected ? 'active' : ''}`}
                                    onClick={() => onSelectTask(task, date)}
                                >
                                    <div className="meeting-nav-item-content">
                                        <span>{formatDate(date)}</span>
                                        <span className="meeting-nav-item-time">{formatTime(date)}</span>
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
                            const date = new Date(task.start_time!);
                            const isSelected = selectedTask?.id === task.id;
                            return (
                                <div
                                    key={task.id}
                                    className={`meeting-nav-item ${isSelected ? 'active' : ''}`}
                                    onClick={() => onSelectTask(task, date)}
                                >
                                    <div className="meeting-nav-item-content">
                                        <span>{formatDate(date)}</span>
                                        <span className="meeting-nav-item-time">{formatTime(date)}</span>
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

