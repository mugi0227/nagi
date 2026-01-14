import { api } from './client';
import type {
    ScheduleSnapshot,
    ScheduleSnapshotCreate,
    ScheduleSnapshotSummary,
    ScheduleDiff,
} from './types';

export const scheduleSnapshotsApi = {
    /**
     * Create a new schedule snapshot (baseline).
     * The new snapshot is automatically activated.
     */
    create: (projectId: string, data: ScheduleSnapshotCreate) =>
        api.post<ScheduleSnapshot>(`/projects/${projectId}/schedule-snapshots`, data),

    /**
     * List all snapshots for a project.
     */
    list: (projectId: string, query?: { limit?: number; offset?: number }) => {
        const params = new URLSearchParams();
        if (query?.limit) params.set('limit', String(query.limit));
        if (query?.offset) params.set('offset', String(query.offset));
        const suffix = params.toString();
        return api.get<ScheduleSnapshotSummary[]>(
            `/projects/${projectId}/schedule-snapshots${suffix ? `?${suffix}` : ''}`
        );
    },

    /**
     * Get the currently active snapshot for a project.
     */
    getActive: (projectId: string) =>
        api.get<ScheduleSnapshot | null>(`/projects/${projectId}/schedule-snapshots/active`),

    /**
     * Get a specific snapshot by ID.
     */
    get: (projectId: string, snapshotId: string) =>
        api.get<ScheduleSnapshot>(`/projects/${projectId}/schedule-snapshots/${snapshotId}`),

    /**
     * Activate a snapshot as the current baseline.
     */
    activate: (projectId: string, snapshotId: string) =>
        api.post<ScheduleSnapshot>(
            `/projects/${projectId}/schedule-snapshots/${snapshotId}/activate`,
            {}
        ),

    /**
     * Delete a snapshot.
     */
    delete: (projectId: string, snapshotId: string) =>
        api.delete<void>(`/projects/${projectId}/schedule-snapshots/${snapshotId}`),

    /**
     * Get the difference between a baseline snapshot and current schedule.
     * If snapshotId is not provided, uses the active snapshot.
     */
    getDiff: (projectId: string, snapshotId?: string) => {
        const params = snapshotId ? `?snapshot_id=${snapshotId}` : '';
        return api.get<ScheduleDiff>(`/projects/${projectId}/schedule-snapshots/diff${params}`);
    },
};
