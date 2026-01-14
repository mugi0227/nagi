import type { ReactElement } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { FaChartBar, FaColumns, FaStream, FaThLarge, FaUsers } from 'react-icons/fa';
import { useNavigate, useParams } from 'react-router-dom';
import { memoriesApi } from '../api/memories';
import { milestonesApi } from '../api/milestones';
import { phasesApi } from '../api/phases';
import { getProject, projectsApi } from '../api/projects';
import { scheduleSnapshotsApi } from '../api/scheduleSnapshots';
import { tasksApi } from '../api/tasks';
import type {
  Blocker,
  Checkin,
  CheckinSummary,
  Memory,
  Milestone,
  PhaseWithTaskCount,
  ProjectInvitation,
  ProjectKpiMetric,
  ProjectMember,
  ProjectWithTaskCount,
  ScheduleDiff,
  ScheduleSnapshot,
  Task,
  TaskAssignment,
  TaskStatus,
  TaskUpdate,
} from '../api/types';
import { ScheduleOverviewCard } from '../components/dashboard/ScheduleOverviewCard';
import { ProjectGanttChart } from '../components/gantt/ProjectGanttChart';
import { MeetingsTab } from '../components/meetings/MeetingsTab';
import { ProjectTasksView } from '../components/projects/ProjectTasksView';
import { TaskDetailModal } from '../components/tasks/TaskDetailModal';
import { TaskFormModal } from '../components/tasks/TaskFormModal';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { useTasks } from '../hooks/useTasks';
import './ProjectDetailV2Page.css';

import { FaCalendarAlt } from 'react-icons/fa';

type TabId = 'dashboard' | 'team' | 'timeline' | 'board' | 'gantt' | 'meetings';
type InviteMode = 'email' | 'user_id';

const TAB_LABELS: Record<TabId, string> = {
  dashboard: 'ダッシュボード',
  team: 'チーム',
  timeline: 'タイムライン',
  board: 'ボード',
  gantt: 'ガント',
  meetings: 'ミーティング',
};

const TAB_ICONS: Record<TabId, ReactElement> = {
  dashboard: <FaThLarge />,
  team: <FaUsers />,
  timeline: <FaStream />,
  board: <FaColumns />,
  gantt: <FaChartBar />,
  meetings: <FaCalendarAlt />,
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  TODO: '未着手',
  IN_PROGRESS: '進行中',
  WAITING: '待機中',
  DONE: '完了',
};

const PRIORITY_RANK: Record<string, number> = {
  HIGH: 0,
  MEDIUM: 1,
  LOW: 2,
};

