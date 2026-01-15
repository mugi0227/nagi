import { api as client } from './client';
import type { MeetingAgendaItem, MeetingAgendaItemCreate, MeetingAgendaItemUpdate } from './types';

export const meetingAgendaApi = {
    listByMeeting: async (meetingId: string, eventDate?: string): Promise<MeetingAgendaItem[]> => {
        const params = new URLSearchParams();
        if (eventDate) {
            params.append('event_date', eventDate);
        }
        const response = await client.get<MeetingAgendaItem[]>(
            `/meeting-agendas/${meetingId}/items?${params.toString()}`
        );
        return response;
    },

    create: async (meetingId: string, data: MeetingAgendaItemCreate): Promise<MeetingAgendaItem> => {
        const response = await client.post<MeetingAgendaItem>(
            `/recurring-meetings/${meetingId}/agenda`,
            data
        );
        return response;
    },

    update: async (meetingId: string, itemId: string, data: MeetingAgendaItemUpdate): Promise<MeetingAgendaItem> => {
        const response = await client.put<MeetingAgendaItem>(
            `/recurring-meetings/${meetingId}/agenda/${itemId}`,
            data
        );
        return response;
    },

    delete: async (meetingId: string, itemId: string): Promise<void> => {
        await client.delete(`/recurring-meetings/${meetingId}/agenda/${itemId}`);
    },

    reorder: async (meetingId: string, orderedIds: string[]): Promise<MeetingAgendaItem[]> => {
        const response = await client.put<MeetingAgendaItem[]>(
            `/recurring-meetings/${meetingId}/agenda/reorder`,
            orderedIds
        );
        return response;
    },

    // Task-based endpoints (for standalone meetings without RecurringMeeting)

    listByTask: async (taskId: string): Promise<MeetingAgendaItem[]> => {
        const response = await client.get<MeetingAgendaItem[]>(
            `/meeting-agendas/tasks/${taskId}/items`
        );
        return response;
    },

    createForTask: async (taskId: string, data: MeetingAgendaItemCreate): Promise<MeetingAgendaItem> => {
        const response = await client.post<MeetingAgendaItem>(
            `/meeting-agendas/tasks/${taskId}/items`,
            data
        );
        return response;
    },
};
