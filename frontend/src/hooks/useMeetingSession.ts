/**
 * Custom hooks for meeting session operations
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { meetingSessionApi } from '../api/meetingSession';
import type { MeetingSession, MeetingSessionCreate, MeetingSessionUpdate } from '../types/session';

/**
 * Get the active session for a task (non-COMPLETED)
 */
export function useSessionByTask(taskId: string | undefined) {
  return useQuery({
    queryKey: ['meeting-session', 'task', taskId],
    queryFn: async () => {
      if (!taskId) return null;
      return meetingSessionApi.getByTask(taskId);
    },
    enabled: !!taskId,
  });
}

/**
 * Get the most recent session for a task (any status)
 */
export function useLatestSessionByTask(taskId: string | undefined) {
  return useQuery({
    queryKey: ['meeting-session', 'task', taskId, 'latest'],
    queryFn: async () => {
      if (!taskId) return null;
      return meetingSessionApi.getLatestByTask(taskId);
    },
    enabled: !!taskId,
  });
}

/**
 * Get a session by ID
 */
export function useSession(sessionId: string | undefined) {
  return useQuery({
    queryKey: ['meeting-session', sessionId],
    queryFn: async () => {
      if (!sessionId) return null;
      return meetingSessionApi.get(sessionId);
    },
    enabled: !!sessionId,
  });
}

/**
 * Create a new session
 */
export function useCreateSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: MeetingSessionCreate) => {
      return meetingSessionApi.create(data);
    },
    onSuccess: (session: MeetingSession) => {
      queryClient.invalidateQueries({ queryKey: ['meeting-session', 'task', session.task_id] });
      queryClient.invalidateQueries({ queryKey: ['meeting-session', 'task', session.task_id, 'latest'] });
    },
  });
}

/**
 * Update a session
 */
export function useUpdateSession(taskId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sessionId, data }: { sessionId: string; data: MeetingSessionUpdate }) => {
      return meetingSessionApi.update(sessionId, data);
    },
    onSuccess: (session: MeetingSession) => {
      queryClient.invalidateQueries({ queryKey: ['meeting-session', session.id] });
      if (taskId) {
        queryClient.invalidateQueries({ queryKey: ['meeting-session', 'task', taskId] });
        queryClient.invalidateQueries({ queryKey: ['meeting-session', 'task', taskId, 'latest'] });
      }
    },
  });
}

/**
 * Start a session (change status to IN_PROGRESS)
 */
export function useStartSession(taskId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sessionId: string) => {
      return meetingSessionApi.start(sessionId);
    },
    onSuccess: (session: MeetingSession) => {
      queryClient.invalidateQueries({ queryKey: ['meeting-session', session.id] });
      if (taskId) {
        queryClient.invalidateQueries({ queryKey: ['meeting-session', 'task', taskId] });
        queryClient.invalidateQueries({ queryKey: ['meeting-session', 'task', taskId, 'latest'] });
      }
    },
  });
}

/**
 * End a session (change status to COMPLETED)
 */
export function useEndSession(taskId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sessionId: string) => {
      return meetingSessionApi.end(sessionId);
    },
    onSuccess: (session: MeetingSession) => {
      queryClient.invalidateQueries({ queryKey: ['meeting-session', session.id] });
      if (taskId) {
        queryClient.invalidateQueries({ queryKey: ['meeting-session', 'task', taskId] });
        queryClient.invalidateQueries({ queryKey: ['meeting-session', 'task', taskId, 'latest'] });
      }
    },
  });
}

/**
 * Move to next agenda item
 */
export function useNextAgenda(taskId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sessionId: string) => {
      return meetingSessionApi.nextAgenda(sessionId);
    },
    onSuccess: (session: MeetingSession) => {
      queryClient.invalidateQueries({ queryKey: ['meeting-session', session.id] });
      if (taskId) {
        queryClient.invalidateQueries({ queryKey: ['meeting-session', 'task', taskId] });
        queryClient.invalidateQueries({ queryKey: ['meeting-session', 'task', taskId, 'latest'] });
      }
    },
  });
}

/**
 * Move to previous agenda item
 */
export function usePrevAgenda(taskId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sessionId: string) => {
      return meetingSessionApi.prevAgenda(sessionId);
    },
    onSuccess: (session: MeetingSession) => {
      queryClient.invalidateQueries({ queryKey: ['meeting-session', session.id] });
      if (taskId) {
        queryClient.invalidateQueries({ queryKey: ['meeting-session', 'task', taskId] });
        queryClient.invalidateQueries({ queryKey: ['meeting-session', 'task', taskId, 'latest'] });
      }
    },
  });
}

/**
 * Reset a session (reset agenda index to 0)
 */
export function useResetSession(taskId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sessionId: string) => {
      return meetingSessionApi.reset(sessionId);
    },
    onSuccess: (session: MeetingSession) => {
      queryClient.invalidateQueries({ queryKey: ['meeting-session', session.id] });
      if (taskId) {
        queryClient.invalidateQueries({ queryKey: ['meeting-session', 'task', taskId] });
        queryClient.invalidateQueries({ queryKey: ['meeting-session', 'task', taskId, 'latest'] });
      }
    },
  });
}

/**
 * Reopen a completed session (change status back to IN_PROGRESS)
 */
export function useReopenSession(taskId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sessionId: string) => {
      return meetingSessionApi.reopen(sessionId);
    },
    onSuccess: (session: MeetingSession) => {
      queryClient.invalidateQueries({ queryKey: ['meeting-session', session.id] });
      if (taskId) {
        queryClient.invalidateQueries({ queryKey: ['meeting-session', 'task', taskId] });
        queryClient.invalidateQueries({ queryKey: ['meeting-session', 'task', taskId, 'latest'] });
      }
    },
  });
}

/**
 * Delete a session
 */
export function useDeleteSession(taskId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sessionId: string) => {
      await meetingSessionApi.delete(sessionId);
    },
    onSuccess: () => {
      if (taskId) {
        queryClient.invalidateQueries({ queryKey: ['meeting-session', 'task', taskId] });
        queryClient.invalidateQueries({ queryKey: ['meeting-session', 'task', taskId, 'latest'] });
      }
    },
  });
}
