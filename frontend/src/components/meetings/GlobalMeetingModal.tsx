/**
 * Global meeting modal that can be displayed from anywhere in the app
 */

import { useCallback } from 'react';
import { useMeetingTimer } from '../../contexts/MeetingTimerContext';
import {
    useEndSession,
    useNextAgenda,
    usePrevAgenda,
    useUpdateSession,
    useResetSession,
} from '../../hooks/useMeetingSession';
import { MeetingInProgress } from './MeetingInProgress';

export function GlobalMeetingModal() {
    const {
        session,
        agendaItems,
        meetingTitle,
        meetingDate,
        taskId,
        isModalVisible,
        hideModal,
        updateSession,
        resetTimer,
        resumeTimer,
    } = useMeetingTimer();

    // Mutation hooks
    const endSessionMutation = useEndSession(taskId ?? undefined);
    const nextAgendaMutation = useNextAgenda(taskId ?? undefined);
    const prevAgendaMutation = usePrevAgenda(taskId ?? undefined);
    const updateSessionMutation = useUpdateSession(taskId ?? undefined);
    const resetSessionMutation = useResetSession(taskId ?? undefined);

    const handleNextAgenda = useCallback(async () => {
        if (!session) return;
        try {
            const updatedSession = await nextAgendaMutation.mutateAsync(session.id);
            updateSession(updatedSession);
        } catch (error) {
            console.error('Failed to go to next agenda:', error);
        }
    }, [session, nextAgendaMutation, updateSession]);

    const handlePrevAgenda = useCallback(async () => {
        if (!session) return;
        try {
            const updatedSession = await prevAgendaMutation.mutateAsync(session.id);
            updateSession(updatedSession);
        } catch (error) {
            console.error('Failed to go to previous agenda:', error);
        }
    }, [session, prevAgendaMutation, updateSession]);

    const handleEndMeeting = useCallback(async () => {
        if (!session) return;
        try {
            await endSessionMutation.mutateAsync(session.id);
            hideModal();
        } catch (error) {
            console.error('Failed to end meeting:', error);
        }
    }, [session, endSessionMutation, hideModal]);

    const handleUpdateTranscript = useCallback(async (transcript: string) => {
        if (!session) return;
        try {
            await updateSessionMutation.mutateAsync({
                sessionId: session.id,
                data: { transcript },
            });
        } catch (error) {
            console.error('Failed to update transcript:', error);
        }
    }, [session, updateSessionMutation]);

    const handleResetSession = useCallback(async () => {
        if (!session) return;
        try {
            await resetSessionMutation.mutateAsync(session.id);
            resetTimer();
            resumeTimer();
        } catch (error) {
            console.error('Failed to reset session:', error);
        }
    }, [session, resetSessionMutation, resetTimer, resumeTimer]);

    const handleCloseModal = useCallback(() => {
        hideModal();
    }, [hideModal]);

    // Don't render if no session or not visible
    if (!session || session.status !== 'IN_PROGRESS' || !isModalVisible) {
        return null;
    }

    return (
        <MeetingInProgress
            session={session}
            agendaItems={agendaItems}
            meetingTitle={meetingTitle}
            meetingDate={meetingDate}
            onNextAgenda={handleNextAgenda}
            onPrevAgenda={handlePrevAgenda}
            onEndMeeting={handleEndMeeting}
            onUpdateTranscript={handleUpdateTranscript}
            onReset={handleResetSession}
            onClose={handleCloseModal}
        />
    );
}