const formatDateInput = (value: Date) => {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, '0');
  const day = `${value.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatCheckinDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' });
};

const formatMemoryDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric' });
};

const formatShortDate = (value?: string) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' });
};

const formatHours = (minutes: number) => {
  const hours = Math.round((minutes / 60) * 10) / 10;
  return `${hours}h`;
};

const getTagValue = (tags: string[] | undefined, prefix: string) => {
  if (!tags) return null;
  const tag = tags.find((item) => item.startsWith(prefix));
  return tag ? tag.slice(prefix.length) : null;
};

const formatTaskList = (items: Task[]) =>
  items.slice(0, 5).map(task => `- ${task.title}`).join('\n');

const computeKpiProgress = (metric: ProjectKpiMetric) => {
  const current = metric.current ?? 0;
  const target = metric.target ?? 0;

  if (metric.key === 'remaining_hours') {
    if (target > 0) {
      const ratio = 1 - current / target;
      return Math.max(0, Math.min(ratio * 100, 100));
    }
    return current <= 0 ? 100 : 0;
  }

  if (metric.direction === 'down') {
    if (target <= 0) {
      return current <= 0 ? 100 : 0;
    }
    if (current <= 0) {
      return 100;
    }
    return Math.min((target / current) * 100, 100);
  }

  if (target <= 0) {
    return 0;
  }

  return Math.min((current / target) * 100, 100);
};

const getInitial = (value?: string) => {
  if (!value) return '?';
  const trimmed = value.trim();
  return trimmed ? trimmed.charAt(0) : '?';
};

export function ProjectDetailV2Page() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [project, setProject] = useState<ProjectWithTaskCount | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [invitations, setInvitations] = useState<ProjectInvitation[]>([]);
  const [blockers, setBlockers] = useState<Blocker[]>([]);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [isCollabLoading, setIsCollabLoading] = useState(false);
  const [inviteMode, setInviteMode] = useState<InviteMode>('email');
  const [inviteValue, setInviteValue] = useState('');
  const [isInviting, setIsInviting] = useState(false);
  const [memberActionId, setMemberActionId] = useState<string | null>(null);
  const [invitationActionId, setInvitationActionId] = useState<string | null>(null);
  const [checkinMode, setCheckinMode] = useState<'weekly' | 'issue' | null>(null);
  const [checkinText, setCheckinText] = useState('');
  const [selectedCheckinMemberId, setSelectedCheckinMemberId] = useState('');
  const [isCheckinSaving, setIsCheckinSaving] = useState(false);
  const [checkinError, setCheckinError] = useState<string | null>(null);
  const [checkinSummaryStart, setCheckinSummaryStart] = useState(() => {
    const start = new Date();
    start.setDate(start.getDate() - 7);
    return formatDateInput(start);
  });
  const [checkinSummaryEnd, setCheckinSummaryEnd] = useState(() => formatDateInput(new Date()));
  const [checkinSummary, setCheckinSummary] = useState<CheckinSummary | null>(null);
  const [isCheckinSummaryLoading, setIsCheckinSummaryLoading] = useState(false);
  const [checkinSummaryError, setCheckinSummaryError] = useState<string | null>(null);
  const [isCheckinSummarySaving, setIsCheckinSummarySaving] = useState(false);
  const [checkinSummarySaveStatus, setCheckinSummarySaveStatus] = useState<string | null>(null);
  const [savedCheckinSummaries, setSavedCheckinSummaries] = useState<Memory[]>([]);
  const [isSavedCheckinSummariesLoading, setIsSavedCheckinSummariesLoading] = useState(false);
  const [savedCheckinSummariesError, setSavedCheckinSummariesError] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [openedParentTask, setOpenedParentTask] = useState<Task | null>(null);
  const [taskToEdit, setTaskToEdit] = useState<Task | null>(null);
  const [assignments, setAssignments] = useState<TaskAssignment[]>([]);
  const [phases, setPhases] = useState<PhaseWithTaskCount[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [isPhasesLoading, setIsPhasesLoading] = useState(false);
  const [isMilestonesLoading, setIsMilestonesLoading] = useState(false);
  const [phasePlanInstruction, setPhasePlanInstruction] = useState('');
  const [isPlanningPhases, setIsPlanningPhases] = useState(false);
  const [capacityDrafts, setCapacityDrafts] = useState<Record<string, string>>({});
  const [capacityActionId, setCapacityActionId] = useState<string | null>(null);
  const [activeBaseline, setActiveBaseline] = useState<ScheduleSnapshot | null>(null);
  const [baselineDiff, setBaselineDiff] = useState<ScheduleDiff | null>(null);
  const [isBaselineLoading, setIsBaselineLoading] = useState(false);
  const [isCreatingBaseline, setIsCreatingBaseline] = useState(false);

  const {
    tasks,
    isLoading: tasksLoading,
    refetch: refetchTasks,
    updateTask,
    deleteTask,
  } = useTasks(projectId);
  const { data: currentUser } = useCurrentUser();

  useEffect(() => {
    let isActive = true;
    if (!projectId) {
      setError('プロジェクトIDが不正です。');
      setIsLoading(false);
      return () => {
        isActive = false;
      };
    }

    const loadProject = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const data = await getProject(projectId);
        if (!isActive) return;
        setProject(data ?? null);
      } catch (err) {
        if (!isActive) return;
        console.error('Failed to fetch project:', err);
        setError('プロジェクトの取得に失敗しました。');
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    };

    loadProject();

    return () => {
      isActive = false;
    };
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;

    const fetchCollaboration = async () => {
      setIsCollabLoading(true);
      try {
        const [membersData, invitationsData, blockersData, checkinsData, assignmentsData] = await Promise.all([
          projectsApi.listMembers(projectId),
          projectsApi.listInvitations(projectId),
          projectsApi.listBlockers(projectId),
          projectsApi.listCheckins(projectId),
          projectsApi.listAssignments(projectId),
        ]);
        setMembers(Array.isArray(membersData) ? membersData : []);
        setInvitations(Array.isArray(invitationsData) ? invitationsData : []);
        setBlockers(Array.isArray(blockersData) ? blockersData : []);
        setCheckins(Array.isArray(checkinsData) ? checkinsData : []);
        setAssignments(Array.isArray(assignmentsData) ? assignmentsData : []);
      } catch (err) {
        console.error('Failed to fetch collaboration data:', err);
      } finally {
        setIsCollabLoading(false);
      }
    };

    fetchCollaboration();
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    const fetchSavedSummaries = async () => {
      setIsSavedCheckinSummariesLoading(true);
      setSavedCheckinSummariesError(null);
      try {
        const data = await memoriesApi.list({
          scope: 'PROJECT',
          project_id: projectId,
          limit: 200,
        });
        const summaries = data.filter((memory) => memory.tags?.includes('checkin_summary'));
        summaries.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
        setSavedCheckinSummaries(summaries);
      } catch (err) {
        console.error('Failed to load saved checkin summaries:', err);
        setSavedCheckinSummariesError('保存したサマリーの取得に失敗しました。');
      } finally {
        setIsSavedCheckinSummariesLoading(false);
      }
    };
    fetchSavedSummaries();
  }, [projectId]);

  const refreshPhases = async () => {
    if (!projectId) return;
    setIsPhasesLoading(true);
    try {
      const data = await phasesApi.listByProject(projectId);
      setPhases(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch phases:', err);
    } finally {
      setIsPhasesLoading(false);
    }
  };

  const refreshMilestones = async () => {
    if (!projectId) return;
    setIsMilestonesLoading(true);
    try {
      const data = await milestonesApi.listByProject(projectId);
      setMilestones(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch milestones:', err);
    } finally {
      setIsMilestonesLoading(false);
    }
  };

  useEffect(() => {
    if (!projectId) return;
    refreshPhases();
    refreshMilestones();
  }, [projectId]);

  // Fetch active baseline and diff
  useEffect(() => {
    if (!projectId) return;
    const fetchBaseline = async () => {
      setIsBaselineLoading(true);
      try {
        const baseline = await scheduleSnapshotsApi.getActive(projectId);
        setActiveBaseline(baseline);
        if (baseline) {
          const diff = await scheduleSnapshotsApi.getDiff(projectId);
          setBaselineDiff(diff);
        } else {
          setBaselineDiff(null);
        }
      } catch (err) {
        console.error('Failed to fetch baseline:', err);
      } finally {
        setIsBaselineLoading(false);
      }
    };
    fetchBaseline();
  }, [projectId]);

  useEffect(() => {
    if (!members.length) return;
    if (selectedCheckinMemberId) return;

    // Default to current user if they are a member
    if (currentUser) {
      const me = members.find(m => m.member_user_id === currentUser.id);
      if (me) {
        setSelectedCheckinMemberId(me.member_user_id);
        return;
      }
    }

    // Fallback to owner or first member
    const owner = members.find(member => member.role === 'OWNER');
    setSelectedCheckinMemberId(owner?.member_user_id || members[0].member_user_id);
  }, [members, selectedCheckinMemberId, currentUser]);

  useEffect(() => {
    if (members.length === 0) {
      setCapacityDrafts({});
      return;
    }
    const next: Record<string, string> = {};
    members.forEach((member) => {
      next[member.id] = member.capacity_hours != null ? String(member.capacity_hours) : '';
    });
    setCapacityDrafts(next);
  }, [members]);

  const completionRate = project && project.total_tasks > 0
    ? Math.round((project.completed_tasks / project.total_tasks) * 100)
    : 0;

  const inProgressCount = useMemo(
    () => tasks.filter(task => task.status === 'IN_PROGRESS').length,
    [tasks]
  );

  const waitingCount = useMemo(
    () => tasks.filter(task => task.status === 'WAITING').length,
    [tasks]
  );

  const openBlockerCount = useMemo(() =>
    blockers.filter(blocker => blocker.status === 'OPEN').length
    , [blockers]);

  const blockedDependencyCount = useMemo(() => {
    if (tasks.length === 0) return 0;
    const taskMap = new Map(tasks.map(task => [task.id, task]));
    return tasks.filter((task) => {
      if (task.status === 'DONE') {
        return false;
      }
      return task.dependency_ids?.some((depId) => {
        const dep = taskMap.get(depId);
        return dep && dep.status !== 'DONE';
      });
    }).length;
  }, [tasks]);

  const overdueTasks = useMemo(() => {
    const today = new Date();
    const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return tasks.filter(task => {
      if (!task.due_date || task.status === 'DONE') return false;
      const due = new Date(task.due_date);
      return due < todayDate;
    });
  }, [tasks]);

  const memberLabelById = useMemo(() => {
    const map: Record<string, string> = {};
    members.forEach((member) => {
      map[member.member_user_id] = member.member_display_name || member.member_user_id;
    });
    return map;
  }, [members]);

  const pendingInvitations = useMemo(() =>
    invitations.filter((inv) => inv.status === 'PENDING')
    , [invitations]);

  const taskTitleById = useMemo(() => {
    const map = new Map<string, string>();
    tasks.forEach((task) => {
      if (task.id) {
        map.set(task.id, task.title);
      }
    });
    return map;
  }, [tasks]);

  const invitationLabelById = useMemo(() => {
    const map: Record<string, string> = {};
    pendingInvitations.forEach((invitation) => {
      map[`inv:${invitation.id}`] = `${invitation.email} (招待中)`;
    });
    return map;
  }, [pendingInvitations]);

  const assigneeByTaskId = useMemo(() => {
    const assigneeMap: Record<string, string> = {};

    assignments.forEach((assignment) => {
      if (!assignment.assignee_id) return;

      let label: string;
      if (assignment.assignee_id.startsWith('inv:')) {
        label = invitationLabelById[assignment.assignee_id] || assignment.assignee_id;
      } else {
        label = memberLabelById[assignment.assignee_id] || assignment.assignee_id;
      }

      if (assigneeMap[assignment.task_id]) {
        assigneeMap[assignment.task_id] += `, ${label}`;
      } else {
        assigneeMap[assignment.task_id] = label;
      }
    });

    return assigneeMap;
  }, [assignments, invitationLabelById, memberLabelById]);

  const assignedMemberIdsByTaskId = useMemo(() => {
    const map: Record<string, string[]> = {};
    assignments.forEach((assignment) => {
      if (!assignment.assignee_id) return;
      if (!map[assignment.task_id]) {
        map[assignment.task_id] = [];
      }
      map[assignment.task_id].push(assignment.assignee_id);
    });
    return map;
  }, [assignments]);

  const memberOptions = useMemo(() => ([
    ...members.map((member) => ({
      id: member.member_user_id,
      label: member.member_display_name || member.member_user_id,
    })),
    ...pendingInvitations.map((invitation) => ({
      id: `inv:${invitation.id}`,
      label: `${invitation.email} (招待中)`,
    })),
  ]), [members, pendingInvitations]);

  const sortedPhases = useMemo(
    () => [...phases].sort((a, b) => a.order_in_project - b.order_in_project),
    [phases]
  );

  const currentPhase = useMemo(() => {
    if (sortedPhases.length === 0) return null;
    const today = new Date();
    const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const byDate = sortedPhases.find((phase) => {
      if (!phase.start_date || !phase.end_date) return false;
      const start = new Date(phase.start_date);
      const end = new Date(phase.end_date);
      return start <= todayDate && todayDate <= end;
    });
    return byDate ?? sortedPhases.find(phase => phase.status === 'ACTIVE') ?? sortedPhases[0];
  }, [sortedPhases]);

  const milestonesByPhaseId = useMemo(() => {
    const map: Record<string, Milestone[]> = {};
    milestones.forEach((milestone) => {
      if (!map[milestone.phase_id]) {
        map[milestone.phase_id] = [];
      }
      map[milestone.phase_id].push(milestone);
    });
    Object.keys(map).forEach((phaseId) => {
      map[phaseId] = map[phaseId].sort((a, b) => a.order_in_phase - b.order_in_phase);
    });
    return map;
  }, [milestones]);

  const tasksByPhaseId = useMemo(() => {
    const map: Record<string, Task[]> = {};
    tasks.forEach((task) => {
      const phaseId = task.phase_id ?? 'unassigned';
      if (!map[phaseId]) {
        map[phaseId] = [];
      }
      map[phaseId].push(task);
    });
    return map;
  }, [tasks]);

  const phaseRows = useMemo(() => {
    const rows = sortedPhases.map((phase) => ({
      id: phase.id,
      name: phase.name,
      status: phase.status,
      start_date: phase.start_date,
      end_date: phase.end_date,
      tasks: tasksByPhaseId[phase.id] ?? [],
      taskCounts: {
        total: phase.total_tasks,
        done: phase.completed_tasks,
        inProgress: phase.in_progress_tasks,
      },
    }));
    if (tasksByPhaseId.unassigned && tasksByPhaseId.unassigned.length > 0) {
      rows.push({
        id: 'unassigned',
        name: '未割当',
        status: 'ACTIVE',
        start_date: undefined,
        end_date: undefined,
        tasks: tasksByPhaseId.unassigned,
        taskCounts: {
          total: tasksByPhaseId.unassigned.length,
          done: tasksByPhaseId.unassigned.filter(task => task.status === 'DONE').length,
          inProgress: tasksByPhaseId.unassigned.filter(task => task.status === 'IN_PROGRESS').length,
        },
      });
    }
    return rows;
  }, [sortedPhases, tasksByPhaseId]);

  const assignmentIdsByTaskId = useMemo(() => {
    const map = new Map<string, string[]>();
    assignments.forEach((assignment) => {
      if (!assignment.assignee_id) return;
      if (!map.has(assignment.task_id)) {
        map.set(assignment.task_id, []);
      }
      map.get(assignment.task_id)!.push(assignment.assignee_id);
    });
    return map;
  }, [assignments]);

  const workloadByPhaseId = useMemo(() => {
    const matrix: Record<string, Record<string, number>> = {};
    phaseRows.forEach((phase) => {
      const row: Record<string, number> = {};
      phase.tasks.forEach((task) => {
        const minutes = task.estimated_minutes ?? 0;
        if (minutes <= 0) return;
        const assignees = assignmentIdsByTaskId.get(task.id) ?? [];
        assignees.forEach((assigneeId) => {
          row[assigneeId] = (row[assigneeId] ?? 0) + minutes;
        });
      });
      matrix[phase.id] = row;
    });
    return matrix;
  }, [assignmentIdsByTaskId, phaseRows]);

  const memberStatsById = useMemo(() => {
    const stats: Record<string, { total: number; done: number; inProgress: number; minutes: number }> = {};
    const taskMap = new Map(tasks.map(task => [task.id, task]));
    assignments.forEach((assignment) => {
      const task = taskMap.get(assignment.task_id);
      if (!task) return;
      const key = assignment.assignee_id;
      if (!stats[key]) {
        stats[key] = { total: 0, done: 0, inProgress: 0, minutes: 0 };
      }
      stats[key].total += 1;
      if (task.status === 'DONE') stats[key].done += 1;
      if (task.status === 'IN_PROGRESS') stats[key].inProgress += 1;
      stats[key].minutes += task.estimated_minutes ?? 0;
    });
    return stats;
  }, [assignments, tasks]);

  const kpiMetrics = useMemo(
    () => project?.kpi_config?.metrics ?? [],
    [project]
  );

  const priorityTasks = useMemo(() => {
    const openTasks = tasks.filter(task => task.status !== 'DONE');
    return [...openTasks].sort((a, b) => {
      const aDue = a.due_date ? new Date(a.due_date).getTime() : Number.POSITIVE_INFINITY;
      const bDue = b.due_date ? new Date(b.due_date).getTime() : Number.POSITIVE_INFINITY;
      if (aDue !== bDue) return aDue - bDue;
      const urgencyGap = (PRIORITY_RANK[a.urgency] ?? 99) - (PRIORITY_RANK[b.urgency] ?? 99);
      if (urgencyGap !== 0) return urgencyGap;
      const importanceGap = (PRIORITY_RANK[a.importance] ?? 99) - (PRIORITY_RANK[b.importance] ?? 99);
      if (importanceGap !== 0) return importanceGap;
      return a.title.localeCompare(b.title);
    }).slice(0, 5);
  }, [tasks]);

  const activityFeed = useMemo(() => {
    const items: { id: string; type: string; title: string; detail?: string; timestamp: string }[] = [];
    tasks.forEach((task) => {
      items.push({
        id: `task-${task.id}`,
        type: task.status === 'DONE' ? 'タスク完了' : 'タスク更新',
        title: task.title,
        detail: STATUS_LABELS[task.status],
        timestamp: task.updated_at,
      });
    });
    checkins.forEach((checkin) => {
      items.push({
        id: `checkin-${checkin.id}`,
        type: 'チェックイン',
        title: memberLabelById[checkin.member_user_id] || checkin.member_user_id,
        detail: checkin.raw_text,
        timestamp: checkin.created_at,
      });
    });
    blockers.forEach((blocker) => {
      items.push({
        id: `blocker-${blocker.id}`,
        type: 'ブロッカー',
        title: taskTitleById.get(blocker.task_id) || 'タスク',
        detail: blocker.reason,
        timestamp: blocker.created_at,
      });
    });
    return items
      .filter(item => item.timestamp)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 10);
  }, [blockers, checkins, memberLabelById, taskTitleById, tasks]);

  const getWeeklyMetrics = () => {
    const total = tasks.length;
    const done = tasks.filter(task => task.status === 'DONE').length;
    const inProgress = tasks.filter(task => task.status === 'IN_PROGRESS').length;
    const waiting = tasks.filter(task => task.status === 'WAITING').length;
    const todo = tasks.filter(task => task.status === 'TODO').length;

    const today = new Date();
    const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const weekAhead = new Date(todayDate);
    weekAhead.setDate(todayDate.getDate() + 7);

    const dueTasks = tasks.filter(task => task.due_date);
    const overdueTasks = dueTasks.filter(task => {
      if (task.status === 'DONE') return false;
      const due = new Date(task.due_date as string);
      return due < todayDate;
    });
    const dueSoonTasks = dueTasks.filter(task => {
      if (task.status === 'DONE') return false;
      const due = new Date(task.due_date as string);
      return due >= todayDate && due <= weekAhead;
    });

    return {
      total,
      done,
      inProgress,
      waiting,
      todo,
      todayDate,
      overdueTasks,
      dueSoonTasks,
    };
  };

  const buildWeeklySummary = () => {
    const metrics = getWeeklyMetrics();
    const lines = [
      `週次サマリー (${metrics.todayDate.toLocaleDateString('ja-JP')})`,
      '',
      `- タスク総数: ${metrics.total}`,
      `- 完了 ${metrics.done} / 進行中 ${metrics.inProgress} / 待機 ${metrics.waiting} / 未着手 ${metrics.todo}`,
      `- 期限超過: ${metrics.overdueTasks.length}`,
      `- 7日以内期限: ${metrics.dueSoonTasks.length}`,
      `- 依存ブロック: ${blockedDependencyCount}`,
      `- オープンブロッカー: ${openBlockerCount}`,
    ];

    if (metrics.overdueTasks.length > 0) {
      lines.push('', '期限超過タスク（最大5件）:', formatTaskList(metrics.overdueTasks));
    }
    if (metrics.dueSoonTasks.length > 0) {
      lines.push('', '7日以内期限タスク（最大5件）:', formatTaskList(metrics.dueSoonTasks));
    }

    lines.push(
      '',
      '今週の重要事項:',
      '- ',
      '',
      '課題・リスク:',
      '- ',
      '',
      '支援してほしいこと:',
      '- ',
    );

    return lines.join('\n');
  };

  const buildWeeklyContext = () => {
    const metrics = getWeeklyMetrics();
    if (metrics.total === 0) {
      return '';
    }

    const lines = [
      `週次ステータス (${metrics.todayDate.toLocaleDateString('ja-JP')})`,
      `- タスク総数: ${metrics.total}`,
      `- 完了 ${metrics.done} / 進行中 ${metrics.inProgress} / 待機 ${metrics.waiting} / 未着手 ${metrics.todo}`,
      `- 期限超過: ${metrics.overdueTasks.length}`,
      `- 7日以内期限: ${metrics.dueSoonTasks.length}`,
      `- 依存ブロック: ${blockedDependencyCount}`,
      `- オープンブロッカー: ${openBlockerCount}`,
    ];

    if (metrics.overdueTasks.length > 0) {
      lines.push('', '期限超過タスク（最大5件）:', formatTaskList(metrics.overdueTasks));
    }
    if (metrics.dueSoonTasks.length > 0) {
      lines.push('', '7日以内期限タスク（最大5件）:', formatTaskList(metrics.dueSoonTasks));
    }

    return lines.join('\n').trim();
  };

  const handleTaskClick = (task: Task) => {
    if (task.parent_id) {
      const parent = tasks.find(item => item.id === task.parent_id);
      if (parent) {
        setOpenedParentTask(parent);
        setSelectedTask(task);
      } else {
        setSelectedTask(task);
        setOpenedParentTask(null);
      }
    } else {
      setSelectedTask(task);
      setOpenedParentTask(null);
    }
  };

  const handleTaskCheck = async (taskId: string) => {
    const localTask = tasks.find(item => item.id === taskId);
    if (localTask?.status === 'DONE') {
      updateTask(taskId, { status: 'TODO' });
      refetchTasks();
      return;
    }

    const task = localTask ?? await tasksApi.getById(taskId).catch(() => null);
    if (!task) return;

    if (task.dependency_ids && task.dependency_ids.length > 0) {
      const missingDeps = task.dependency_ids.filter(depId => !tasks.find(item => item.id === depId));
      const fetchedDeps = missingDeps.length
        ? await Promise.all(missingDeps.map(depId => tasksApi.getById(depId).catch(() => null)))
        : [];
      const allDeps = [
        ...task.dependency_ids
          .map(depId => tasks.find(item => item.id === depId))
          .filter(Boolean),
        ...fetchedDeps.filter(Boolean),
      ] as Task[];
      const hasMissingDependencies = fetchedDeps.some(depTask => !depTask);
      const hasPendingDependencies = hasMissingDependencies
        || allDeps.some(depTask => depTask.status !== 'DONE');
      if (hasPendingDependencies) {
        alert('依存タスクが完了していないため完了できません。');
        return;
      }
    }

    updateTask(taskId, { status: 'DONE' });
    refetchTasks();
  };

  const handleScheduleTaskClick = async (taskId: string) => {
    const task = tasks.find(item => item.id === taskId);
    if (task) {
      handleTaskClick(task);
      return;
    }
    const fetched = await tasksApi.getById(taskId).catch(() => null);
    if (fetched) {
      handleTaskClick(fetched);
    }
  };

  const getPhaseRangeLabel = (phase: {
    start_date?: string;
    end_date?: string;
  }) => {
    if (!phase.start_date || !phase.end_date) {
      return '期間未設定';
    }
    return `${formatShortDate(phase.start_date)} - ${formatShortDate(phase.end_date)}`;
  };

  const getPhaseRemainingDays = (phase: { start_date?: string; end_date?: string }) => {
    if (!phase.start_date || !phase.end_date) return null;
    const startDate = new Date(phase.start_date);
    const endDate = new Date(phase.end_date);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return null;
    const today = new Date();
    const start = startDate > today ? startDate : today;
    if (endDate < start) return 0;
    const diff = endDate.getTime() - start.getTime();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)) + 1);
  };

  const getPhaseCapacityMinutes = (phase: { start_date?: string; end_date?: string }, member: ProjectMember) => {
    const capacityHours = member.capacity_hours;
    if (capacityHours == null) return null;
    const remainingDays = getPhaseRemainingDays(phase);
    if (remainingDays == null) return null;
    const weeks = remainingDays / 7;
    return Math.max(0, Math.round(capacityHours * 60 * weeks));
  };

  const handleStartWeeklyCheckin = () => {
    setCheckinError(null);
    setCheckinMode('weekly');
    setCheckinText(buildWeeklySummary());
  };

  const handleStartIssueCheckin = () => {
    setCheckinError(null);
    setCheckinMode('issue');
    setCheckinText('');
  };

  const handleSubmitCheckin = async () => {
    if (!projectId) return;
    if (!selectedCheckinMemberId) {
      setCheckinError('メンバーを選択してください。');
      return;
    }
    if (!checkinText.trim()) {
      setCheckinError('内容を入力してください。');
      return;
    }
    setIsCheckinSaving(true);
    setCheckinError(null);
    try {
      const checkinType = checkinMode === 'issue'
        ? 'issue'
        : checkinMode === 'weekly'
          ? 'weekly'
          : 'general';
      await projectsApi.createCheckin(projectId, {
        member_user_id: selectedCheckinMemberId,
        checkin_date: new Date().toISOString().slice(0, 10),
        checkin_type: checkinType,
        raw_text: checkinText.trim(),
      });
      const checkinsData = await projectsApi.listCheckins(projectId);
      setCheckins(checkinsData);
      setCheckinMode(null);
      setCheckinText('');
    } catch (err) {
      console.error('Failed to create checkin:', err);
      setCheckinError('チェックインの保存に失敗しました。');
    } finally {
      setIsCheckinSaving(false);
    }
  };

  const handleSummarizeCheckins = async () => {
    if (!projectId) return;
    if (checkinSummaryStart && checkinSummaryEnd && checkinSummaryStart > checkinSummaryEnd) {
      setCheckinSummaryError('Start date must be before end date.');
      return;
    }
    setIsCheckinSummaryLoading(true);
    setCheckinSummaryError(null);
    try {
      const summary = await projectsApi.summarizeCheckins(projectId, {
        startDate: checkinSummaryStart || undefined,
        endDate: checkinSummaryEnd || undefined,
        weeklyContext: buildWeeklyContext() || undefined,
      });
      setCheckinSummary(summary);
      setCheckinSummarySaveStatus(null);
    } catch (err) {
      console.error('Failed to summarize checkins:', err);
      setCheckinSummaryError('チェックインの要約に失敗しました。');
    } finally {
      setIsCheckinSummaryLoading(false);
    }
  };

  const handleSaveCheckinSummary = async () => {
    if (!projectId || !checkinSummary?.summary_text) return;
    setIsCheckinSummarySaving(true);
    setCheckinSummarySaveStatus(null);
    try {
      const saved = await projectsApi.saveCheckinSummary(projectId, {
        summary_text: checkinSummary.summary_text,
        start_date: checkinSummary.start_date || checkinSummaryStart || undefined,
        end_date: checkinSummary.end_date || checkinSummaryEnd || undefined,
        checkin_count: checkinSummary.checkin_count || 0,
      });
      setSavedCheckinSummaries((prev) => {
        const next = [saved, ...prev.filter((item) => item.id !== saved.id)];
        return next;
      });
      setCheckinSummarySaveStatus('保存しました');
    } catch (err) {
      console.error('Failed to save checkin summary:', err);
      setCheckinSummarySaveStatus('保存に失敗しました');
    } finally {
      setIsCheckinSummarySaving(false);
    }
  };

  const handleGeneratePhases = async () => {
    if (!projectId) return;
    setIsPlanningPhases(true);
    try {
      await projectsApi.breakdownPhases(projectId, {
        create_phases: true,
        create_milestones: true,
        instruction: phasePlanInstruction.trim() || undefined,
      });
      await refreshPhases();
      await refreshMilestones();
      setPhasePlanInstruction('');
    } catch (err) {
      console.error('Failed to generate phases:', err);
      alert('フェーズの生成に失敗しました。');
    } finally {
      setIsPlanningPhases(false);
    }
  };

  const handleCapacityDraftChange = (memberId: string, value: string) => {
    setCapacityDrafts((prev) => ({ ...prev, [memberId]: value }));
  };

  const handleCapacitySave = async (member: ProjectMember) => {
    if (!projectId) return;
    const raw = capacityDrafts[member.id];
    const trimmed = raw?.trim() ?? '';
    const parsed = trimmed === '' ? null : Number(trimmed);
    if (trimmed !== '' && !Number.isFinite(parsed)) {
      alert('数値を入力してください。');
      return;
    }
    if (trimmed === '' && member.capacity_hours == null) {
      return;
    }
    if (trimmed !== '' && parsed === member.capacity_hours) {
      return;
    }
    setCapacityActionId(member.id);
    try {
      await projectsApi.updateMember(projectId, member.id, {
        capacity_hours: parsed ?? undefined,
      });
      const membersData = await projectsApi.listMembers(projectId);
      setMembers(membersData);
    } catch (err) {
      console.error('Failed to update capacity:', err);
      alert('基本工数の更新に失敗しました。');
    } finally {
      setCapacityActionId(null);
    }
  };

  const handleInvite = async () => {
    if (!projectId) return;
    const value = inviteValue.trim();
    if (!value) return;
    setIsInviting(true);
    try {
      if (inviteMode === 'email') {
        await projectsApi.createInvitation(projectId, { email: value });
      } else {
        await projectsApi.addMember(projectId, { member_user_id: value });
      }
      const [membersData, invitationsData] = await Promise.all([
        projectsApi.listMembers(projectId),
        projectsApi.listInvitations(projectId),
      ]);
      setMembers(membersData);
      setInvitations(invitationsData);
      setInviteValue('');
    } catch (err) {
      console.error('Failed to invite member:', err);
      alert('メンバー追加に失敗しました。');
    } finally {
      setIsInviting(false);
    }
  };

  const handleCopyInviteLink = async (token: string) => {
    const link = `${window.location.origin}/invite/accept?token=${token}`;
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(link);
        return;
      } catch (err) {
        console.error('Clipboard write failed:', err);
      }
    }
    try {
      const textarea = document.createElement('textarea');
      textarea.value = link;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    } catch (err) {
      console.error('Fallback copy failed:', err);
    }
  };

  const handleCreateBaseline = async () => {
    if (!projectId) return;
    setIsCreatingBaseline(true);
    try {
      const newBaseline = await scheduleSnapshotsApi.create(projectId, {});
      setActiveBaseline(newBaseline);
      // Fetch diff for the new baseline
      const diff = await scheduleSnapshotsApi.getDiff(projectId);
      setBaselineDiff(diff);
    } catch (err) {
      console.error('Failed to create baseline:', err);
      alert('ベースラインの作成に失敗しました。');
    } finally {
      setIsCreatingBaseline(false);
    }
  };

  const handleRevokeInvitation = async (invitation: ProjectInvitation) => {
    if (!projectId) return;
    setInvitationActionId(invitation.id);
    try {
      await projectsApi.updateInvitation(projectId, invitation.id, { status: 'REVOKED' });
      const invitationsData = await projectsApi.listInvitations(projectId);
      setInvitations(invitationsData);
    } catch (err) {
      console.error('Failed to revoke invitation:', err);
      alert('招待の取消に失敗しました。');
    } finally {
      setInvitationActionId(null);
    }
  };

  const handleMemberRoleChange = async (memberId: string, role: ProjectMember['role']) => {
    if (!projectId) return;
    setMemberActionId(memberId);
    try {
      await projectsApi.updateMember(projectId, memberId, { role });
      const membersData = await projectsApi.listMembers(projectId);
      setMembers(membersData);
    } catch (err) {
      console.error('Failed to update member role:', err);
      alert('ロールの更新に失敗しました。');
    } finally {
      setMemberActionId(null);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!projectId) return;
    setMemberActionId(memberId);
    try {
      await projectsApi.removeMember(projectId, memberId);
      const membersData = await projectsApi.listMembers(projectId);
      setMembers(membersData);
    } catch (err) {
      console.error('Failed to remove member:', err);
      alert('メンバーの削除に失敗しました。');
    } finally {
      setMemberActionId(null);
    }
  };

  const handleAssignMultiple = async (taskId: string, memberUserIds: string[]) => {
    if (!projectId) return;
    try {
      if (memberUserIds.length > 0) {
        const newAssignments = await tasksApi.assignTaskMultiple(taskId, { assignee_ids: memberUserIds });
        setAssignments((prev) => {
          const filtered = prev.filter((item) => item.task_id !== taskId);
          return [...filtered, ...newAssignments];
        });
      } else {
        await tasksApi.unassignTask(taskId);
        setAssignments((prev) => prev.filter((item) => item.task_id !== taskId));
      }
    } catch (err) {
      console.error('Failed to update assignment:', err);
      alert('担当者の更新に失敗しました。');
    }
  };

  const handleSubmitTaskForm = (data: TaskUpdate) => {
    if (taskToEdit) {
      updateTask(taskToEdit.id, data);
      refetchTasks();
    }
    setTaskToEdit(null);
  };

  if (error) {
    return (
      <div className="project-v2-page">
        <div className="project-v2-panel">
          <p className="project-v2-error">{error}</p>
          <button className="project-v2-secondary" onClick={() => navigate('/projects')}>
            プロジェクト一覧へ戻る
          </button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="project-v2-page">
        <div className="project-v2-panel">
          <p>読み込み中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="project-v2-page">
      <header className="project-v2-header">
        <div className="project-v2-header-top">
          <div>
            <button className="project-v2-secondary" onClick={() => navigate('/projects')}>
              プロジェクト一覧
            </button>
            <h1 className="project-v2-title">
              {project?.name || 'プロジェクト'}
              <span className="project-v2-badge">V2</span>
            </h1>
            <div className="project-v2-meta">
              <span>全タスク {project?.total_tasks ?? 0}</span>
              <span>完了 {project?.completed_tasks ?? 0}</span>
              <span>進捗 {completionRate}%</span>
            </div>
          </div>
          <div className="project-v2-header-actions">
            {currentPhase && (
              <div className="project-v2-phase-indicator">
                現在フェーズ: {currentPhase.name}
              </div>
            )}
            {projectId && (
              <button
                className="project-v2-secondary"
                onClick={() => navigate(`/projects/${projectId}`)}
              >
                v1を開く
              </button>
            )}
          </div>
        </div>
        <div className="project-v2-progress">
          <div className="project-v2-progress-stats">
            <div className="project-v2-progress-stat">
              <div className="project-v2-progress-value">{project?.completed_tasks ?? 0}</div>
              <div className="project-v2-progress-label">完了</div>
            </div>
            <div className="project-v2-progress-stat">
              <div className="project-v2-progress-value">{inProgressCount}</div>
              <div className="project-v2-progress-label">進行中</div>
            </div>
            <div className="project-v2-progress-stat">
              <div className="project-v2-progress-value">{waitingCount}</div>
              <div className="project-v2-progress-label">待機</div>
            </div>
          </div>
          <div className="project-v2-progress-bar">
            <div
              className="project-v2-progress-fill"
              style={{ width: `${completionRate}%` }}
            />
          </div>
        </div>
      </header>

      {(overdueTasks.length > 0 || blockedDependencyCount > 0) && (
        <div className="project-v2-alert">
          <div className="project-v2-alert-icon">!</div>
          <div>
            <div className="project-v2-alert-title">
              注意が必要なタスクがあります
            </div>
            <div className="project-v2-alert-text">
              期限超過 {overdueTasks.length}件 / 依存ブロック {blockedDependencyCount}件
            </div>
          </div>
        </div>
      )}

      <nav className="project-v2-tabs">
        {(Object.keys(TAB_LABELS) as TabId[]).map((tabId) => (
          <button
            key={tabId}
            type="button"
            className={`project-v2-tab ${activeTab === tabId ? 'is-active' : ''}`}
            onClick={() => setActiveTab(tabId)}
          >
            <span className="project-v2-tab-icon">{TAB_ICONS[tabId]}</span>
            <span>{TAB_LABELS[tabId]}</span>
          </button>
        ))}
      </nav>

      <section className="project-v2-panel">
        {activeTab === 'dashboard' && (
          <div className="project-v2-section project-v2-dashboard">
            <div className="project-v2-kpi-grid">
              {kpiMetrics.length === 0 ? (
                <div className="project-v2-kpi-card">
                  <div className="project-v2-kpi-label">KPI</div>
                  <div className="project-v2-muted">KPI設定がありません。</div>
                </div>
              ) : (
                kpiMetrics.map((metric) => {
                  const progress = computeKpiProgress(metric);
                  const current = metric.current ?? '-';
                  const target = metric.target ?? '-';
                  const unit = metric.unit ?? '';
                  return (
                    <div key={metric.key} className="project-v2-kpi-card">
                      <div className="project-v2-kpi-label">{metric.label}</div>
                      <div className="project-v2-kpi-value">{current}{unit}</div>
                      <div className="project-v2-kpi-target">目標: {target}{unit}</div>
                      <div className="project-v2-kpi-progress">
                        <div
                          className="project-v2-kpi-progress-fill"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="project-v2-dashboard-grid">
              <div className="project-v2-dashboard-main">
                <div className="project-v2-card">
                  <div className="project-v2-card-header">
                    <h3>AI提案</h3>
                  </div>
                  <div className="project-v2-ai-suggestion">
                    <div className="project-v2-ai-header">
                      <span className="project-v2-ai-badge">ベースライン更新</span>
                      <span className="project-v2-ai-title">ベースライン再生成の提案</span>
                    </div>
                    <div className="project-v2-ai-body">
                      Phase 2のバッファ残量が低下しています。start_not_beforeは固定したまま、計画ベースラインを再生成して差分を確認します。
                    </div>
                    <div className="project-v2-ai-actions">
                      <button className="project-v2-button primary">ベースラインを生成</button>
                      <button className="project-v2-button ghost">差分をプレビュー</button>
                    </div>
                  </div>
                  <div className="project-v2-ai-suggestion">
                    <div className="project-v2-ai-header">
                      <span className="project-v2-ai-badge">ボトルネック</span>
                      <span className="project-v2-ai-title">依存タスクの遅延検知</span>
                    </div>
                    <div className="project-v2-ai-body">
                      依存ブロック {blockedDependencyCount}件。担当の負荷を分散し、クリティカルチェーンの遅延リスクを抑えましょう。
                    </div>
                    <div className="project-v2-ai-actions">
                      <button className="project-v2-button primary">再割り当て</button>
                      <button className="project-v2-button ghost">詳細を見る</button>
                    </div>
                  </div>
                </div>

                <div className="project-v2-card">
                  <div className="project-v2-card-header">
                    <h3>今日の優先タスク</h3>
                  </div>
                  {priorityTasks.length === 0 ? (
                    <p className="project-v2-muted">優先タスクはありません。</p>
                  ) : (
                    <div className="project-v2-task-list">
                      {priorityTasks.map((task) => {
                        const assigneeLabel = assigneeByTaskId[task.id];
                        const assigneeInitial = assigneeLabel ? assigneeLabel.trim().charAt(0) : '?';
                        const dueLabel = task.due_date ? formatShortDate(task.due_date) : '期限未設定';
                        const dueDate = task.due_date ? new Date(task.due_date) : null;
                        const isOverdue = Boolean(dueDate && dueDate < new Date());
                        return (
                          <div key={task.id} className="project-v2-task-item">
                            <span className={`project-v2-task-priority priority-${task.urgency.toLowerCase()}`} />
                            <div className="project-v2-task-content">
                              <div className="project-v2-task-title">{task.title}</div>
                              <div className="project-v2-task-meta">
                                {task.estimated_minutes ? `${Math.round(task.estimated_minutes / 60)}h` : '見積未設定'}
                                <span className="project-v2-task-divider">•</span>
                                {dueLabel}
                              </div>
                            </div>
                            <div className="project-v2-task-assignee">{assigneeInitial}</div>
                            <div className={`project-v2-task-due ${isOverdue ? 'overdue' : ''}`}>
                              {isOverdue ? '期限超過' : STATUS_LABELS[task.status]}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="project-v2-card">
                  <div className="project-v2-card-header">
                    <h3>チェックイン</h3>
                    <div className="project-v2-actions">
                      <button className="project-v2-button" onClick={handleStartWeeklyCheckin}>
                        週次チェックイン
                      </button>
                      <button className="project-v2-button" onClick={handleStartIssueCheckin}>
                        課題チェックイン
                      </button>
                    </div>
                  </div>

                  {members.length === 0 && (
                    <p className="project-v2-muted">メンバーを追加すると投稿できます。</p>
                  )}

                  {checkinMode && (
                    <div className="project-v2-form">
                      <label className="project-v2-label" htmlFor="checkin-member">
                        メンバー
                      </label>
                      <select
                        id="checkin-member"
                        className="project-v2-select"
                        value={selectedCheckinMemberId}
                        onChange={(e) => setSelectedCheckinMemberId(e.target.value)}
                      >
                        {members.map((member) => (
                          <option key={member.id} value={member.member_user_id}>
                            {member.member_display_name || member.member_user_id}
                          </option>
                        ))}
                      </select>

                      <label className="project-v2-label" htmlFor="checkin-text">
                        内容
                      </label>
                      <textarea
                        id="checkin-text"
                        className="project-v2-textarea"
                        rows={6}
                        value={checkinText}
                        onChange={(e) => setCheckinText(e.target.value)}
                        placeholder={checkinMode === 'weekly'
                          ? '今週の進捗や課題をまとめてください。'
                          : '現在の課題やブロッカーを書いてください。'}
                      />
                      {checkinError && <p className="project-v2-error">{checkinError}</p>}
                      <div className="project-v2-actions">
                        <button
                          className="project-v2-button ghost"
                          onClick={() => {
                            setCheckinMode(null);
                            setCheckinText('');
                          }}
                          disabled={isCheckinSaving}
                        >
                          キャンセル
                        </button>
                        <button
                          className="project-v2-button primary"
                          onClick={handleSubmitCheckin}
                          disabled={isCheckinSaving}
                        >
                          {isCheckinSaving ? '保存中...' : '保存'}
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="project-v2-subsection">
                    <h4>最近のチェックイン</h4>
                    {checkins.length === 0 ? (
                      <p className="project-v2-muted">まだチェックインはありません。</p>
                    ) : (
                      <div className="project-v2-list">
                        {checkins.slice(0, 5).map((checkin) => (
                          <div key={checkin.id} className="project-v2-list-item">
                            <div className="project-v2-list-title">
                              {formatCheckinDate(checkin.checkin_date)} ・ {memberLabelById[checkin.member_user_id] || checkin.member_user_id}
                            </div>
                            <div className="project-v2-muted">{checkin.raw_text}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="project-v2-subsection">
                    <h4>チェックイン要約</h4>
                    <div className="project-v2-form-row">
                      <label className="project-v2-label">
                        From
                        <input
                          type="date"
                          className="project-v2-input"
                          value={checkinSummaryStart}
                          onChange={(e) => setCheckinSummaryStart(e.target.value)}
                        />
                      </label>
                      <label className="project-v2-label">
                        To
                        <input
                          type="date"
                          className="project-v2-input"
                          value={checkinSummaryEnd}
                          onChange={(e) => setCheckinSummaryEnd(e.target.value)}
                        />
                      </label>
                      <button
                        className="project-v2-button primary"
                        onClick={handleSummarizeCheckins}
                        disabled={isCheckinSummaryLoading}
                      >
                        {isCheckinSummaryLoading ? '要約中...' : '要約する'}
                      </button>
                    </div>
                    {checkinSummaryError && <p className="project-v2-error">{checkinSummaryError}</p>}
                    {checkinSummary && (
                      <div className="project-v2-summary">
                        <div className="project-v2-muted">{checkinSummary.checkin_count} posts</div>
                        <div className="project-v2-summary-text">
                          {checkinSummary.summary_text || 'No check-ins in range.'}
                        </div>
                        <div className="project-v2-actions">
                          <button
                            className="project-v2-button ghost"
                            onClick={handleSaveCheckinSummary}
                            disabled={isCheckinSummarySaving || !checkinSummary.summary_text}
                          >
                            {isCheckinSummarySaving ? '保存中...' : '保存する'}
                          </button>
                          {checkinSummarySaveStatus && (
                            <span className="project-v2-muted">{checkinSummarySaveStatus}</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="project-v2-subsection">
                    <h4>保存済みサマリー</h4>
                    {isSavedCheckinSummariesLoading && (
                      <p className="project-v2-muted">読み込み中...</p>
                    )}
                    {savedCheckinSummariesError && (
                      <p className="project-v2-error">{savedCheckinSummariesError}</p>
                    )}
                    {!isSavedCheckinSummariesLoading
                      && !savedCheckinSummariesError
                      && savedCheckinSummaries.length === 0 && (
                        <p className="project-v2-muted">保存したサマリーはありません。</p>
                      )}
                    {!isSavedCheckinSummariesLoading && savedCheckinSummaries.length > 0 && (
                      <div className="project-v2-list">
                        {savedCheckinSummaries.map((memory) => {
                          const rangeLabel = getTagValue(memory.tags, 'range:') || '期間不明';
                          const countLabel = getTagValue(memory.tags, 'count:');
                          return (
                            <details key={memory.id} className="project-v2-details">
                              <summary className="project-v2-details-summary">
                                <span>{rangeLabel}</span>
                                <span className="project-v2-muted">
                                  {countLabel ? `${countLabel}件` : ''}
                                  {memory.created_at ? `・${formatMemoryDate(memory.created_at)}` : ''}
                                </span>
                              </summary>
                              <pre className="project-v2-pre">{memory.content}</pre>
                            </details>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="project-v2-dashboard-side">
                {/* Baseline & Buffer Card */}
                <div className="project-v2-card project-v2-baseline-card">
                  <div className="project-v2-card-header">
                    <h3>ベースライン & バッファ</h3>
                    {baselineDiff && (
                      <button className="project-v2-button ghost">差分を見る</button>
                    )}
                  </div>
                  {isBaselineLoading ? (
                    <p className="project-v2-muted">読み込み中...</p>
                  ) : activeBaseline ? (
                    <>
                      <div className="project-v2-baseline-row">
                        <div>
                          <div className="project-v2-baseline-meta">アクティブ計画</div>
                          <div className="project-v2-baseline-name">{activeBaseline.name}</div>
                          <div className="project-v2-baseline-meta">
                            {new Date(activeBaseline.created_at).toLocaleDateString('ja-JP')} 作成
                          </div>
                        </div>
                        {(() => {
                          const total = activeBaseline.total_buffer_minutes;
                          const consumed = activeBaseline.consumed_buffer_minutes;
                          const remaining = total > 0 ? Math.round(((total - consumed) / total) * 100) : 100;
                          const statusClass: string = remaining >= 67 ? 'healthy' : remaining >= 33 ? 'warn' : 'critical';
                          return (
                            <div className={`project-v2-buffer-pill ${statusClass}`}>
                              バッファ残り {remaining}%
                            </div>
                          );
                        })()}
                      </div>
                      {baselineDiff && (
                        <div className="project-v2-baseline-summary">
                          <div>差分: 遅延 {baselineDiff.summary.delayed_count}件 / 前倒し {baselineDiff.summary.ahead_count}件</div>
                          <div>完了 {baselineDiff.summary.completed_count}件 / 順調 {baselineDiff.summary.on_track_count}件</div>
                        </div>
                      )}
                      <div className="project-v2-baseline-actions">
                        <button
                          className="project-v2-button primary"
                          onClick={handleCreateBaseline}
                          disabled={isCreatingBaseline}
                        >
                          {isCreatingBaseline ? '作成中...' : 'ベースラインを更新'}
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="project-v2-muted">ベースラインが設定されていません。</p>
                      <button
                        className="project-v2-button primary"
                        onClick={handleCreateBaseline}
                        disabled={isCreatingBaseline}
                      >
                        {isCreatingBaseline ? '作成中...' : 'ベースラインを作成'}
                      </button>
                    </>
                  )}
                </div>

                <div className="project-v2-card">
                  <div className="project-v2-card-header">
                    <h3>ブロッカー</h3>
                    <span className="project-v2-badge">{openBlockerCount}</span>
                  </div>
                  {blockers.length === 0 ? (
                    <p className="project-v2-muted">ブロッカーはありません。</p>
                  ) : (
                    <div className="project-v2-blocker-list">
                      {blockers.slice(0, 5).map((blocker) => (
                        <div key={blocker.id} className="project-v2-blocker-item">
                          <div className="project-v2-blocker-title">
                            {taskTitleById.get(blocker.task_id) || 'タスク'}
                          </div>
                          <div className="project-v2-muted">{blocker.reason}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="project-v2-card">
                  <div className="project-v2-card-header">
                    <h3>アクティビティ</h3>
                    <span className="project-v2-badge">{activityFeed.length}</span>
                  </div>
                  {activityFeed.length === 0 ? (
                    <p className="project-v2-muted">最近のアクティビティはありません。</p>
                  ) : (
                    <div className="project-v2-activity-list">
                      {activityFeed.map((item) => (
                        <div key={item.id} className="project-v2-activity-item">
                          <div className="project-v2-activity-content">
                            <div className="project-v2-activity-title">{item.type}</div>
                            <div className="project-v2-muted">{item.title}</div>
                            {item.detail && <div className="project-v2-muted">{item.detail}</div>}
                          </div>
                          <span className="project-v2-muted">
                            {formatShortDate(item.timestamp)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="project-v2-card">
                  <h3>スケジュール</h3>
                  <ScheduleOverviewCard
                    projectId={projectId}
                    projectTasks={tasks}
                    title="プロジェクトスケジュール"
                    tag="プロジェクト"
                    onTaskClick={handleScheduleTaskClick}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'team' && (
          <div className="project-v2-section">
            <div className="project-v2-team-grid">
              {members.length === 0 ? (
                <div className="project-v2-card">
                  <p className="project-v2-muted">メンバーがまだいません。</p>
                </div>
              ) : (
                members.map((member) => {
                  const stats = memberStatsById[member.member_user_id] ?? {
                    total: 0,
                    done: 0,
                    inProgress: 0,
                    minutes: 0,
                  };
                  const capacityMinutes = member.capacity_hours && member.capacity_hours > 0
                    ? member.capacity_hours * 60
                    : null;
                  const loadPercent = capacityMinutes
                    ? Math.round((stats.minutes / capacityMinutes) * 100)
                    : null;
                  const cappedPercent = loadPercent ? Math.min(loadPercent, 100) : 0;
                  const loadClass = loadPercent == null
                    ? 'unknown'
                    : loadPercent > 110
                      ? 'over'
                      : loadPercent > 80
                        ? 'warn'
                        : 'ok';
                  const displayName = member.member_display_name || member.member_user_id;
                  return (
                    <div key={member.id} className="project-v2-team-card">
                      <div className="project-v2-team-header">
                        <div className="project-v2-team-avatar">{getInitial(displayName)}</div>
                        <div>
                          <div className="project-v2-team-name">{displayName}</div>
                          <div className="project-v2-muted">{member.role}</div>
                        </div>
                      </div>
                      <div className="project-v2-team-stats">
                        <div className="project-v2-team-stat">
                          <div className="project-v2-team-stat-value">{stats.total}</div>
                          <div className="project-v2-team-stat-label">TOTAL</div>
                        </div>
                        <div className="project-v2-team-stat">
                          <div className="project-v2-team-stat-value">{stats.inProgress}</div>
                          <div className="project-v2-team-stat-label">IN PROGRESS</div>
                        </div>
                        <div className="project-v2-team-stat">
                          <div className="project-v2-team-stat-value">{stats.done}</div>
                          <div className="project-v2-team-stat-label">DONE</div>
                        </div>
                      </div>
                      <div className="project-v2-team-workload">
                        <div className="project-v2-muted">
                          負荷 {loadPercent != null ? `${loadPercent}%` : '未設定'}
                        </div>
                        <div className="project-v2-workload-bar">
                          <div
                            className={`project-v2-workload-fill ${loadClass}`}
                            style={{ width: `${cappedPercent}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="project-v2-team-panels">
              <div className="project-v2-card">
                <h3>フェーズ別 負荷積み上げ</h3>
                <p className="project-v2-muted">フェーズ期間と現在日付から動的にキャパ算出（週あたり工数）</p>
                {members.length === 0 ? (
                  <p className="project-v2-muted">メンバーを追加すると表示されます。</p>
                ) : isPhasesLoading ? (
                  <p className="project-v2-muted">読み込み中...</p>
                ) : phaseRows.length === 0 ? (
                  <p className="project-v2-muted">フェーズがありません。</p>
                ) : (
                  <div className="project-v2-table-wrap">
                    <table className="project-v2-table">
                      <thead>
                        <tr>
                          <th>フェーズ</th>
                          {members.map((member) => (
                            <th key={member.id}>
                              {member.member_display_name || member.member_user_id}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {phaseRows.map((phase) => (
                          <tr key={phase.id}>
                            <td>
                              <div className="project-v2-list-title">{phase.name}</div>
                              <div className="project-v2-muted">{getPhaseRangeLabel(phase)}</div>
                              <div className="project-v2-muted">
                                完了 {phase.taskCounts.done} / 全体 {phase.taskCounts.total}
                              </div>
                            </td>
                            {members.map((member) => {
                              const memberId = member.member_user_id;
                              const loadMinutes = workloadByPhaseId[phase.id]?.[memberId] ?? 0;
                              const capacityMinutes = getPhaseCapacityMinutes(phase, member);
                              const bufferMinutes = capacityMinutes != null ? capacityMinutes - loadMinutes : null;
                              return (
                                <td key={`${phase.id}-${member.id}`}>
                                  <div className="project-v2-workload-cell">
                                    <div>{formatHours(loadMinutes)}</div>
                                    {capacityMinutes != null ? (
                                      <>
                                        <div className="project-v2-muted">
                                          キャパ {formatHours(capacityMinutes)}
                                        </div>
                                        <div
                                          className={`project-v2-workload-buffer ${bufferMinutes != null && bufferMinutes < 0 ? 'is-negative' : ''}`}
                                        >
                                          バッファ {formatHours(bufferMinutes ?? 0)}
                                        </div>
                                      </>
                                    ) : (
                                      <div className="project-v2-muted">キャパ未設定</div>
                                    )}
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              <div className="project-v2-card">
                <h3>メンバー管理</h3>
                <div className="project-v2-form-row">
                  <select
                    className="project-v2-select"
                    value={inviteMode}
                    onChange={(e) => setInviteMode(e.target.value as InviteMode)}
                    disabled={isInviting}
                  >
                    <option value="email">Email</option>
                    <option value="user_id">User ID</option>
                  </select>
                  <input
                    className="project-v2-input"
                    type="text"
                    placeholder={inviteMode === 'email' ? 'member@example.com' : 'user-id'}
                    value={inviteValue}
                    onChange={(e) => setInviteValue(e.target.value)}
                    disabled={isInviting}
                  />
                  <button
                    className="project-v2-button primary"
                    onClick={handleInvite}
                    disabled={!inviteValue.trim() || isInviting}
                  >
                    {inviteMode === 'email' ? '招待' : '追加'}
                  </button>
                </div>
                <p className="project-v2-muted">Email招待とUser ID追加を選べます。</p>

                {isCollabLoading ? (
                  <p className="project-v2-muted">読み込み中...</p>
                ) : (
                  <div className="project-v2-list">
                    {members.length === 0 ? (
                      <p className="project-v2-muted">メンバーがまだいません。</p>
                    ) : (
                      members.map((member) => (
                        <div key={member.id} className="project-v2-list-item">
                          <div>
                            <div className="project-v2-list-title">
                              {member.member_display_name || member.member_user_id}
                            </div>
                            <div className="project-v2-muted">{member.member_user_id}</div>
                            <div className="project-v2-inline-field">
                              <label className="project-v2-inline-label" htmlFor={`capacity-${member.id}`}>
                                基本工数 (h/週)
                              </label>
                              <input
                                id={`capacity-${member.id}`}
                                className="project-v2-input"
                                type="number"
                                min="0"
                                step="0.5"
                                value={capacityDrafts[member.id] ?? ''}
                                onChange={(e) => handleCapacityDraftChange(member.id, e.target.value)}
                                disabled={capacityActionId === member.id}
                              />
                              <button
                                className="project-v2-button"
                                onClick={() => handleCapacitySave(member)}
                                disabled={capacityActionId === member.id}
                              >
                                {capacityActionId === member.id ? '保存中...' : '保存'}
                              </button>
                            </div>
                          </div>
                          <div className="project-v2-actions">
                            <select
                              className="project-v2-select"
                              value={member.role}
                              onChange={(e) => handleMemberRoleChange(member.id, e.target.value as ProjectMember['role'])}
                              disabled={memberActionId === member.id}
                            >
                              <option value="OWNER">OWNER</option>
                              <option value="ADMIN">ADMIN</option>
                              <option value="MEMBER">MEMBER</option>
                            </select>
                            <button
                              className="project-v2-button ghost"
                              onClick={() => handleRemoveMember(member.id)}
                              disabled={memberActionId === member.id}
                            >
                              削除
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {pendingInvitations.length > 0 && (
                  <div className="project-v2-subsection">
                    <h4>招待中</h4>
                    <div className="project-v2-list">
                      {pendingInvitations.map((invitation) => (
                        <div key={invitation.id} className="project-v2-list-item">
                          <div>
                            <div className="project-v2-list-title">{invitation.email}</div>
                            <div className="project-v2-muted">{invitation.status}</div>
                            {invitation.token && (
                              <div className="project-v2-muted">{invitation.token}</div>
                            )}
                          </div>
                          <div className="project-v2-actions">
                            {invitation.token && (
                              <button
                                className="project-v2-button"
                                onClick={() => handleCopyInviteLink(invitation.token as string)}
                              >
                                リンクコピー
                              </button>
                            )}
                            <button
                              className="project-v2-button ghost"
                              onClick={() => handleRevokeInvitation(invitation)}
                              disabled={invitationActionId === invitation.id}
                            >
                              取消
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'timeline' && (
          <div className="project-v2-section">
            <div className="project-v2-card">
              <div className="project-v2-card-header">
                <h3>フェーズ & マイルストーン</h3>
                <button
                  className="project-v2-button"
                  onClick={handleGeneratePhases}
                  disabled={isPlanningPhases}
                >
                  {isPlanningPhases ? '生成中...' : 'AIでフェーズ生成'}
                </button>
              </div>
              <div className="project-v2-form">
                <label className="project-v2-label" htmlFor="phase-instruction">
                  AI指示
                </label>
                <input
                  id="phase-instruction"
                  className="project-v2-input"
                  type="text"
                  placeholder="例: MVP優先、3フェーズで分割"
                  value={phasePlanInstruction}
                  onChange={(e) => setPhasePlanInstruction(e.target.value)}
                />
              </div>
              {isPhasesLoading ? (
                <p className="project-v2-muted">読み込み中...</p>
              ) : sortedPhases.length === 0 ? (
                <p className="project-v2-muted">フェーズがありません。</p>
              ) : (
                <div className="project-v2-timeline">
                  {sortedPhases.map((phase) => {
                    const isCurrent = currentPhase?.id === phase.id;
                    const isCompleted = phase.status === 'COMPLETED';
                    return (
                      <div
                        key={phase.id}
                        className={`project-v2-timeline-item ${isCurrent ? 'is-current' : ''} ${isCompleted ? 'is-complete' : ''}`}
                      >
                        <div className="project-v2-timeline-card">
                          <div className="project-v2-timeline-title">
                            {phase.name}
                            {isCurrent && <span className="project-v2-phase-badge">進行中</span>}
                          </div>
                          <div className="project-v2-muted">{getPhaseRangeLabel(phase)}</div>
                          <div className="project-v2-muted">
                            完了 {phase.completed_tasks} / 全体 {phase.total_tasks}
                          </div>
                          <div className="project-v2-milestone-list">
                            {isMilestonesLoading ? (
                              <p className="project-v2-muted">マイルストーン読み込み中...</p>
                            ) : (milestonesByPhaseId[phase.id] || []).length === 0 ? (
                              <p className="project-v2-muted">マイルストーンはまだありません。</p>
                            ) : (
                              (milestonesByPhaseId[phase.id] || []).map((milestone) => (
                                <div key={milestone.id} className="project-v2-milestone-item">
                                  <div className="project-v2-list-title">{milestone.title}</div>
                                  <div className="project-v2-muted">
                                    {milestone.due_date ? formatShortDate(milestone.due_date) : '期限未設定'}
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'board' && (
          <div className="project-v2-section">
            <div className="project-v2-card">
              {tasksLoading ? (
                <p className="project-v2-muted">タスクを読み込み中...</p>
              ) : (
                <ProjectTasksView
                  projectId={projectId!}
                  tasks={tasks}
                  onUpdateTask={(id: string, status: TaskStatus) => {
                    updateTask(id, { status });
                    refetchTasks();
                  }}
                  onTaskClick={handleTaskClick}
                  assigneeByTaskId={assigneeByTaskId}
                  assignedMemberIdsByTaskId={assignedMemberIdsByTaskId}
                  memberOptions={memberOptions}
                  onAssignMultiple={handleAssignMultiple}
                  onDeleteTask={(taskId: string) => {
                    deleteTask(taskId);
                    refetchTasks();
                  }}
                  onRefreshTasks={refetchTasks}
                />
              )}
            </div>
          </div>
        )}

        {activeTab === 'gantt' && (
          <div className="project-v2-section">
            <div className="project-v2-grid">
              <div className="project-v2-card">
                <ProjectGanttChart
                  tasks={tasks}
                  phases={phases}
                  milestones={milestones}
                  baselineDiff={baselineDiff}
                  onTaskUpdate={async (taskId, updates) => {
                    try {
                      await tasksApi.update(taskId, updates);
                      refetchTasks();
                    } catch (err) {
                      console.error('Failed to update task:', err);
                    }
                  }}
                  onPhaseUpdate={async (phaseId, updates) => {
                    try {
                      await phasesApi.update(phaseId, updates);
                      refreshPhases();
                    } catch (err) {
                      console.error('Failed to update phase:', err);
                    }
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'meetings' && <MeetingsTab projectId={projectId!} />}
      </section>

      {selectedTask && (
        <TaskDetailModal
          task={openedParentTask || selectedTask}
          subtasks={tasks.filter(task => task.parent_id === (openedParentTask?.id || selectedTask.id))}
          allTasks={tasks}
          initialSubtask={openedParentTask ? selectedTask : null}
          onClose={() => {
            setSelectedTask(null);
            setOpenedParentTask(null);
          }}
          onEdit={(task) => setTaskToEdit(task)}
          onProgressChange={(taskId, progress) => {
            updateTask(taskId, { progress });
          }}
          onTaskCheck={handleTaskCheck}
          onActionItemsCreated={refetchTasks}
          onStatusChange={(taskId, status) => {
            updateTask(taskId, { status: status as TaskStatus });
            refetchTasks();
          }}
        />
      )}

      {taskToEdit && (
        <TaskFormModal
          task={taskToEdit}
          allTasks={tasks}
          onClose={() => setTaskToEdit(null)}
          onSubmit={handleSubmitTaskForm}
          isSubmitting={false}
        />
      )}
    </div>
  );
}
