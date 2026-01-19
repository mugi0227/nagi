import { api as client } from './client';
import type {
    MeetingSession,
    MeetingSessionCreate,
    MeetingSessionUpdate,
    MeetingSummary,
    AnalyzeTranscriptRequest,
    CreateTasksFromActionsRequest,
    CreateTasksFromActionsResponse,
} from '../types/session';

export const meetingSessionApi = {
    create: async (data: MeetingSessionCreate): Promise<MeetingSession> => {
        return client.post<MeetingSession>('/meeting-sessions', data);
    },

    get: async (sessionId: string): Promise<MeetingSession> => {
        return client.get<MeetingSession>(`/meeting-sessions/${sessionId}`);
    },

    update: async (sessionId: string, data: MeetingSessionUpdate): Promise<MeetingSession> => {
        return client.patch<MeetingSession>(`/meeting-sessions/${sessionId}`, data);
    },

    delete: async (sessionId: string): Promise<void> => {
        await client.delete(`/meeting-sessions/${sessionId}`);
    },

    getByTask: async (taskId: string): Promise<MeetingSession | null> => {
        return client.get<MeetingSession | null>(`/meeting-sessions/task/${taskId}`);
    },

    getLatestByTask: async (taskId: string): Promise<MeetingSession | null> => {
        return client.get<MeetingSession | null>(`/meeting-sessions/task/${taskId}/latest`);
    },

    start: async (sessionId: string): Promise<MeetingSession> => {
        return client.post<MeetingSession>(`/meeting-sessions/${sessionId}/start`, {});
    },

    end: async (sessionId: string): Promise<MeetingSession> => {
        return client.post<MeetingSession>(`/meeting-sessions/${sessionId}/end`, {});
    },

    nextAgenda: async (sessionId: string): Promise<MeetingSession> => {
        return client.post<MeetingSession>(`/meeting-sessions/${sessionId}/next-agenda`, {});
    },

    prevAgenda: async (sessionId: string): Promise<MeetingSession> => {
        return client.post<MeetingSession>(`/meeting-sessions/${sessionId}/prev-agenda`, {});
    },

    reset: async (sessionId: string): Promise<MeetingSession> => {
        return client.post<MeetingSession>(`/meeting-sessions/${sessionId}/reset`, {});
    },

    reopen: async (sessionId: string): Promise<MeetingSession> => {
        return client.post<MeetingSession>(`/meeting-sessions/${sessionId}/reopen`, {});
    },

    // Phase 4: Post-meeting summary
    analyzeTranscript: async (
        sessionId: string,
        data: AnalyzeTranscriptRequest
    ): Promise<MeetingSummary> => {
        return client.post<MeetingSummary>(
            `/meeting-sessions/${sessionId}/analyze-transcript`,
            data
        );
    },

    createTasksFromActions: async (
        sessionId: string,
        data: CreateTasksFromActionsRequest
    ): Promise<CreateTasksFromActionsResponse> => {
        return client.post<CreateTasksFromActionsResponse>(
            `/meeting-sessions/${sessionId}/create-tasks`,
            data
        );
    },
};
