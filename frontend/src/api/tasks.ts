import { api } from './client';
import type {
  Task,
  TaskCreate,
  TaskUpdate,
  TodayTasksResponse,
  ScheduleResponse,
  TaskAssignment,
  TaskAssignmentCreate,
  TaskAssignmentsCreate,
  TaskAssignmentUpdate,
  Blocker,
  BlockerCreate,
  BlockerUpdate,
  PostponeRequest,
  DoTodayRequest,
  CompletionCheckResponse,
  TimeBlockMoveRequest,
  ScheduleTimeBlock,
} from './types';

export const tasksApi = {
  getAll: (query?: {
    includeDone?: boolean;
    limit?: number;
    offset?: number;
    projectId?: string;
    status?: string;
    onlyMeetings?: boolean;
    excludeMeetings?: boolean;
  }) => {
    const params = new URLSearchParams();
    const includeDone = query?.includeDone ?? true;
    params.set('include_done', String(includeDone));
    params.set('limit', String(query?.limit ?? 1000));
    if (query?.offset !== undefined) {
      params.set('offset', String(query.offset));
    }
    if (query?.projectId) {
      params.set('project_id', query.projectId);
    }
    if (query?.status) {
      params.set('status', query.status);
    }
    if (query?.onlyMeetings) {
      params.set('only_meetings', 'true');
    }
    if (query?.excludeMeetings) {
      params.set('exclude_meetings', 'true');
    }
    return api.get<Task[]>(`/tasks?${params.toString()}`);
  },

  getById: (id: string) => api.get<Task>(`/tasks/${id}`),

  getSubtasks: (id: string) => api.get<Task[]>(`/tasks/${id}/subtasks`),

  create: (data: TaskCreate) => api.post<Task>('/tasks', data),

  update: (id: string, data: TaskUpdate) =>
    api.patch<Task>(`/tasks/${id}`, data),

  delete: (id: string) => api.delete<void>(`/tasks/${id}`),

  getToday: (query?: {
    capacityHours?: number;
    bufferHours?: number;
    capacityByWeekday?: number[];
    filterByAssignee?: boolean;
  }) => {
    const params = new URLSearchParams();
    if (query?.capacityHours !== undefined) {
      params.set('capacity_hours', String(query.capacityHours));
    }
    if (query?.bufferHours !== undefined) {
      params.set('buffer_hours', String(query.bufferHours));
    }
    if (query?.capacityByWeekday && query.capacityByWeekday.length === 7) {
      params.set('capacity_by_weekday', JSON.stringify(query.capacityByWeekday));
    }
    if (query?.filterByAssignee !== undefined) {
      params.set('filter_by_assignee', String(query.filterByAssignee));
    }
    const suffix = params.toString();
    return api.get<TodayTasksResponse>(`/tasks/today${suffix ? `?${suffix}` : ''}`);
  },

  getSchedule: (query?: {
    startDate?: string;
    capacityHours?: number;
    bufferHours?: number;
    maxDays?: number;
    capacityByWeekday?: number[];
    filterByAssignee?: boolean;
  }) => {
    const params = new URLSearchParams();
    if (query?.startDate) {
      params.set('start_date', query.startDate);
    }
    if (query?.capacityHours !== undefined) {
      params.set('capacity_hours', String(query.capacityHours));
    }
    if (query?.bufferHours !== undefined) {
      params.set('buffer_hours', String(query.bufferHours));
    }
    if (query?.capacityByWeekday && query.capacityByWeekday.length === 7) {
      params.set('capacity_by_weekday', JSON.stringify(query.capacityByWeekday));
    }
    if (query?.maxDays !== undefined) {
      params.set('max_days', String(query.maxDays));
    }
    if (query?.filterByAssignee !== undefined) {
      params.set('filter_by_assignee', String(query.filterByAssignee));
    }
    const suffix = params.toString();
    return api.get<ScheduleResponse>(`/tasks/schedule${suffix ? `?${suffix}` : ''}`);
  },

  recalculateSchedulePlan: (query?: {
    startDate?: string;
    maxDays?: number;
    fromNow?: boolean;
    filterByAssignee?: boolean;
    applyPlanConstraints?: boolean;
  }) => {
    const params = new URLSearchParams();
    if (query?.startDate) {
      params.set('start_date', query.startDate);
    }
    if (query?.maxDays !== undefined) {
      params.set('max_days', String(query.maxDays));
    }
    if (query?.fromNow) {
      params.set('from_now', 'true');
    }
    if (query?.filterByAssignee !== undefined) {
      params.set('filter_by_assignee', String(query.filterByAssignee));
    }
    if (query?.applyPlanConstraints === false) {
      params.set('apply_plan_constraints', 'false');
    }
    const suffix = params.toString();
    return api.post<ScheduleResponse>(`/tasks/schedule/plan${suffix ? `?${suffix}` : ''}`, {});
  },

  getAssignment: (id: string) => api.get<TaskAssignment>(`/tasks/${id}/assignment`),

  listAssignments: (id: string) => api.get<TaskAssignment[]>(`/tasks/${id}/assignments`),

  assignTask: (id: string, data: TaskAssignmentCreate) =>
    api.post<TaskAssignment>(`/tasks/${id}/assignment`, data),

  assignTaskMultiple: (id: string, data: TaskAssignmentsCreate) =>
    api.put<TaskAssignment[]>(`/tasks/${id}/assignments`, data),

  updateAssignment: (assignmentId: string, data: TaskAssignmentUpdate) =>
    api.patch<TaskAssignment>(`/tasks/assignments/${assignmentId}`, data),

  unassignTask: (id: string) => api.delete<void>(`/tasks/${id}/assignment`),

  listBlockers: (id: string) => api.get<Blocker[]>(`/tasks/${id}/blockers`),

  createBlocker: (id: string, data: BlockerCreate) =>
    api.post<Blocker>(`/tasks/${id}/blockers`, data),

  updateBlocker: (blockerId: string, data: BlockerUpdate) =>
    api.patch<Blocker>(`/tasks/blockers/${blockerId}`, data),

  createActionItems: (id: string) =>
    api.post<Task[]>(`/tasks/${id}/action-items`, {}),

  postpone: (id: string, data: PostponeRequest) =>
    api.post<Task>(`/tasks/${id}/postpone`, data),

  doToday: (id: string, data?: DoTodayRequest) =>
    api.post<Task>(`/tasks/${id}/do-today`, data ?? {}),

  checkCompletion: (id: string) =>
    api.post<CompletionCheckResponse>(`/tasks/${id}/check-completion`, {}),

  moveTimeBlock: (data: TimeBlockMoveRequest) =>
    api.patch<ScheduleTimeBlock>('/tasks/schedule/plan/time-block', data),
};
