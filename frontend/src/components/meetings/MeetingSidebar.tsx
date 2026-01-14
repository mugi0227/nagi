import { useEffect, useState } from 'react';
import { RecurringMeeting } from '../../api/types';

interface MeetingSidebarProps {
    projectId: string;
    recurringMeetings: RecurringMeeting[];
    selectedDate: Date | null;
    onSelectDate: (date: Date, meeting: RecurringMeeting) => void;
    isLoading: boolean;
}

export function MeetingSidebar({
    projectId: _projectId,
    recurringMeetings,
    selectedDate,
    onSelectDate,
    isLoading
}: MeetingSidebarProps) {
    // Mock logic for generating meeting dates based on recurring settings
    // In a real app, we might want an API to get "instances" or calculate them robustly
    const [meetingInstances, setMeetingInstances] = useState<{ date: Date; meeting: RecurringMeeting }[]>([]);

    useEffect(() => {
        if (!recurringMeetings.length) return;

        // Generate instances for the next 4 weeks and past 4 weeks
        const instances: { date: Date; meeting: RecurringMeeting }[] = [];
        const today = new Date();
        const start = new Date(today);
        start.setDate(today.getDate() - 28);
        const end = new Date(today);
        end.setDate(today.getDate() + 28);

        recurringMeetings.forEach(meeting => {
            // Simple weekly logic for now
            // Assuming meeting.weekday is 0-6 (Sun-Sat)
            // If not, we might need adjustment. usually 0=Mon in some systems, 0=Sun in JS.
            // Let's assume 0=Mon, 6=Sun or standard JS 0=Sun. 
            // Backend `weekday` field usually follows 0-6. Let's assume JS Day.

            let current = new Date(start);
            while (current <= end) {
                // Convert JS Day (0=Sun, 1=Mon) to Python Day (0=Mon, 6=Sun)
                const jsDay = current.getDay();
                const pythonDay = (jsDay + 6) % 7;

                if (pythonDay === meeting.weekday) {
                    instances.push({
                        date: new Date(current),
                        meeting: meeting
                    });
                }
                current.setDate(current.getDate() + 1);
            }
        });

        instances.sort((a, b) => b.date.getTime() - a.date.getTime());
        setMeetingInstances(instances);

        // Select today/closest if none selected?
        // User logic: "Select a meeting"
    }, [recurringMeetings]);

    const formatDate = (date: Date) => {
        return date.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short' });
    };

    if (isLoading) {
        return <div className="p-4 text-gray-500">Loading meetings...</div>;
    }
    // Group meeting instances by their recurring meeting ID
    const groupedMeetings = meetingInstances.reduce((acc, instance) => {
        if (!acc[instance.meeting.id]) {
            acc[instance.meeting.id] = {
                meeting: instance.meeting,
                dates: []
            };
        }
        acc[instance.meeting.id].dates.push(instance.date.toISOString());
        return acc;
    }, {} as Record<string, { meeting: RecurringMeeting; dates: string[] }>);


    if (recurringMeetings.length === 0) {
        return <div className="p-4 text-gray-500">定例ミーティングが設定されていません。</div>;
    }

    return (
        <div className="meetings-sidebar">
            <div className="meetings-sidebar-header">
                <h3 className="meetings-sidebar-title">ミーティング一覧</h3>
            </div>
            <div className="meetings-sidebar-content">
                {isLoading ? (
                    <div className="p-4 text-gray-500">読み込み中...</div>
                ) : (
                    <>
                        {Object.entries(groupedMeetings).map(([_, { meeting, dates }]) => (
                            <div key={meeting.id} className="meeting-nav-group">
                                <div className="meeting-nav-title">{meeting.title}</div>
                                {dates.map((dateStr) => {
                                    const date = new Date(dateStr);
                                    const isSelected = selectedDate?.toDateString() === date.toDateString();
                                    return (
                                        <div
                                            key={dateStr}
                                            className={`meeting-nav-item ${isSelected ? 'active' : ''}`}
                                            onClick={() => onSelectDate(date, meeting)}
                                        >
                                            {formatDate(date)}
                                        </div>
                                    );
                                })}
                            </div>
                        ))}
                    </>
                )}
            </div>
        </div>
    );
}

