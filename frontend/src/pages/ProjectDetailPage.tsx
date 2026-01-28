import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { FaArrowLeft, FaBookOpen, FaBullseye, FaCalendarAlt, FaChartLine, FaCheckCircle, FaEdit, FaHeartbeat, FaLightbulb, FaStar, FaUsers } from 'react-icons/fa';
import ReactMarkdown from 'react-markdown';
import { useNavigate, useParams } from 'react-router-dom';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import { memoriesApi } from '../api/memories';
import { phasesApi } from '../api/phases';
import { getProject, projectsApi } from '../api/projects';
import { tasksApi } from '../api/tasks';
import type { Blocker, Checkin, CheckinCreateV2, CheckinSummary, CheckinV2, Memory, PhaseWithTaskCount, ProjectInvitation, ProjectKpiMetric, ProjectMember, ProjectWithTaskCount, Task, TaskAssignment, TaskStatus } from '../api/types';
import { CheckinForm } from '../components/projects/CheckinForm';
import type { UserSearchResult } from '../api/users';
import { UserSearchInput } from '../components/common/UserSearchInput';
import { ScheduleOverviewCard } from '../components/dashboard/ScheduleOverviewCard';
import { ProjectDetailModal } from '../components/projects/ProjectDetailModal';
import { ProjectTasksView } from '../components/projects/ProjectTasksView';
import { ProjectAchievementsSection } from '../components/projects/ProjectAchievementsSection';
import { RecurringMeetingsPanel } from '../components/projects/RecurringMeetingsPanel';
import { useTaskModal } from '../hooks/useTaskModal';
import { useTasks } from '../hooks/useTasks';
import { useTimezone } from '../hooks/useTimezone';
import { formatDate, toDateTime, todayInTimezone } from '../utils/dateTime';
import './ProjectDetailPage.css';

