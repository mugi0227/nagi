/**
 * TypeScript types - Mirror backend Pydantic models
 */

// Enums
export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'WAITING' | 'DONE';
export type Priority = 'HIGH' | 'MEDIUM' | 'LOW';
export type EnergyLevel = 'HIGH' | 'MEDIUM' | 'LOW';
export type CreatedBy = 'USER' | 'AGENT';
export type ChatMode = 'dump' | 'consult' | 'breakdown';
export type ProjectStatus = 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';
export type PhaseStatus = 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';
export type ProjectRole = 'OWNER' | 'ADMIN' | 'MEMBER';
export type BlockerStatus = 'OPEN' | 'RESOLVED';
export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';
export type KpiDirection = 'up' | 'down' | 'neutral';
export type KpiStrategy = 'template' | 'ai' | 'custom';
export type MemoryScope = 'USER' | 'PROJECT' | 'WORK';
export type MemoryType = 'FACT' | 'PREFERENCE' | 'PATTERN' | 'RULE';

export interface ProjectKpiMetric {
  key: string;
  label: string;
  description?: string;
  unit?: string;
  target?: number;
  current?: number;
  direction?: KpiDirection;
  source?: string;
}

export interface ProjectKpiConfig {
  strategy?: KpiStrategy;
  template_id?: string;
  metrics: ProjectKpiMetric[];
}

export interface ProjectKpiTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  metrics: ProjectKpiMetric[];
}

// Task models
export interface Task {
  id: string;
  user_id: string;
  title: string;
  description?: string;
  project_id?: string;
  phase_id?: string;
  status: TaskStatus;
  importance: Priority;
  urgency: Priority;
  energy_level: EnergyLevel;
  estimated_minutes?: number;
  due_date?: string;
  parent_id?: string;
  order_in_parent?: number;
  dependency_ids: string[];
  source_capture_id?: string;
  created_by: CreatedBy;
  created_at: string;
  updated_at: string;

  // Progress tracking (0-100)
  progress?: number;

  // Meeting/Fixed-time event fields
  start_time?: string;
  end_time?: string;
  is_fixed_time: boolean;
  location?: string;
  attendees: string[];
  meeting_notes?: string;
}

export interface TaskCreate {
  title: string;
  description?: string;
  project_id?: string;
  importance?: Priority;
  urgency?: Priority;
  energy_level?: EnergyLevel;
  estimated_minutes?: number;
  due_date?: string;
  parent_id?: string;
  order_in_parent?: number;
  dependency_ids?: string[];
  source_capture_id?: string;
  // Meeting/Fixed-time event fields
  start_time?: string;
  end_time?: string;
  is_fixed_time?: boolean;
  location?: string;
  attendees?: string[];
  meeting_notes?: string;
}

export interface TaskUpdate {
  title?: string;
  description?: string;
  project_id?: string;
  status?: TaskStatus;
  importance?: Priority;
  urgency?: Priority;
  energy_level?: EnergyLevel;
  estimated_minutes?: number;
  due_date?: string;
  parent_id?: string;
  order_in_parent?: number;
  dependency_ids?: string[];
  progress?: number;
  // Meeting fields
  start_time?: string;
  end_time?: string;
  is_fixed_time?: boolean;
  location?: string;
  attendees?: string[];
  meeting_notes?: string;
}

export interface TaskWithSubtasks extends Task {
  subtasks: Task[];
}

export interface BreakdownStep {
  step_number: number;
  title: string;
  description?: string;
  estimated_minutes: number;
  energy_level: EnergyLevel;
  guide: string;
  dependency_step_numbers: number[];
}

export interface TaskBreakdown {
  original_task_id: string;
  original_task_title: string;
  steps: BreakdownStep[];
  total_estimated_minutes: number;
  work_memory_used: string[];
}

export interface BreakdownRequest {
  create_subtasks?: boolean;
}

export interface BreakdownResponse {
  breakdown: TaskBreakdown;
  subtasks_created: boolean;
  subtask_ids: string[];
  markdown_guide: string;
}

