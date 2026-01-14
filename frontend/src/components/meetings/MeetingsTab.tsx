import { useEffect, useState } from 'react';
import { api as client } from '../../api/client';
import { RecurringMeeting } from '../../api/types';
import { MeetingMainContent } from './MeetingMainContent';
import { MeetingSidebar } from './MeetingSidebar';
import './MeetingsTab.css';

interface MeetingsTabProps {
    projectId: string;
}

export function MeetingsTab({ projectId }: MeetingsTabProps) {
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    const [selectedMeeting, setSelectedMeeting] = useState<RecurringMeeting | null>(null);
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

    const handleSelectDate = (date: Date, meeting: RecurringMeeting) => {
        setSelectedDate(date);
        setSelectedMeeting(meeting);
    };

    return (
        <div className="meetings-tab-container">
            <MeetingSidebar
                projectId={projectId}
                recurringMeetings={recurringMeetings}
                selectedDate={selectedDate}
                onSelectDate={handleSelectDate}
                isLoading={isLoading}
            />
            <MeetingMainContent
                projectId={projectId}
                selectedDate={selectedDate}
                selectedMeeting={selectedMeeting}
            />
        </div>
    );
}
