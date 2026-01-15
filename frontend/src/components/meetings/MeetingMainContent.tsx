import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { FaMagic, FaPlay, FaMapMarkerAlt, FaUsers, FaInfoCircle } from 'react-icons/fa';
import { meetingAgendaApi } from '../../api/meetingAgenda';
import { RecurringMeeting, Task } from '../../api/types';
import type { DraftCardData } from '../chat/DraftCard';

interface MeetingMainContentProps {
    projectId: string;
    selectedDate: Date | null;
    selectedMeeting: RecurringMeeting | null;
    selectedTask?: Task | null;
}

export function MeetingMainContent({
    projectId,
    selectedDate,
    selectedMeeting,
    selectedTask
}: MeetingMainContentProps) {
    // Either recurring meeting or standalone task (meeting)
    const hasMeeting = !!(selectedMeeting || selectedTask);
    const meetingTitle = selectedMeeting?.title || selectedTask?.title || '';
    const meetingStartTime = selectedMeeting?.start_time || (selectedTask?.start_time ? new Date(selectedTask.start_time).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : '');
    const meetingEndTime = selectedTask?.end_time ? new Date(selectedTask.end_time).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : null;

    const getDateStr = (date: Date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const dateStr = selectedDate ? getDateStr(selectedDate) : '';

    // For recurring meetings: query by recurring_meeting_id (meeting_id column)
    const recurringMeetingId = selectedTask?.recurring_meeting_id;
    const { data: meetingAgendaItems = [] } = useQuery({
        queryKey: ['agenda-items', recurringMeetingId, dateStr],
        queryFn: () => meetingAgendaApi.listByMeeting(recurringMeetingId!, dateStr),
        enabled: !!recurringMeetingId && !!selectedDate,
    });

    // For standalone meetings: query by task_id
    const taskId = selectedTask?.id;
    const isStandalone = selectedTask && !selectedTask.recurring_meeting_id;
    const { data: taskAgendaItems = [] } = useQuery({
        queryKey: ['task-agendas', taskId],
        queryFn: () => meetingAgendaApi.listByTask(taskId!),
        enabled: !!isStandalone && !!taskId,
    });

    // Use meeting-based agenda for recurring, task-based for standalone
    const agendaItems = recurringMeetingId ? meetingAgendaItems : taskAgendaItems;

    const [mode, setMode] = useState<'PREPARATION' | 'MEETING' | 'ARCHIVE'>('PREPARATION');

    useEffect(() => {
        if (!hasMeeting || !selectedDate) {
            return;
        }

        const dateStr = getDateStr(selectedDate);
        const today = new Date();
        const todayStr = getDateStr(today);

        if (dateStr < todayStr) {
            setMode('ARCHIVE');
        } else if (dateStr === todayStr) {
            setMode('PREPARATION');
        } else {
            setMode('PREPARATION');
        }
    }, [hasMeeting, selectedDate]);

    const handleGenerateDraft = async () => {
        if (!hasMeeting || !selectedDate) return;

        const formattedDate = selectedDate.toLocaleDateString('ja-JP', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            weekday: 'long'
        });

        const title = selectedTask?.title || selectedMeeting?.title || '';

        // For recurring meetings, use meeting_id (recurring_meeting_id)
        // For standalone meetings, use task_id
        const meetingIdForAgent = selectedTask?.recurring_meeting_id;
        const taskIdForAgent = selectedTask?.id;

        // Build the ID reference for the prompt
        const idRef = meetingIdForAgent
            ? `meeting_id: ${meetingIdForAgent}`
            : `task_id: ${taskIdForAgent}`;

        const draftCard: DraftCardData = {
            type: 'agenda',
            title: 'アジェンダ作成',
            info: [
                { label: 'ミーティング', value: title },
                { label: '開催日', value: formattedDate },
            ],
            placeholder: '例: 前回の積み残し議題を優先して',
            promptTemplate: `ミーティング「${title}」(${idRef}) のアジェンダを作成して。
プロジェクトID: ${projectId}
開催日: ${formattedDate}

追加の指示があれば以下に記入:
{instruction}`,
        };

        const event = new CustomEvent('secretary:chat-open', { detail: { draftCard } });
        window.dispatchEvent(event);
    };

    if (!selectedDate || !hasMeeting) {
        return (
            <div className="meetings-main justify-center items-center">
                <div className="empty-state">
                    <p>左側のリストからミーティングを選択してください。</p>
                </div>
            </div>
        );
    }

    return (
        <div className="meetings-main">
            <div className="meetings-main-header">
                <div className="meeting-header-info">
                    <h2>{selectedDate.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}</h2>
                    <div className="meeting-header-meta">
                        <span>{meetingTitle}</span>
                        {meetingStartTime && (
                            <span>
                                {meetingStartTime}
                                {meetingEndTime ? `~${meetingEndTime}` : '~'}
                            </span>
                        )}
                    </div>
                </div>
                <div className={`meeting-status-badge ${mode === 'MEETING' ? 'status-meeting' : mode === 'ARCHIVE' ? 'status-archive' : 'status-preparation'}`}>
                    {mode === 'MEETING' ? 'ミーティング中' : mode === 'ARCHIVE' ? '終了' : '準備中'}
                </div>
            </div>

            {/* Meeting info section (location, attendees, description) - only show if there's content */}
            {(() => {
                const location = selectedTask?.location || selectedMeeting?.location;
                const attendees = selectedTask?.attendees?.length ? selectedTask.attendees : selectedMeeting?.attendees;
                const description = selectedTask?.description;
                const hasInfo = location || (attendees && attendees.length > 0) || description;

                if (!hasInfo) return null;

                return (
                    <div className="meeting-info-section">
                        {location && (
                            <div className="meeting-info-item">
                                <FaMapMarkerAlt className="meeting-info-icon" />
                                <span>{location}</span>
                            </div>
                        )}
                        {attendees && attendees.length > 0 && (
                            <div className="meeting-info-item">
                                <FaUsers className="meeting-info-icon" />
                                <span>{attendees.join(', ')}</span>
                            </div>
                        )}
                        {description && (
                            <div className="meeting-info-item meeting-info-description">
                                <FaInfoCircle className="meeting-info-icon" />
                                <span>{description}</span>
                            </div>
                        )}
                    </div>
                );
            })()}

            <div className="meetings-main-scroll">
                {(mode === 'PREPARATION' || mode === 'ARCHIVE') && (
                    <div className="agenda-section">
                        {mode === 'PREPARATION' && (
                            <div className="agenda-actions">
                                <button className="btn-ai-generate" onClick={handleGenerateDraft}>
                                    <FaMagic /> AIでドラフト作成
                                </button>
                            </div>
                        )}

                        <div className="agenda-list">
                            {agendaItems.length === 0 ? (
                                <div className="empty-state">
                                    <p>
                                        {mode === 'ARCHIVE'
                                            ? 'このミーティングにはアジェンダが登録されていませんでした。'
                                            : 'アジェンダがまだありません。「AIでドラフト作成」を試すか、手動で追加してください。'}
                                    </p>
                                </div>
                            ) : (
                                agendaItems.map((item) => (
                                    <div key={item.id} className="agenda-item">
                                        <input
                                            type="checkbox"
                                            className="agenda-checkbox"
                                            checked={item.is_completed}
                                            onChange={() => { }}
                                        />
                                        <div className="agenda-content">
                                            <div className="agenda-title">
                                                {item.title}
                                                {item.duration_minutes && (
                                                    <span className="ml-2 text-sm text-gray-500 font-normal">
                                                        ({item.duration_minutes} min)
                                                    </span>
                                                )}
                                            </div>
                                            {item.description && <div className="agenda-desc">{item.description}</div>}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}

                {mode === 'MEETING' && (
                    <div>
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
                            <div className="font-bold text-yellow-800 flex items-center gap-2">
                                <FaPlay className="text-sm" /> 進行中
                            </div>
                            <div className="text-sm text-yellow-700 mt-1">
                                現在のアジェンダアイテムを表示・タイマー機能などをここに実装予定
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