// Chat models
export interface ChatRequest {
  text?: string;
  audio_url?: string;
  image_url?: string;
  image_base64?: string;
  mode?: ChatMode;
  session_id?: string;
  context?: Record<string, unknown>;
  proposal_mode?: boolean; // AI提案モード（true: 提案→承諾、false: 直接作成）
}

export interface SuggestedAction {
  action_type: string;
  label: string;
  payload: Record<string, unknown>;
}

export interface ChatResponse {
  assistant_message: string;
  related_tasks: string[];
  suggested_actions: SuggestedAction[];
  session_id: string;
  capture_id?: string;
}

export interface ChatSession {
  session_id: string;
  title?: string;
  updated_at?: string;
}

export interface ChatHistoryMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at?: string;
}

// Memory models
export interface Memory {
  id: string;
  user_id: string;
  content: string;
  scope: MemoryScope;
  memory_type: MemoryType;
  project_id?: string;
  tags: string[];
  source: string;
  created_at: string;
  updated_at: string;
}

export interface MemoryCreate {
  content: string;
  scope: MemoryScope;
  memory_type: MemoryType;
  project_id?: string;
  tags?: string[];
}

export interface MemoryUpdate {
  content?: string;
  memory_type?: MemoryType;
  tags?: string[];
}

export interface MemorySearchResult {
  memory: Memory;
  relevance_score: number;
}

// Project models
export interface Project {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  context_summary?: string;
  context?: string;  // 詳細コンテキスト（README）
  priority: number;  // 1-10
  goals: string[];
  key_points: string[];
  kpi_config?: ProjectKpiConfig;
  status: ProjectStatus;
  created_at: string;
  updated_at: string;
}

export interface ProjectWithTaskCount extends Project {
  total_tasks: number;
  completed_tasks: number;
  in_progress_tasks: number;
}

// Phase models
export interface Phase {
  id: string;
  user_id: string;
  project_id: string;
  name: string;
  description?: string;
  status: PhaseStatus;
  order_in_project: number;
  start_date?: string;
  end_date?: string;
  created_at: string;
  updated_at: string;
}

export interface PhaseWithTaskCount extends Phase {
  total_tasks: number;
  completed_tasks: number;
  in_progress_tasks: number;
}

export interface PhaseCreate {
  project_id: string;
  name: string;
  description?: string;
  order_in_project?: number;
  start_date?: string;
  end_date?: string;
}

export interface PhaseUpdate {
  name?: string;
  description?: string;
  status?: PhaseStatus;
  order_in_project?: number;
  start_date?: string;
  end_date?: string;
}

export interface ProjectCreate {
  name: string;
  description?: string;
  context_summary?: string;
  context?: string;
  priority?: number;
  goals?: string[];
  key_points?: string[];
  kpi_config?: ProjectKpiConfig;
}

export interface ProjectUpdate {
  name?: string;
  description?: string;
  status?: ProjectStatus;
  context_summary?: string;
  context?: string;
  priority?: number;
  goals?: string[];
  key_points?: string[];
  kpi_config?: ProjectKpiConfig;
}

export interface ProjectMember {
  id: string;
  user_id: string;
  project_id: string;
  member_user_id: string;
  member_display_name?: string;
  role: ProjectRole;
  capacity_hours?: number;
  timezone?: string;
  created_at: string;
  updated_at: string;
}

export interface ProjectMemberCreate {
  member_user_id: string;
  role?: ProjectRole;
  capacity_hours?: number;
  timezone?: string;
}

export interface ProjectMemberUpdate {
  role?: ProjectRole;
  capacity_hours?: number;
  timezone?: string;
}

export interface TaskAssignment {
  id: string;
  user_id: string;
  task_id: string;
  assignee_id: string;
  status?: TaskStatus;
  progress?: number;
  created_at: string;
  updated_at: string;
}

export interface TaskAssignmentCreate {
  assignee_id: string;
  status?: TaskStatus;
  progress?: number;
}

export interface TaskAssignmentUpdate {
  assignee_id?: string;
  status?: TaskStatus;
  progress?: number;
}

export interface TaskAssignmentsCreate {
  assignee_ids: string[];
}

export interface TaskAssignmentProposal {
  task_id: string;
  assignee_ids: string[];
}

