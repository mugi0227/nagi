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
 * Fetch agenda items for a standalone meeting task (by task_id)
 */
export function useTaskAgendaItems(taskId: string | undefined) {
  return useQuery({
    queryKey: ['task-agendas', taskId],
    queryFn: async () => {
      if (!taskId) return [];
      return api.get<MeetingAgendaItem[]>(`/meeting-agendas/tasks/${taskId}/items`);
    },
    enabled: !!taskId,
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
 * Create a new agenda item for a standalone meeting task
 */
export function useCreateTaskAgendaItem(taskId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: MeetingAgendaItemCreate) => {
      return api.post<MeetingAgendaItem>(
        `/meeting-agendas/tasks/${taskId}/items`,
        data
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task-agendas', taskId] });
    },
  });
}

/**
 * Update an agenda item
 */
export function useUpdateAgendaItem(meetingId?: string, eventDate?: string, taskId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: MeetingAgendaItemUpdate }) => {
      return api.patch<MeetingAgendaItem>(
        `/meeting-agendas/items/${id}`,
        data
      );
    },
    onSuccess: () => {
      // Invalidate both types of queries to ensure cache consistency
      if (meetingId) {
        queryClient.invalidateQueries({ queryKey: ['agenda-items', meetingId, eventDate] });
      }
      if (taskId) {
        queryClient.invalidateQueries({ queryKey: ['task-agendas', taskId] });
      }
    },
  });
}

/**
 * Delete an agenda item
 */
export function useDeleteAgendaItem(meetingId?: string, eventDate?: string, taskId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/meeting-agendas/items/${id}`);
    },
    onSuccess: () => {
      // Invalidate both types of queries to ensure cache consistency
      if (meetingId) {
        queryClient.invalidateQueries({ queryKey: ['agenda-items', meetingId, eventDate] });
      }
      if (taskId) {
        queryClient.invalidateQueries({ queryKey: ['task-agendas', taskId] });
      }
    },
  });
}

/**
 * Bulk delete agenda items
 */
export function useBulkDeleteAgendaItems(meetingId?: string, eventDate?: string, taskId?: string) {
  const queryClient = useQueryClient();
  const isStandalone = taskId && !meetingId;

  return useMutation({
    mutationFn: async (itemIds: string[]) => {
      const id = isStandalone ? taskId : meetingId;
      const endpoint = isStandalone
        ? `/meeting-agendas/tasks/${id}/items/bulk-delete`
        : `/meeting-agendas/${id}/items/bulk-delete`;
      return api.post<{ deleted_count: number; total_requested: number }>(
        endpoint,
        { item_ids: itemIds }
      );
    },
    onSuccess: () => {
      if (meetingId) {
        queryClient.invalidateQueries({ queryKey: ['agenda-items', meetingId, eventDate] });
      }
      if (taskId) {
        queryClient.invalidateQueries({ queryKey: ['task-agendas', taskId] });
      }
    },
  });
}

/**
 * Reorder agenda items
 */
export function useReorderAgendaItems(meetingId?: string, eventDate?: string, taskId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (orderedIds: string[]) => {
      // Use the appropriate endpoint based on what ID is provided
      const id = meetingId || taskId;
      return api.post<MeetingAgendaItem[]>(
        `/meeting-agendas/${id}/items/reorder`,
        orderedIds
      );
    },
    onSuccess: () => {
      // Invalidate both types of queries to ensure cache consistency
      if (meetingId) {
        queryClient.invalidateQueries({ queryKey: ['agenda-items', meetingId, eventDate] });
      }
      if (taskId) {
        queryClient.invalidateQueries({ queryKey: ['task-agendas', taskId] });
      }
    },
  });
}
