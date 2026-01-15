import { useEffect, useState } from 'react';
import { FaCalendarAlt, FaList } from 'react-icons/fa';
import { api as client } from '../../api/client';
import { RecurringMeeting, Task } from '../../api/types';
import { MeetingCalendarView } from './MeetingCalendarView';
import { MeetingMainContent } from './MeetingMainContent';
import { MeetingSidebar } from './MeetingSidebar';
import './MeetingsTab.css';
import './MeetingCalendarView.css';

type ViewMode = 'list' | 'calendar';

interface MeetingsTabProps {
    projectId: string;
}

export function MeetingsTab({ projectId }: MeetingsTabProps) {
    const [viewMode, setViewMode] = useState<ViewMode>('list');
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    const [selectedMeeting, setSelectedMeeting] = useState<RecurringMeeting | null>(null);
    const [selectedTask, setSelectedTask] = useState<Task | null>(null);
    const [recurringMeetings, setRecurringMeetings] = useState<RecurringMeeting[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchRecurringMeetings = async () => {
            setIsLoading(true);
            try {
                const response = await client.get<RecurringMeeting[]>(`/recurring-meetings?project_id=${projectId}`);
                setRecurringMeetings(response || []);
            } catch (e) {
                console.error("Failed to fetch recurring meetings", e);
            } finally {
                setIsLoading(false);
            }
        };
        fetchRecurringMeetings();
    }, [projectId]);

    const handleSelectTask = (task: Task, date: Date) => {
        setSelectedDate(date);
        setSelectedTask(task);
        if (task.recurring_meeting_id) {
            const meeting = recurringMeetings.find(m => m.id === task.recurring_meeting_id);
            setSelectedMeeting(meeting || null);
        } else {
            setSelectedMeeting(null);
        }
    };

    const handleCalendarMeetingSelect = (task: Task, date: Date) => {
        setSelectedDate(date);
        setSelectedTask(task);
        if (task.recurring_meeting_id) {
            const meeting = recurringMeetings.find(m => m.id === task.recurring_meeting_id);
            setSelectedMeeting(meeting || null);
        } else {
            setSelectedMeeting(null);
        }
    };

    return (
        <div className="meetings-tab-wrapper">
            <div className="meetings-tab-view-toggle">
                <button
                    className={`view-toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
                    onClick={() => setViewMode('list')}
                    title="リスト表示"
                >
                    <FaList /> リスト
                </button>
                <button
                    className={`view-toggle-btn ${viewMode === 'calendar' ? 'active' : ''}`}
                    onClick={() => setViewMode('calendar')}
                    title="カレンダー表示"
                >
                    <FaCalendarAlt /> カレンダー
                </button>
            </div>

            {viewMode === 'list' ? (
                <div className="meetings-tab-container">
                    <MeetingSidebar
                        projectId={projectId}
                        recurringMeetings={recurringMeetings}
                        selectedTask={selectedTask}
                        onSelectTask={handleSelectTask}
                        isLoading={isLoading}
                    />
                    <MeetingMainContent
                        projectId={projectId}
                        selectedDate={selectedDate}
                        selectedMeeting={selectedMeeting}
                        selectedTask={selectedTask}
                    />
                </div>
            ) : (
                <div className="meetings-tab-calendar-container">
                    <MeetingCalendarView
                        projectId={projectId}
                        onMeetingSelect={handleCalendarMeetingSelect}
                    />
                    {selectedTask && (
                        <div className="meetings-tab-calendar-detail">
                            <MeetingMainContent
                                projectId={projectId}
                                selectedDate={selectedDate}
                                selectedMeeting={selectedMeeting}
                                selectedTask={selectedTask}
                            />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