export interface Checkin {
  id: string;
  user_id: string;
  project_id: string;
  member_user_id: string;
  checkin_date: string;
  summary_text?: string;
  raw_text: string;
  created_at: string;
}

export interface CheckinCreate {
  member_user_id: string;
  checkin_date: string;
  raw_text: string;
}

export interface Blocker {
  id: string;
  user_id: string;
  task_id: string;
  created_by: string;
  status: BlockerStatus;
  reason: string;
  resolved_by?: string;
  created_at: string;
  resolved_at?: string;
}

export interface BlockerCreate {
  created_by: string;
  reason: string;
}

export interface BlockerUpdate {
  status?: BlockerStatus;
  resolved_by?: string;
}

export interface ProjectInvitation {
  id: string;
  user_id: string;
  project_id: string;
  email: string;
  role: ProjectRole;
  status: InvitationStatus;
  invited_by: string;
  accepted_by?: string;
  token?: string;
  created_at: string;
  updated_at: string;
  expires_at?: string;
  accepted_at?: string;
}

export interface ProjectInvitationCreate {
  email: string;
  role?: ProjectRole;
}

export interface ProjectInvitationUpdate {
  status: InvitationStatus;
}

// Top 3 response models
export interface CapacityInfo {
  feasible: boolean;
  total_minutes: number;
  capacity_minutes: number;
  overflow_minutes: number;
  capacity_usage_percent: number;
}

export interface Top3Response {
  tasks: Task[];
  capacity_info: CapacityInfo | null;
  overflow_suggestion: string;
}

export interface TodayTaskAllocation {
  task_id: string;
  allocated_minutes: number;
  total_minutes: number;
  ratio: number;
}

export interface TodayTasksResponse {
  today: string;
  today_tasks: Task[];
  today_allocations: TodayTaskAllocation[];
  top3_ids: string[];
  total_estimated_minutes: number;
  capacity_minutes: number;
  overflow_minutes: number;
  overflow: boolean;
}

export interface TaskAllocation {
  task_id: string;
  minutes: number;
}

export interface ScheduleDay {
  date: string;
  capacity_minutes: number;
  allocated_minutes: number;
  overflow_minutes: number;
  task_allocations: TaskAllocation[];
  meeting_minutes: number;
  available_minutes: number;
}

export interface TaskScheduleInfo {
  task_id: string;
  title: string;
  project_id?: string;
  parent_id?: string;
  parent_title?: string;
  order_in_parent?: number;
  due_date?: string;
  planned_start?: string;
  planned_end?: string;
  total_minutes: number;
  priority_score: number;
}

export interface ExcludedTask {
  task_id: string;
  title: string;
  reason: string;
  parent_id?: string;
  parent_title?: string;
}

export interface ScheduleResponse {
  start_date: string;
  days: ScheduleDay[];
  tasks: TaskScheduleInfo[];
  unscheduled_task_ids: { task_id: string; reason: string }[];
  excluded_tasks: ExcludedTask[];
}

// Capture models
export type ContentType = 'TEXT' | 'AUDIO' | 'IMAGE';

export interface Capture {
  id: string;
  user_id: string;
  content_type: ContentType;
  content_url?: string;
  raw_text?: string;
  transcription?: string;
  image_analysis?: string;
  processed: boolean;
  created_at: string;
}

export interface CaptureCreate {
  content_type: ContentType;
  content_url?: string;
  raw_text?: string;
  transcription?: string;
  image_analysis?: string;
  base64_image?: string;
}

// Proposal models (AI提案承諾機能)
export type ProposalType = 'create_task' | 'create_project' | 'create_skill' | 'assign_task';
export type ProposalStatus = 'pending' | 'approved' | 'rejected' | 'expired';

export interface Proposal {
  id: string;
  user_id: string;
  session_id: string;
  proposal_type: ProposalType;
  status: ProposalStatus;
  payload: TaskCreate | ProjectCreate | MemoryCreate | TaskAssignmentProposal; // The data for proposals
  description: string; // AI-generated explanation
  created_at: string;
  expires_at: string;
}

export interface ProposalResponse {
  proposal_id: string;
  proposal_type: ProposalType;
  description: string;
  payload: TaskCreate | ProjectCreate | MemoryCreate | TaskAssignmentProposal;
}