export function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const timezone = useTimezone();
  const [project, setProject] = useState<ProjectWithTaskCount | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [assignments, setAssignments] = useState<TaskAssignment[]>([]);
  const [blockers, setBlockers] = useState<Blocker[]>([]);
  const [invitations, setInvitations] = useState<ProjectInvitation[]>([]);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [_checkinsV2, setCheckinsV2] = useState<CheckinV2[]>([]);
  const [showCheckinForm, setShowCheckinForm] = useState(false);
  const [isCheckinV2Saving, setIsCheckinV2Saving] = useState(false);
  const [checkinMode, setCheckinMode] = useState<'weekly' | 'issue' | null>(null);
  const [checkinText, setCheckinText] = useState('');
  const [selectedCheckinMemberId, setSelectedCheckinMemberId] = useState('');
  const [isCheckinSaving, setIsCheckinSaving] = useState(false);
  const [checkinError, setCheckinError] = useState<string | null>(null);
  const [checkinSummaryStart, setCheckinSummaryStart] = useState(() => {
    const start = todayInTimezone(timezone).minus({ days: 7 });
    return start.toISODate() ?? '';
  });
  const [checkinSummaryEnd, setCheckinSummaryEnd] = useState(
    () => todayInTimezone(timezone).toISODate() ?? '',
  );
  const [checkinSummary, setCheckinSummary] = useState<CheckinSummary | null>(null);
  const [isCheckinSummaryLoading, setIsCheckinSummaryLoading] = useState(false);
  const [checkinSummaryError, setCheckinSummaryError] = useState<string | null>(null);
  const [isCheckinSummarySaving, setIsCheckinSummarySaving] = useState(false);
  const [checkinSummarySaveStatus, setCheckinSummarySaveStatus] = useState<string | null>(null);
  const [savedCheckinSummaries, setSavedCheckinSummaries] = useState<Memory[]>([]);
  const [isSavedCheckinSummariesLoading, setIsSavedCheckinSummariesLoading] = useState(false);
  const [savedCheckinSummariesError, setSavedCheckinSummariesError] = useState<string | null>(null);
  const [isCollabLoading, setIsCollabLoading] = useState(false);
  const [inviteMode, setInviteMode] = useState<'email' | 'user_id'>('email');
  const [inviteValue, setInviteValue] = useState('');
  const [isInviting, setIsInviting] = useState(false);
  const [isInviteMenuOpen, setInviteMenuOpen] = useState(false);
  const inviteMenuRef = useRef<HTMLDivElement | null>(null);
  const [memberActionId, setMemberActionId] = useState<string | null>(null);
  const [invitationActionId, setInvitationActionId] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [phases, setPhases] = useState<PhaseWithTaskCount[]>([]);

  // Fetch tasks for this project
  const { tasks, isLoading: tasksLoading, refetch: refetchTasks, updateTask, deleteTask } = useTasks(projectId);

  // Use unified task modal hook
  const taskModal = useTaskModal({
    tasks,
    onRefetch: refetchTasks,
    projectName: project?.name,
    getPhaseName: (phaseId) => phases.find(p => p.id === phaseId)?.name,
    defaultTaskData: { project_id: projectId },
  });

  // Fetch project details
  useEffect(() => {
    let isActive = true;
    if (!projectId) {
      setProject(null);
      setIsLoading(false);
      setError('プロジェクトIDが不正です');
      return () => {
        isActive = false;
      };
    }

    const fetchProject = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const [data, phasesData] = await Promise.all([
          getProject(projectId),
          phasesApi.listByProject(projectId),
        ]);
        if (!isActive) return;
        if (!data) {
          throw new Error('Empty project response');
        }
        setProject(data);
        setPhases(phasesData);
      } catch (err) {
        if (!isActive) return;
        console.error('Failed to fetch project:', err);
        setError('プロジェクトの取得に失敗しました');
        setProject(null);
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    };

    fetchProject();

    return () => {
      isActive = false;
    };
  }, [projectId, reloadToken]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!inviteMenuRef.current) return;
      if (inviteMenuRef.current.contains(event.target as Node)) return;
      setInviteMenuOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setInviteMenuOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  useEffect(() => {
    if (!projectId) return;

    const fetchCollaboration = async () => {
      setIsCollabLoading(true);
      try {
        const [membersData, assignmentsData, blockersData, invitationsData, checkinsData] = await Promise.all([
          projectsApi.listMembers(projectId),
          projectsApi.listAssignments(projectId),
          projectsApi.listBlockers(projectId),
          projectsApi.listInvitations(projectId),
          projectsApi.listCheckins(projectId),
        ]);
        setMembers(Array.isArray(membersData) ? membersData : []);
        setAssignments(Array.isArray(assignmentsData) ? assignmentsData : []);
        setBlockers(Array.isArray(blockersData) ? blockersData : []);
        setInvitations(Array.isArray(invitationsData) ? invitationsData : []);
        setCheckins(Array.isArray(checkinsData) ? checkinsData : []);
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

  useEffect(() => {
    if (!members.length) return;
    if (selectedCheckinMemberId) return;
    const owner = members.find(member => member.role === 'OWNER');
    setSelectedCheckinMemberId(owner?.member_user_id || members[0].member_user_id);
  }, [members, selectedCheckinMemberId]);

  const handleRetry = () => {
    setReloadToken((prev) => prev + 1);
  };

  const handleUpdate = () => {
    if (!projectId) return;
    // Refetch project data
    getProject(projectId).then(setProject).catch(console.error);
    refetchTasks();
    setShowEditModal(false);
  };

  if (error) {
    return (
      <div className="project-detail-page">
        <div className="error-state">
          <p>{error}</p>
          <div className="header-actions">
            <button className="back-button" onClick={handleRetry}>
              再読み込み
            </button>
            <button className="back-button" onClick={() => navigate('/projects')}>
              <FaArrowLeft /> プロジェクト一覧へ戻る
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading || !project) {
    return (
      <div className="project-detail-page">
        <div className="loading-state">読み込み中...</div>
      </div>
    );
  }

  const renderStars = (priority: number) => {
    return (
      <div className="priority-stars">
        {[...Array(10)].map((_, i) => (
          <FaStar
            key={i}
            className={`star ${i < priority ? 'star-filled' : 'star-empty'}`}
          />
        ))}
      </div>
    );
  };

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

  const completionRate = project.total_tasks > 0
    ? Math.round((project.completed_tasks / project.total_tasks) * 100)
    : 0;

  const memberLabelById: Record<string, string> = {};
  members.forEach((member) => {
    memberLabelById[member.member_user_id] = member.member_display_name || member.member_user_id;
  });

  // Build invitation label map for pending invitations
  const pendingInvitations = invitations.filter((inv) => inv.status === 'PENDING');
  const invitationLabelById: Record<string, string> = {};
  pendingInvitations.forEach((inv) => {
    invitationLabelById[`inv:${inv.id}`] = `${inv.email} (招待中)`;
  });

  // Build assignee display names by task (comma-separated for multiple)
  const assigneeByTaskId: Record<string, string> = {};
  const assignedMemberIdsByTaskId: Record<string, string[]> = {};
  assignments.forEach((assignment) => {
    if (!assignment.assignee_id) {
      return;
    }
    // Build ID list
    if (!assignedMemberIdsByTaskId[assignment.task_id]) {
      assignedMemberIdsByTaskId[assignment.task_id] = [];
    }
    assignedMemberIdsByTaskId[assignment.task_id].push(assignment.assignee_id);

    // Build display name
    let label: string;
    if (assignment.assignee_id.startsWith('inv:')) {
      label = invitationLabelById[assignment.assignee_id] || assignment.assignee_id;
    } else {
      label = memberLabelById[assignment.assignee_id] || assignment.assignee_id;
    }
    if (assigneeByTaskId[assignment.task_id]) {
      assigneeByTaskId[assignment.task_id] += `, ${label}`;
    } else {
      assigneeByTaskId[assignment.task_id] = label;
    }
  });

  // Include both members and pending invitations in options
  const memberOptions = [
    ...members.map((member) => ({
      id: member.member_user_id,
      label: member.member_display_name || member.member_user_id,
    })),
    ...pendingInvitations.map((inv) => ({
      id: `inv:${inv.id}`,
      label: `${inv.email} (招待中)`,
    })),
  ];

  const inProgressCount = tasks.filter(task => task.status === 'IN_PROGRESS').length;

  const blockedDependencyCount = (() => {
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
  })();

  const openBlockerCount = blockers.filter(blocker => blocker.status === 'OPEN').length;

  const meetingTasks = tasks
    .filter(task => task.is_fixed_time && task.start_time)
    .slice()
    .sort((a, b) => {
      const aTime = a.start_time ? toDateTime(a.start_time as string, timezone).toMillis() : 0;
      const bTime = b.start_time ? toDateTime(b.start_time as string, timezone).toMillis() : 0;
      return aTime - bTime;
    });

  const formatMeetingDateTime = (value?: string) => {
    if (!value) return '';
    return formatDate(
      value,
      { month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' },
      timezone,
    );
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
      alert('担当者の更新に失敗しました');
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
      alert('メンバー追加に失敗しました');
    } finally {
      setIsInviting(false);
    }
  };

  const handleCopyInviteLink = async (token: string, email?: string) => {
    const emailParam = email ? `&email=${encodeURIComponent(email)}` : '';
    const link = `${window.location.origin}/invite/accept?token=${encodeURIComponent(token)}${emailParam}`;
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

  const handleRevokeInvitation = async (invitation: ProjectInvitation) => {
    if (!projectId) return;
    setInvitationActionId(invitation.id);
    try {
      await projectsApi.updateInvitation(projectId, invitation.id, { status: 'REVOKED' });
      const invitationsData = await projectsApi.listInvitations(projectId);
      setInvitations(invitationsData);
    } catch (err) {
      console.error('Failed to revoke invitation:', err);
      alert('招待の取消に失敗しました');
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
      alert('ロールの更新に失敗しました');
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
      alert('メンバーの削除に失敗しました');
    } finally {
      setMemberActionId(null);
    }
  };

  const formatCheckinDate = (value: string) => {
    return formatDate(value, { month: 'numeric', day: 'numeric' }, timezone);
  };

  const getWeeklyMetrics = () => {
    const total = tasks.length;
    const done = tasks.filter(task => task.status === 'DONE').length;
    const inProgress = tasks.filter(task => task.status === 'IN_PROGRESS').length;
    const waiting = tasks.filter(task => task.status === 'WAITING').length;
    const todo = tasks.filter(task => task.status === 'TODO').length;

    const todayDate = todayInTimezone(timezone);
    const weekAhead = todayDate.plus({ days: 7 });

    const dueTasks = tasks.filter(task => task.due_date);
    const overdueTasks = dueTasks.filter(task => {
      if (task.status === 'DONE') return false;
      const due = toDateTime(task.due_date as string, timezone);
      return due.isValid && due.toMillis() < todayDate.toMillis();
    });
    const dueSoonTasks = dueTasks.filter(task => {
      if (task.status === 'DONE') return false;
      const due = toDateTime(task.due_date as string, timezone);
      return (
        due.isValid &&
        due.toMillis() >= todayDate.toMillis() &&
        due.toMillis() <= weekAhead.toMillis()
      );
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

  const formatTaskList = (items: Task[]) =>
    items.slice(0, 5).map(task => `- ${task.title}`).join('\n');

  const buildWeeklySummary = () => {
    const metrics = getWeeklyMetrics();

    const lines = [
      `週次サマリー (${formatDate(metrics.todayDate.toJSDate(), { year: 'numeric', month: 'numeric', day: 'numeric' }, timezone)})`,
      '',
      `- タスク合計: ${metrics.total}`,
      `- 完了: ${metrics.done} / 進行中: ${metrics.inProgress} / 待機: ${metrics.waiting} / 未着手: ${metrics.todo}`,
      `- 期限超過: ${metrics.overdueTasks.length}`,
      `- 直近7日期限: ${metrics.dueSoonTasks.length}`,
      `- 依存で止まりそう: ${blockedDependencyCount}`,
      `- オープンブロッカー: ${openBlockerCount}`,
    ];

    if (metrics.overdueTasks.length > 0) {
      lines.push('', '期限超過タスク（最大5件）', formatTaskList(metrics.overdueTasks));
    }
    if (metrics.dueSoonTasks.length > 0) {
      lines.push('', '直近期限タスク（最大5件）', formatTaskList(metrics.dueSoonTasks));
    }

    lines.push(
      '',
      '議論したいこと:',
      '- ',
      '',
      '困りごと:',
      '- ',
      '',
      '支援が必要な点:',
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
      `週次スナップショット (${formatDate(metrics.todayDate.toJSDate(), { year: 'numeric', month: 'numeric', day: 'numeric' }, timezone)})`,
      `- タスク合計: ${metrics.total}`,
      `- 完了: ${metrics.done} / 進行中: ${metrics.inProgress} / 待機: ${metrics.waiting} / 未着手: ${metrics.todo}`,
      `- 期限超過: ${metrics.overdueTasks.length}`,
      `- 直近7日期限: ${metrics.dueSoonTasks.length}`,
      `- 依存で止まりそう: ${blockedDependencyCount}`,
      `- オープンブロッカー: ${openBlockerCount}`,
    ];

    if (metrics.overdueTasks.length > 0) {
      lines.push('', '期限超過タスク（最大5件）', formatTaskList(metrics.overdueTasks));
    }
    if (metrics.dueSoonTasks.length > 0) {
      lines.push('', '直近期限タスク（最大5件）', formatTaskList(metrics.dueSoonTasks));
    }

    return lines.join('\n').trim();
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
        checkin_date: todayInTimezone(timezone).toISODate() ?? '',
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

  // V2 Check-in handler
  const handleSubmitCheckinV2 = async (data: CheckinCreateV2) => {
    if (!projectId) return;
    setIsCheckinV2Saving(true);
    try {
      await projectsApi.createCheckinV2(projectId, data);
      // Refresh both V1 and V2 lists
      const [checkinsData, checkinsV2Data] = await Promise.all([
        projectsApi.listCheckins(projectId),
        projectsApi.listCheckinsV2(projectId),
      ]);
      setCheckins(checkinsData);
      setCheckinsV2(checkinsV2Data);
      setShowCheckinForm(false);
    } catch (err) {
      console.error('Failed to create V2 checkin:', err);
      throw err;
    } finally {
      setIsCheckinV2Saving(false);
    }
  };

  const getTagValue = (tags: string[] | undefined, prefix: string) => {
    if (!tags) return null;
    const tag = tags.find((item) => item.startsWith(prefix));
    return tag ? tag.slice(prefix.length) : null;
  };

  const formatMemoryDate = (value: string) => {
    return formatDate(
      value,
      { year: 'numeric', month: 'numeric', day: 'numeric' },
      timezone,
    );
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
      setCheckinSummaryError('Failed to summarize check-ins.');
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

  return (
    <motion.div
      className="project-detail-page"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Header */}
      <div className="project-detail-header">
        <button className="back-button" onClick={() => navigate('/projects')}>
          <FaArrowLeft /> プロジェクト一覧
        </button>

        <div className="header-actions">
          <button className="back-button" onClick={() => setShowEditModal(true)}>
            <FaEdit /> 編集
          </button>
        </div>
      </div>

      {/* Hero Section - With Goals and Key Points */}
      <div className="project-info-hero">
        <div className="hero-main">
          <div className="project-title-row">
            <div>
              <h1 className="project-title">{project.name}</h1>
              {project.description && (
                <p className="project-description">{project.description}</p>
              )}
            </div>
            <span className={`project-status status-${project.status.toLowerCase()}`}>
              {project.status}
            </span>
          </div>

          <div className="hero-stats-row">
            <div className="hero-stat">
              <span className="label">優先度</span>
              <div className="priority-display">
                {renderStars(project.priority)}
                <span className="value">{project.priority}/10</span>
              </div>
            </div>
            <div className="hero-stat">
              <span className="label">進捗</span>
              <span className="value">{completionRate}%</span>
            </div>
            <div className="hero-stat">
              <span className="label">タスク</span>
              <span className="value">{project.completed_tasks} / {project.total_tasks}</span>
            </div>
          </div>

          {/* Goals in Hero */}
          {project.goals && project.goals.length > 0 && (
            <div className="hero-goals">
              <div className="hero-section-label">
                <FaBullseye className="hero-section-icon" />
                <span>目標</span>
              </div>
              <ul className="hero-goals-list">
                {project.goals.map((goal, index) => (
                  <li key={index} className="hero-goal-item">
                    <FaCheckCircle className="hero-goal-icon" />
                    {goal}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Key Points in Hero */}
          {project.key_points && project.key_points.length > 0 && (
            <div className="hero-key-points">
              <div className="hero-section-label">
                <FaLightbulb className="hero-section-icon" />
                <span>重要ポイント</span>
              </div>
              <ul className="hero-key-points-list">
                {project.key_points.map((point, index) => (
                  <li key={index} className="hero-key-point-item">{point}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Summary Grid - 3 columns: Team Pulse, KPI, Check-ins */}
      <div className="project-summary-grid">
        {/* Team Pulse */}
        <div className="detail-section team-pulse">
          <div className="section-header">
            <FaHeartbeat className="section-icon" />
            <h3 className="section-title">Team Pulse</h3>
          </div>
          {isCollabLoading ? (
            <div className="pulse-loading">Loading...</div>
          ) : (
            <div className="pulse-grid">
              <div className="pulse-card">
                <span className="pulse-label">In Progress</span>
                <span className="pulse-value">{inProgressCount}</span>
              </div>
              <div className={`pulse-card ${openBlockerCount > 0 ? 'alert' : ''}`}>
                <span className="pulse-label">Open Blockers</span>
                <span className="pulse-value">{openBlockerCount}</span>
              </div>
              <div className={`pulse-card ${blockedDependencyCount > 0 ? 'alert' : ''}`}>
                <span className="pulse-label">Blocked Deps</span>
                <span className="pulse-value">{blockedDependencyCount}</span>
              </div>
            </div>
          )}
        </div>

        {/* KPI Section */}
        <div className="detail-section">
          <div className="section-header">
            <FaChartLine className="section-icon" />
            <h3 className="section-title">KPI 指標</h3>
          </div>
          {project.kpi_config && project.kpi_config.metrics && project.kpi_config.metrics.length > 0 ? (
            <div className="kpi-grid">
              {project.kpi_config.metrics.map((metric, index) => {
                const current = metric.current ?? 0;
                const target = metric.target ?? 0;
                const progress = computeKpiProgress(metric);
                return (
                  <div key={index} className="kpi-card">
                    <div className="kpi-info">
                      <span className="kpi-name">{metric.label}</span>
                      <div className="kpi-values">
                        <span className="kpi-current">{current}</span>
                        <span className="kpi-target">/ {target}</span>
                        <span className="kpi-unit">{metric.unit}</span>
                      </div>
                    </div>
                    <div className="kpi-progress-container">
                      <div className="kpi-progress-bar">
                        <div
                          className="kpi-progress-fill"
                          style={{ width: `${progress}%` }}
                        ></div>
                      </div>
                      <span className="kpi-percentage">{Math.round(progress)}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="no-data-text">KPIは設定されていません。</p>
          )}
        </div>

        {/* Check-ins Section - Moved to Summary Grid */}
        <div className="detail-section checkins-section">
          <div className="section-header">
            <FaBookOpen className="section-icon" />
            <h3 className="section-title">Check-ins</h3>
          </div>
          <div className="checkin-actions">
            {/* V2 Check-in Button (Primary) */}
            <button
              type="button"
              className="checkin-btn primary"
              onClick={() => setShowCheckinForm(true)}
              disabled={!members.length || showCheckinForm}
            >
              Check-in
            </button>
            {/* Legacy buttons (secondary) */}
            <button
              type="button"
              className="checkin-btn ghost"
              onClick={handleStartWeeklyCheckin}
              disabled={!members.length}
            >
              週次サマリー
            </button>
            <button
              type="button"
              className="checkin-btn ghost"
              onClick={handleStartIssueCheckin}
              disabled={!members.length}
            >
              困りごと
            </button>
          </div>

          {!members.length && (
            <p className="checkin-note">メンバーを追加すると投稿できます。</p>
          )}

          {/* V2 Check-in Form */}
          {showCheckinForm && projectId && (
            <CheckinForm
              projectId={projectId}
              members={members}
              tasks={tasks}
              currentUserId={members[0]?.member_user_id || ''}
              onSubmit={handleSubmitCheckinV2}
              onCancel={() => setShowCheckinForm(false)}
              isSubmitting={isCheckinV2Saving}
            />
          )}

          {/* Legacy Check-in Editor */}
          {checkinMode && !showCheckinForm && (
            <div className="checkin-editor">
              <div className="checkin-row">
                <label className="checkin-label" htmlFor="checkin-member">
                  投稿者
                </label>
                <select
                  id="checkin-member"
                  className="checkin-select"
                  value={selectedCheckinMemberId}
                  onChange={(e) => setSelectedCheckinMemberId(e.target.value)}
                >
                  {members.map((member) => (
                    <option key={member.id} value={member.member_user_id}>
                      {member.member_display_name || member.member_user_id}
                    </option>
                  ))}
                </select>
              </div>
              <textarea
                className="checkin-textarea"
                rows={5}
                value={checkinText}
                onChange={(e) => setCheckinText(e.target.value)}
                placeholder={checkinMode === 'weekly'
                  ? '週次サマリーの内容を調整してください'
                  : '困りごとや議論したいことを入力してください'}
              />
              {checkinError && <p className="checkin-error">{checkinError}</p>}
              <div className="checkin-editor-actions">
                <button
                  type="button"
                  className="checkin-btn ghost"
                  onClick={() => {
                    setCheckinMode(null);
                    setCheckinText('');
                  }}
                  disabled={isCheckinSaving}
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  className="checkin-btn primary"
                  onClick={handleSubmitCheckin}
                  disabled={isCheckinSaving}
                >
                  {isCheckinSaving ? '保存中...' : '保存'}
                </button>
              </div>
            </div>
          )}

          <div className="checkin-list">
            {checkins.length === 0 ? (
              <p className="checkin-empty">まだチェックインはありません。</p>
            ) : (
              checkins.map((checkin) => {
                const name = memberLabelById[checkin.member_user_id] || checkin.member_user_id;
                const preview = checkin.raw_text;
                return (
                  <div key={checkin.id} className="checkin-item">
                    <div className="checkin-meta">
                      <span className="checkin-date">{formatCheckinDate(checkin.checkin_date)}</span>
                      <span className="checkin-author">{name}</span>
                    </div>
                    <p className="checkin-preview">{preview}</p>
                  </div>
                );
              })
            )}
          </div>

          <div className="checkin-summary">
            <div className="checkin-summary-header">Check-in Summary</div>
            <div className="checkin-summary-controls">
              <label className="checkin-summary-field">
                <span>From</span>
                <input
                  type="date"
                  className="checkin-summary-input"
                  value={checkinSummaryStart}
                  onChange={(e) => setCheckinSummaryStart(e.target.value)}
                />
              </label>
              <label className="checkin-summary-field">
                <span>To</span>
                <input
                  type="date"
                  className="checkin-summary-input"
                  value={checkinSummaryEnd}
                  onChange={(e) => setCheckinSummaryEnd(e.target.value)}
                />
              </label>
              <button
                type="button"
                className="checkin-btn primary"
                onClick={handleSummarizeCheckins}
                disabled={isCheckinSummaryLoading}
              >
                {isCheckinSummaryLoading ? 'Summarizing...' : 'Summarize'}
              </button>
            </div>
            {checkinSummaryError && <p className="checkin-error">{checkinSummaryError}</p>}
            {checkinSummary && (
              <div className="checkin-summary-result">
                <div className="checkin-summary-meta">
                  {checkinSummary.checkin_count} posts
                </div>
                {checkinSummary.summary_error && (
                  <div className="checkin-summary-warning">
                    LLM error: {checkinSummary.summary_error}
                    {checkinSummary.summary_error_detail ? ` (${checkinSummary.summary_error_detail})` : ''}
                  </div>
                )}
                {(checkinSummary.summary_debug_prompt || checkinSummary.summary_debug_output) && (
                  <div className="checkin-summary-debug">
                    {checkinSummary.summary_debug_prompt && (
                      <div className="checkin-summary-debug-block">
                        <div className="checkin-summary-debug-title">Prompt (debug)</div>
                        <pre>{checkinSummary.summary_debug_prompt}</pre>
                      </div>
                    )}
                    {checkinSummary.summary_debug_output && (
                      <div className="checkin-summary-debug-block">
                        <div className="checkin-summary-debug-title">LLM output (debug)</div>
                        <pre>{checkinSummary.summary_debug_output}</pre>
                      </div>
                    )}
                  </div>
                )}
                <div className="checkin-summary-text">
                  {checkinSummary.summary_text || 'No check-ins in range.'}
                </div>
                <div className="checkin-summary-actions">
                  <button
                    type="button"
                    className="checkin-btn ghost"
                    onClick={handleSaveCheckinSummary}
                    disabled={isCheckinSummarySaving || !checkinSummary.summary_text}
                  >
                    {isCheckinSummarySaving ? '保存中...' : '保存する'}
                  </button>
                  {checkinSummarySaveStatus && (
                    <span className="checkin-summary-status">{checkinSummarySaveStatus}</span>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="checkin-saved">
            <div className="checkin-summary-header">Saved Summaries</div>
            {isSavedCheckinSummariesLoading && (
              <p className="checkin-note">読み込み中...</p>
            )}
            {savedCheckinSummariesError && (
              <p className="checkin-error">{savedCheckinSummariesError}</p>
            )}
            {!isSavedCheckinSummariesLoading && !savedCheckinSummariesError && savedCheckinSummaries.length === 0 && (
              <p className="checkin-empty">保存したサマリーはありません。</p>
            )}
            {!isSavedCheckinSummariesLoading && savedCheckinSummaries.length > 0 && (
              <div className="checkin-saved-list">
                {savedCheckinSummaries.map((memory) => {
                  const rangeLabel = getTagValue(memory.tags, 'range:') || '期間不明';
                  const countLabel = getTagValue(memory.tags, 'count:');
                  return (
                    <details key={memory.id} className="checkin-saved-item">
                      <summary className="checkin-saved-summary">
                        <span>{rangeLabel}</span>
                        <span className="checkin-saved-meta">
                          {countLabel ? `${countLabel}件` : ''}
                          {memory.created_at ? `・${formatMemoryDate(memory.created_at)}` : ''}
                        </span>
                      </summary>
                      <pre>{memory.content}</pre>
                    </details>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>



      <div className="project-details-grid">
        <div className="details-main-column">
          {/* Context/README Section */}
          <div className="detail-section">
            <div className="section-header">
              <FaBookOpen className="section-icon" />
              <h3 className="section-title">README / コンテキスト</h3>
            </div>
            {project.context ? (
              <div className="context-content markdown-body">
                <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
                  {project.context}
                </ReactMarkdown>
              </div>
            ) : (
              <p className="no-data-text">コンテキスト情報はありません。</p>
            )}
          </div>
        </div>

        <div className="details-side-column">
          <div className="detail-section meeting-list-section">
            <div className="section-header">
              <FaCalendarAlt className="section-icon" />
              <h3 className="section-title">会議一覧</h3>
            </div>
            {meetingTasks.length === 0 ? (
              <p className="no-data-text">会議タスクはまだありません。</p>
            ) : (
              <div className="meeting-list">
                {meetingTasks.slice(0, 6).map((meeting) => {
                  const hasNotes = Boolean(meeting.meeting_notes && meeting.meeting_notes.trim());
                  return (
                    <div
                      key={meeting.id}
                      className="meeting-item"
                      onClick={() => taskModal.openTaskDetail(meeting)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          taskModal.openTaskDetail(meeting);
                        }
                      }}
                    >
                      <div className="meeting-item-main">
                        <div className="meeting-item-title">{meeting.title}</div>
                        <div className="meeting-item-meta">
                          <span>{formatMeetingDateTime(meeting.start_time)}</span>
                          {meeting.location && <span>{meeting.location}</span>}
                        </div>
                        <span className={`meeting-note-tag ${hasNotes ? 'has-notes' : ''}`}>
                          {hasNotes ? '議事録あり' : '議事録未入力'}
                        </span>
                      </div>
                      <div className="meeting-item-actions">
                        <button
                          type="button"
                          className="meeting-note-btn"
                          onClick={(event) => {
                            event.stopPropagation();
                            taskModal.openEditForm(meeting);
                          }}
                        >
                          議事録を入力
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {meetingTasks.length > 6 && (
              <p className="meeting-list-note">表示は直近6件までです。</p>
            )}
          </div>

          <RecurringMeetingsPanel projectId={projectId!} />

          <div className="detail-section members-section">
            <div className="section-header">
              <FaUsers className="section-icon" />
              <h3 className="section-title">Members</h3>
            </div>
            {isCollabLoading ? (
              <div className="members-loading">Loading...</div>
            ) : (
              <>
                <div className="members-invite">
                  <div className="members-invite-row">
                    <div
                      className={`members-invite-select-wrap ${isInviteMenuOpen ? 'is-open' : ''}`}
                      ref={inviteMenuRef}
                    >
                      <button
                        type="button"
                        className="members-invite-select"
                        onClick={() => setInviteMenuOpen((prev) => !prev)}
                        aria-haspopup="listbox"
                        aria-expanded={isInviteMenuOpen}
                        disabled={isInviting}
                      >
                        {inviteMode === 'email' ? 'Email' : 'ユーザー検索'}
                      </button>
                      {isInviteMenuOpen && (
                        <div className="members-invite-menu" role="listbox">
                          <button
                            type="button"
                            className={`members-invite-option ${inviteMode === 'email' ? 'active' : ''}`}
                            onClick={() => {
                              setInviteMode('email');
                              setInviteMenuOpen(false);
                            }}
                            role="option"
                            aria-selected={inviteMode === 'email'}
                          >
                            Email
                          </button>
                          <button
                            type="button"
                            className={`members-invite-option ${inviteMode === 'user_id' ? 'active' : ''}`}
                            onClick={() => {
                              setInviteMode('user_id');
                              setInviteMenuOpen(false);
                            }}
                            role="option"
                            aria-selected={inviteMode === 'user_id'}
                          >
                            ユーザー検索
                          </button>
                        </div>
                      )}
                    </div>
                    {inviteMode === 'email' ? (
                      <>
                        <input
                          className="members-input"
                          type="text"
                          placeholder="member@example.com"
                          value={inviteValue}
                          onChange={(e) => setInviteValue(e.target.value)}
                          disabled={isInviting}
                        />
                        <button
                          type="button"
                          className="members-invite-btn"
                          onClick={handleInvite}
                          disabled={!inviteValue.trim() || isInviting}
                        >
                          招待
                        </button>
                      </>
                    ) : (
                      <UserSearchInput
                        placeholder="ユーザー名またはメールで検索..."
                        disabled={isInviting}
                        onSelect={async (user: UserSearchResult) => {
                          if (!projectId) return;
                          setIsInviting(true);
                          try {
                            await projectsApi.addMember(projectId, { member_user_id: user.id });
                            const [membersData, invitationsData] = await Promise.all([
                              projectsApi.listMembers(projectId),
                              projectsApi.listInvitations(projectId),
                            ]);
                            setMembers(membersData);
                            setInvitations(invitationsData);
                          } catch (err) {
                            console.error('Failed to add member:', err);
                            alert('メンバー追加に失敗しました');
                          } finally {
                            setIsInviting(false);
                          }
                        }}
                      />
                    )}
                  </div>
                  <p className="members-invite-note">
                    {inviteMode === 'email'
                      ? 'メールアドレスで招待します。'
                      : 'ユーザー名またはメールで検索して追加します。'}
                  </p>
                </div>

                {members.length === 0 ? (
                  <div className="members-empty">No members yet.</div>
                ) : (
                  <div className="members-list">
                    {members.map((member) => (
                      <div key={member.id} className="member-chip">
                        <div className="member-info">
                          <span className="member-name">
                            {member.member_display_name || member.member_user_id}
                          </span>
                          <span className="member-id">{member.member_user_id}</span>
                        </div>
                        <div className="member-actions">
                          <select
                            className="member-role-select"
                            value={member.role}
                            onChange={(e) => handleMemberRoleChange(member.id, e.target.value as ProjectMember['role'])}
                            disabled={memberActionId === member.id}
                          >
                            <option value="OWNER">OWNER</option>
                            <option value="ADMIN">ADMIN</option>
                            <option value="MEMBER">MEMBER</option>
                          </select>
                          <button
                            type="button"
                            className="member-remove-btn"
                            onClick={() => handleRemoveMember(member.id)}
                            disabled={memberActionId === member.id}
                          >
                            削除
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {pendingInvitations.length > 0 && (
                  <div className="members-invitations">
                    <p className="invitations-title">Pending Invitations</p>
                    <p className="invitations-note">承諾は招待リンクから行います。</p>
                    <div className="invitations-list">
                      {pendingInvitations.map((invitation) => (
                        <div key={invitation.id} className="invitation-item">
                          <div className="invitation-main">
                            <span className="invitation-email">{invitation.email}</span>
                            <span className={`invitation-status status-${invitation.status.toLowerCase()}`}>
                              {invitation.status}
                            </span>
                          </div>
                          {invitation.token && (
                            <div className="invitation-token-row">
                              <code className="invitation-token" title={invitation.token}>
                                {invitation.token}
                              </code>
                              <button
                                type="button"
                                className="invitation-btn primary"
                                onClick={() => handleCopyInviteLink(invitation.token as string, invitation.email)}
                              >
                                リンクコピー
                              </button>
                            </div>
                          )}
                          <div className="invitation-actions">
                            <button
                              type="button"
                              className="invitation-btn ghost"
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
              </>
            )}
          </div>
        </div>
      </div>


      <div className="project-schedule-section">
        <ScheduleOverviewCard
          projectId={projectId!}
          projectTasks={tasks}
          title={`${project.name}\u306e\u30b9\u30b1\u30b8\u30e5\u30fc\u30eb`}
          tag="\u30d7\u30ed\u30b8\u30a7\u30af\u30c8"
          onTaskClick={taskModal.openTaskDetailById}
        />
      </div>

      {/* Achievements Section */}
      <div className="project-achievements-wrapper">
        <ProjectAchievementsSection projectId={projectId!} />
      </div>

      {/* Tasks Section */}
      <div className="tasks-section">
        <h2 className="section-title">タスクボード</h2>
        {tasksLoading ? (
          <div className="loading-state">タスクを読み込み中...</div>
        ) : (
          <ProjectTasksView
            projectId={projectId!}
            tasks={tasks.filter(t => !t.is_fixed_time)}
            onUpdateTask={(id: string, status: TaskStatus) => {
              updateTask(id, { status });
              refetchTasks();
            }}
            onTaskClick={taskModal.openTaskDetail}
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

      {/* Project Edit Modal */}
      {showEditModal && (
        <ProjectDetailModal
          project={project}
          onClose={() => setShowEditModal(false)}
          onUpdate={handleUpdate}
        />
      )}

      {/* Task Modals (via unified hook) */}
      {taskModal.renderModals()}
    </motion.div>
  );
}
