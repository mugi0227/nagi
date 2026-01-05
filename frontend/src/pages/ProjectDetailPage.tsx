import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FaArrowLeft, FaStar, FaEdit, FaCheckCircle, FaBullseye, FaChartLine, FaLightbulb, FaBookOpen, FaUsers, FaHeartbeat } from 'react-icons/fa';
import { motion } from 'framer-motion';
import { getProject, projectsApi } from '../api/projects';
import { tasksApi } from '../api/tasks';
import { useTasks } from '../hooks/useTasks';
import { KanbanBoard } from '../components/tasks/KanbanBoard';
import { ProjectDetailModal } from '../components/projects/ProjectDetailModal';
import { TaskDetailModal } from '../components/tasks/TaskDetailModal';
import { TaskFormModal } from '../components/tasks/TaskFormModal';
import type { Blocker, ProjectInvitation, ProjectMember, ProjectWithTaskCount, Task, TaskAssignment, TaskStatus } from '../api/types';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import './ProjectDetailPage.css';

export function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<ProjectWithTaskCount | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [openedParentTask, setOpenedParentTask] = useState<Task | null>(null);
  const [taskToEdit, setTaskToEdit] = useState<Task | null>(null);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [assignments, setAssignments] = useState<TaskAssignment[]>([]);
  const [blockers, setBlockers] = useState<Blocker[]>([]);
  const [invitations, setInvitations] = useState<ProjectInvitation[]>([]);
  const [isCollabLoading, setIsCollabLoading] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [isInviting, setIsInviting] = useState(false);
  const [memberActionId, setMemberActionId] = useState<string | null>(null);
  const [invitationActionId, setInvitationActionId] = useState<string | null>(null);

  // Fetch tasks for this project
  const { tasks, isLoading: tasksLoading, refetch: refetchTasks, updateTask } = useTasks(projectId);

  // Fetch project details
  useEffect(() => {
    if (!projectId) return;

    const fetchProject = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const data = await getProject(projectId);
        setProject(data);
      } catch (err) {
        console.error('Failed to fetch project:', err);
        setError('プロジェクトの取得に失敗しました');
      } finally {
        setIsLoading(false);
      }
    };

    fetchProject();
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;

    const fetchCollaboration = async () => {
      setIsCollabLoading(true);
      try {
        const [membersData, assignmentsData, blockersData, invitationsData] = await Promise.all([
          projectsApi.listMembers(projectId),
          projectsApi.listAssignments(projectId),
          projectsApi.listBlockers(projectId),
          projectsApi.listInvitations(projectId),
        ]);
        setMembers(membersData);
        setAssignments(assignmentsData);
        setBlockers(blockersData);
        setInvitations(invitationsData);
      } catch (err) {
        console.error('Failed to fetch collaboration data:', err);
      } finally {
        setIsCollabLoading(false);
      }
    };

    fetchCollaboration();
  }, [projectId]);

  const handleTaskClick = (task: Task) => {
    if (task.parent_id) {
      const parent = tasks.find(t => t.id === task.parent_id);
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
          <button className="back-button" onClick={() => navigate('/projects')}>
            プロジェクト一覧へ戻る
          </button>
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

  const completionRate = project.total_tasks > 0
    ? Math.round((project.completed_tasks / project.total_tasks) * 100)
    : 0;

  const memberLabelById: Record<string, string> = {};
  members.forEach((member) => {
    memberLabelById[member.member_user_id] = member.member_display_name || member.member_user_id;
  });

  const assigneeByTaskId: Record<string, string> = {};
  assignments.forEach((assignment) => {
    assigneeByTaskId[assignment.task_id] = memberLabelById[assignment.assignee_id] || assignment.assignee_id;
  });

  const assignedMemberIdByTaskId: Record<string, string> = {};
  assignments.forEach((assignment) => {
    assignedMemberIdByTaskId[assignment.task_id] = assignment.assignee_id;
  });

  const memberOptions = members.map((member) => ({
    id: member.member_user_id,
    label: member.member_display_name || member.member_user_id,
  }));

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

  const kpiProgress = (() => {
    const metrics = project?.kpi_config?.metrics ?? [];
    const valid = metrics.filter(metric => typeof metric.target === 'number' && metric.target > 0);
    if (!valid.length) {
      return null;
    }
    const total = valid.reduce((sum, metric) => {
      const target = metric.target ?? 1;
      const current = metric.current ?? 0;
      return sum + Math.min(current / target, 1);
    }, 0);
    return Math.round((total / valid.length) * 100);
  })();

  const pendingInvitations = invitations.filter((invitation) => invitation.status === 'PENDING');

  const handleAssign = async (taskId: string, memberUserId: string | null) => {
    if (!projectId) return;
    try {
      if (memberUserId) {
        const assignment = await tasksApi.assignTask(taskId, { assignee_id: memberUserId });
        setAssignments((prev) => {
          const filtered = prev.filter((item) => item.task_id !== taskId);
          return [...filtered, assignment];
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
    const email = inviteEmail.trim();
    if (!email) return;
    setIsInviting(true);
    try {
      await projectsApi.createInvitation(projectId, { email });
      const [membersData, invitationsData] = await Promise.all([
        projectsApi.listMembers(projectId),
        projectsApi.listInvitations(projectId),
      ]);
      setMembers(membersData);
      setInvitations(invitationsData);
      setInviteEmail('');
    } catch (err) {
      console.error('Failed to invite member:', err);
      alert('招待の作成に失敗しました');
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

      {/* Hero Section */}
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
        </div>
      </div>

      <div className="project-details-grid">
        <div className="details-main-column">
          {/* Goals Section */}
          {project.goals && project.goals.length > 0 && (
            <div className="detail-section">
              <div className="section-header">
                <FaBullseye className="section-icon" />
                <h3 className="section-title">プロジェクト目標</h3>
              </div>
              <ul className="goals-list">
                {project.goals.map((goal, index) => (
                  <li key={index} className="goal-item">
                    <FaCheckCircle className="goal-icon" />
                    {goal}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Context/README Section */}
          {project.context && (
            <div className="detail-section">
              <div className="section-header">
                <FaBookOpen className="section-icon" />
                <h3 className="section-title">README / コンテキスト</h3>
              </div>
              <div className="context-content markdown-body">
                <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
                  {project.context}
                </ReactMarkdown>
              </div>
            </div>
          )}
        </div>

        <div className="details-side-column">
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
                  <span className="pulse-label">KPI Progress</span>
                  <span className="pulse-value emphasis">
                    {kpiProgress === null ? '-' : `${kpiProgress}%`}
                  </span>
                </div>
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
                  <input
                    className="members-input"
                    type="email"
                    placeholder="member@example.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                  />
                  <button
                    type="button"
                    className="members-invite-btn"
                    onClick={handleInvite}
                    disabled={!inviteEmail.trim() || isInviting}
                  >
                    招待
                  </button>
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
                                onClick={() => handleCopyInviteLink(invitation.token as string)}
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

          {/* KPI Section */}
          {project.kpi_config && project.kpi_config.metrics && project.kpi_config.metrics.length > 0 && (
            <div className="detail-section">
              <div className="section-header">
                <FaChartLine className="section-icon" />
                <h3 className="section-title">KPI 指標</h3>
              </div>
              <div className="kpi-grid">
                {project.kpi_config.metrics.map((metric, index) => {
                  const current = metric.current ?? 0;
                  const target = metric.target ?? 0;
                  const progress = target > 0
                    ? Math.min((current / target) * 100, 100)
                    : 0;
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
            </div>
          )}

          {/* Key Points Section */}
          {project.key_points && project.key_points.length > 0 && (
            <div className="detail-section">
              <div className="section-header">
                <FaLightbulb className="section-icon" />
                <h3 className="section-title">重要なポイント</h3>
              </div>
              <ul className="key-points-list">
                {project.key_points.map((point, index) => (
                  <li key={index} className="key-point-item">{point}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Tasks Section */}
      <div className="tasks-section">
        <h2 className="section-title">タスクボード</h2>
        {tasksLoading ? (
          <div className="loading-state">タスクを読み込み中...</div>
        ) : (
          <KanbanBoard
            tasks={tasks}
            onUpdateTask={(id: string, status: TaskStatus) => {
              updateTask(id, { status });
              refetchTasks();
            }}
            onTaskClick={handleTaskClick}
            assigneeByTaskId={assigneeByTaskId}
            assignedMemberIdByTaskId={assignedMemberIdByTaskId}
            memberOptions={memberOptions}
            onAssign={handleAssign}
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

      {/* Task Detail Modal */}
      {selectedTask && (
        <TaskDetailModal
          task={openedParentTask || selectedTask}
          subtasks={tasks.filter(t => t.parent_id === (openedParentTask?.id || selectedTask.id))}
          allTasks={tasks}
          initialSubtask={openedParentTask ? selectedTask : null}
          onClose={() => {
            setSelectedTask(null);
            setOpenedParentTask(null);
          }}
          onEdit={(task) => {
            // Open task edit modal
            setTaskToEdit(task);
          }}
          onProgressChange={(taskId, progress) => {
            updateTask(taskId, { progress });
          }}
        />
      )}

      {/* Task Edit Modal */}
      {taskToEdit && (
        <TaskFormModal
          task={taskToEdit}
          projectId={projectId}
          onClose={() => setTaskToEdit(null)}
          onSuccess={() => {
            setTaskToEdit(null);
            refetchTasks();
          }}
        />
      )}
    </motion.div>
  );
}
