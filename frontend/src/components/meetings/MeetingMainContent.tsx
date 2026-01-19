import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { FaMagic, FaPlay, FaMapMarkerAlt, FaUsers, FaInfoCircle, FaExpand, FaUndo, FaChevronDown, FaChevronUp } from 'react-icons/fa';
import { meetingAgendaApi } from '../../api/meetingAgenda';
import { RecurringMeeting, Task } from '../../api/types';
import type { DraftCardData } from '../chat/DraftCard';
import {
    useLatestSessionByTask,
    useCreateSession,
    useStartSession,
    useResetSession,
    useReopenSession,
} from '../../hooks/useMeetingSession';
import { useMeetingTimer } from '../../contexts/MeetingTimerContext';
import type { MeetingSessionStatus } from '../../types/session';
import { MeetingCompleted } from './MeetingCompleted';
import './MeetingInProgress.css';

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
    const isAllDay = selectedTask?.is_all_day || false;
    const meetingStartTime = isAllDay
        ? '終日'
        : (selectedMeeting?.start_time || (selectedTask?.start_time ? new Date(selectedTask.start_time).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : ''));
    const meetingEndTime = isAllDay
        ? null
        : (selectedTask?.end_time ? new Date(selectedTask.end_time).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : null);

    // Collapsible state for meeting info section
    const [isInfoCollapsed, setIsInfoCollapsed] = useState(true);

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

    // Fetch meeting session
    const { data: session, refetch: refetchSession, isFetching: isSessionFetching } = useLatestSessionByTask(taskId);

    // Session mutations
    const createSessionMutation = useCreateSession();
    const startSessionMutation = useStartSession(taskId);
    const resetSessionMutation = useResetSession(taskId);
    const reopenSessionMutation = useReopenSession(taskId);

    // Global timer context
    const meetingTimer = useMeetingTimer();

    // Determine mode based on session status and date
    const mode = useMemo((): 'PREPARATION' | 'MEETING' | 'ARCHIVE' => {
        if (!hasMeeting || !selectedDate) {
            return 'PREPARATION';
        }

        // If there's an active session, use its status
        if (session) {
            const statusMap: Record<MeetingSessionStatus, 'PREPARATION' | 'MEETING' | 'ARCHIVE'> = {
                'PREPARATION': 'PREPARATION',
                'IN_PROGRESS': 'MEETING',
                'COMPLETED': 'ARCHIVE',
            };
            return statusMap[session.status] || 'PREPARATION';
        }

        // Otherwise, determine by date
        const today = new Date();
        const todayStr = getDateStr(today);
        const selectedDateStr = getDateStr(selectedDate);

        if (selectedDateStr < todayStr) {
            return 'ARCHIVE';
        }
        return 'PREPARATION';
    }, [hasMeeting, selectedDate, session]);

    // Auto-refetch session when task changes
    useEffect(() => {
        if (taskId) {
            refetchSession();
        }
    }, [taskId, refetchSession]);

    // Sync global timer with session state
    useEffect(() => {
        // Don't do anything while session is loading - keep current timer state
        if (isSessionFetching) {
            return;
        }

        if (session && session.status === 'IN_PROGRESS' && selectedDate && taskId) {
            const dateStr = selectedDate.toLocaleDateString('ja-JP', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                weekday: 'long'
            });
            // Start or update global timer
            if (!meetingTimer.session || meetingTimer.session.id !== session.id) {
                meetingTimer.startTimer(session, agendaItems, meetingTitle, dateStr, taskId, projectId);
            } else {
                meetingTimer.updateSession(session);
                // Also update agenda items if they've changed
                if (JSON.stringify(meetingTimer.agendaItems) !== JSON.stringify(agendaItems)) {
                    meetingTimer.updateAgendaItems(agendaItems);
                }
            }
        } else if (session?.status === 'COMPLETED') {
            // Only stop timer when meeting is explicitly COMPLETED
            if (meetingTimer.session) {
                meetingTimer.stopTimer();
            }
        }
        // Note: Don't stop timer when session is null/undefined - the timer context persists across pages
    }, [session, agendaItems, meetingTitle, selectedDate, taskId, projectId, isSessionFetching]);

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

    const handleStartMeeting = async () => {
        if (!taskId) return;

        try {
            // Create session if it doesn't exist
            if (!session) {
                const newSession = await createSessionMutation.mutateAsync({ task_id: taskId });
                // Start the session
                await startSessionMutation.mutateAsync(newSession.id);
            } else if (session.status === 'PREPARATION') {
                // Start existing session
                await startSessionMutation.mutateAsync(session.id);
            } else if (session.status === 'IN_PROGRESS') {
                // Session already in progress, just show modal
            }
            meetingTimer.showModal();
        } catch (error) {
            console.error('Failed to start meeting:', error);
        }
    };

    const handleResumeModal = () => {
        meetingTimer.showModal();
    };

    const handleResetSession = async () => {
        if (!session) return;
        try {
            await resetSessionMutation.mutateAsync(session.id);
        } catch (error) {
            console.error('Failed to reset session:', error);
        }
    };

    const handleReopenSession = async () => {
        if (!session) return;
        try {
            await reopenSessionMutation.mutateAsync(session.id);
            meetingTimer.showModal();
        } catch (error) {
            console.error('Failed to reopen session:', error);
        }
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

            {/* Meeting info section (location, attendees, description) - collapsible */}
            {(() => {
                const location = selectedTask?.location || selectedMeeting?.location;
                const attendees = selectedTask?.attendees?.length ? selectedTask.attendees : selectedMeeting?.attendees;
                const description = selectedTask?.description;
                const hasInfo = location || (attendees && attendees.length > 0) || description;

                if (!hasInfo) return null;

                return (
                    <div className={`meeting-info-section ${isInfoCollapsed ? 'collapsed' : ''}`}>
                        <button
                            className="meeting-info-toggle"
                            onClick={() => setIsInfoCollapsed(!isInfoCollapsed)}
                        >
                            <FaInfoCircle className="meeting-info-icon" />
                            <span>会議情報</span>
                            {isInfoCollapsed ? <FaChevronDown /> : <FaChevronUp />}
                        </button>
                        {!isInfoCollapsed && (
                            <div className="meeting-info-content">
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
                                        <span>{description}</span>
                                    </div>
                                )}
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
                                {agendaItems.length > 0 && (
                                    <button
                                        className="btn-start-meeting"
                                        onClick={handleStartMeeting}
                                        disabled={createSessionMutation.isPending || startSessionMutation.isPending}
                                    >
                                        <FaPlay /> 会議を開始
                                    </button>
                                )}
                            </div>
                        )}

                        {mode === 'ARCHIVE' && session && session.status === 'COMPLETED' && (
                            <div className="agenda-actions">
                                <button
                                    className="btn-reopen-meeting"
                                    onClick={handleReopenSession}
                                    disabled={reopenSessionMutation.isPending}
                                >
                                    <FaUndo /> 会議をやり直す
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
                                agendaItems.map((item, index) => {
                                    // Check if agenda is completed based on session progress
                                    const currentIndex = session?.current_agenda_index ?? 0;
                                    const isCompletedByProgress = !!(session && session.status !== 'PREPARATION' && index < currentIndex);
                                    const isChecked = !!(item.is_completed || isCompletedByProgress);

                                    return (
                                        <div key={item.id} className={`agenda-item ${isChecked ? 'completed' : ''}`}>
                                            <input
                                                type="checkbox"
                                                className="agenda-checkbox"
                                                checked={isChecked}
                                                onChange={() => { }}
                                                readOnly
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
                                    );
                                })
                            )}
                        </div>

                    </div>
                )}

                {/* Post-meeting summary section for ARCHIVE mode */}
                {mode === 'ARCHIVE' && session && session.status === 'COMPLETED' && (
                    <MeetingCompleted
                        session={session}
                        projectId={projectId}
                    />
                )}

                {/* Minimized meeting bar - show when meeting is in progress but modal is closed */}
                {mode === 'MEETING' && session && !meetingTimer.isModalVisible && (
                    <div className="meeting-minimized-bar">
                        <div className="meeting-minimized-info">
                            <span className="meeting-minimized-status">
                                <span className="pulse-dot"></span>
                                会議中
                            </span>
                            <span className="meeting-minimized-agenda">
                                議題 {(session.current_agenda_index ?? 0) + 1} / {agendaItems.length}:
                                {agendaItems[session.current_agenda_index ?? 0]?.title || '---'}
                            </span>
                        </div>
                        <div className="meeting-minimized-actions">
                            <button
                                className="btn-minimized reset"
                                onClick={handleResetSession}
                                disabled={resetSessionMutation.isPending}
                                title="リセット"
                            >
                                <FaUndo /> リセット
                            </button>
                            <button
                                className="btn-minimized resume"
                                onClick={handleResumeModal}
                                title="会議画面を開く"
                            >
                                <FaExpand /> 会議画面を開く
                            </button>
                        </div>
                    </div>
                )}
                {/* Modal is now rendered globally via GlobalMeetingModal */}
            </div>
        </div>
    );
}
