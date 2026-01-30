/**
 * Meeting session types
 */

export type MeetingSessionStatus = 'PREPARATION' | 'IN_PROGRESS' | 'COMPLETED';

export interface MeetingSession {
  id: string;
  user_id: string;
  task_id: string;
  status: MeetingSessionStatus;
  current_agenda_index: number | null;
  transcript: string | null;
  summary: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MeetingSessionCreate {
  task_id: string;
}

export interface MeetingSessionUpdate {
  status?: MeetingSessionStatus;
  current_agenda_index?: number;
  transcript?: string;
  summary?: string;
  started_at?: string;
  ended_at?: string;
}

// Meeting Summary Types

export interface AgendaDiscussion {
  agenda_title: string;
  summary: string;
  key_points: string[];
}

export interface Decision {
  content: string;
  related_agenda?: string;
  rationale?: string;
}

export interface NextAction {
  title: string;
  description?: string;
  purpose?: string;
  assignee?: string;
  assignee_id?: string;
  due_date?: string;
  related_agenda?: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  estimated_minutes?: number;
  energy_level?: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface MeetingSummary {
  session_id: string;
  overall_summary: string;
  agenda_discussions: AgendaDiscussion[];
  decisions: Decision[];
  next_actions: NextAction[];
  action_items_count: number;
  converted_action_indices?: number[]; // Indices of actions that have been converted to tasks
}

export interface AnalyzeTranscriptRequest {
  transcript: string;
}

export interface CreateTasksFromActionsRequest {
  project_id?: string;
  actions: NextAction[];
}

export interface CreateTasksFromActionsResponse {
  created_count: number;
  tasks: {
    id: string;
    title: string;
    assignee?: string;
    due_date?: string;
  }[];
}
