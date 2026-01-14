/**
 * Custom hooks for meeting agenda operations
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import type { MeetingAgendaItem, MeetingAgendaItemCreate, MeetingAgendaItemUpdate } from '../types/agenda';

/**
 * Fetch agenda items for a meeting on a specific date
 */
export function useAgendaItems(meetingId: string | undefined, eventDate?: string) {
  return useQuery({
    queryKey: ['agenda-items', meetingId, eventDate],
    queryFn: async () => {
      if (!meetingId) return [];
      const params = new URLSearchParams();
      if (eventDate) {
        params.append('event_date', eventDate);
      }
      const queryString = params.toString();
      return api.get<MeetingAgendaItem[]>(
        `/meeting-agendas/${meetingId}/items${queryString ? `?${queryString}` : ''}`
      );
    },
    enabled: !!meetingId,
  });
}

/**
 * Create a new agenda item
 */
export function useCreateAgendaItem(meetingId: string, eventDate?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: MeetingAgendaItemCreate) => {
      // Include event_date in the data
      const payload = eventDate ? { ...data, event_date: eventDate } : data;
      return api.post<MeetingAgendaItem>(
        `/meeting-agendas/${meetingId}/items`,
        payload
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agenda-items', meetingId, eventDate] });
    },
  });
}

/**
 * Update an agenda item
 */
export function useUpdateAgendaItem(meetingId: string, eventDate?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: MeetingAgendaItemUpdate }) => {
      return api.patch<MeetingAgendaItem>(
        `/meeting-agendas/items/${id}`,
        data
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agenda-items', meetingId, eventDate] });
    },
  });
}

/**
 * Delete an agenda item
 */
export function useDeleteAgendaItem(meetingId: string, eventDate?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/meeting-agendas/items/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agenda-items', meetingId, eventDate] });
    },
  });
}

/**
 * Reorder agenda items
 */
export function useReorderAgendaItems(meetingId: string, eventDate?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (orderedIds: string[]) => {
      return api.post<MeetingAgendaItem[]>(
        `/meeting-agendas/${meetingId}/items/reorder`,
        orderedIds
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agenda-items', meetingId, eventDate] });
    },
  });
}
