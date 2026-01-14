/**
 * Meeting agenda types
 */

export interface MeetingAgendaItem {
  id: string;
  meeting_id: string;
  user_id: string;
  title: string;
  description?: string;
  duration_minutes?: number;
  order_index: number;
  is_completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface MeetingAgendaItemCreate {
  title: string;
  description?: string;
  duration_minutes?: number;
  order_index?: number;
}

export interface MeetingAgendaItemUpdate {
  title?: string;
  description?: string;
  duration_minutes?: number;
  order_index?: number;
  is_completed?: boolean;
}
