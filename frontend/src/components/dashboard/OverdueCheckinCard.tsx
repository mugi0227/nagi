import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTasks } from '../../hooks/useTasks';
import { useProjects } from '../../hooks/useProjects';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import { useTimezone } from '../../hooks/useTimezone';
import { todayInTimezone } from '../../utils/dateTime';
import { projectsApi } from '../../api/projects';
import { CheckinForm } from '../projects/CheckinForm';
import type { Task, ProjectWithTaskCount, ProjectMember, CheckinCreateV2 } from '../../api/types';
import './OverdueCheckinCard.css';

type OverdueProjectGroup = {
  project: ProjectWithTaskCount;
  overdueTasks: (Task & { overdueDays: number })[];
};

interface OverdueCheckinCardProps {
  onTaskClick?: (task: Task) => void;
}

export function OverdueCheckinCard({ onTaskClick }: OverdueCheckinCardProps) {
  const timezone = useTimezone();
  const { tasks } = useTasks();
  const { projects } = useProjects();
  const { data: currentUser } = useCurrentUser();
  const [collapsed, setCollapsed] = useState(false);

  // Check-in modal state
  const [checkinProjectId, setCheckinProjectId] = useState<string | null>(null);
  const [checkinMembers, setCheckinMembers] = useState<ProjectMember[]>([]);
  const [checkinTasks, setCheckinTasks] = useState<Task[]>([]);
  const [isModalClosing, setIsModalClosing] = useState(false);
  const [isCheckinSaving, setIsCheckinSaving] = useState(false);

  const todayStr = useMemo(() => {
    return todayInTimezone(timezone).toISODate() ?? '';
  }, [timezone]);

  // Build a map of TEAM project IDs for quick lookup
  const teamProjectMap = useMemo(() => {
    const map = new Map<string, ProjectWithTaskCount>();
    projects.forEach(p => {
      if (p.visibility === 'TEAM' && p.status === 'ACTIVE') {
        map.set(p.id, p);
      }
    });
    return map;
  }, [projects]);

  // Find overdue tasks in TEAM projects
  const overdueGroups: OverdueProjectGroup[] = useMemo(() => {
    if (!todayStr) return [];

    const grouped = new Map<string, (Task & { overdueDays: number })[]>();

    tasks.forEach(task => {
      if (task.status === 'DONE') return;
      if (!task.project_id) return;
      if (!task.due_date) return;
      if (!teamProjectMap.has(task.project_id)) return;
      if (task.is_fixed_time) return; // skip meetings

      if (task.due_date < todayStr) {
        const dueDateMs = new Date(task.due_date).getTime();
        const todayMs = new Date(todayStr).getTime();
        const overdueDays = Math.floor((todayMs - dueDateMs) / (1000 * 60 * 60 * 24));
        if (overdueDays <= 0) return;

        const list = grouped.get(task.project_id) ?? [];
        list.push({ ...task, overdueDays });
        grouped.set(task.project_id, list);
      }
    });

    const result: OverdueProjectGroup[] = [];
    grouped.forEach((overdueTasks, projectId) => {
      const project = teamProjectMap.get(projectId);
      if (!project) return;
      // Sort by overdue days descending
      overdueTasks.sort((a, b) => b.overdueDays - a.overdueDays);
      result.push({ project, overdueTasks });
    });

    // Sort projects by total overdue tasks descending
    result.sort((a, b) => b.overdueTasks.length - a.overdueTasks.length);
    return result;
  }, [tasks, todayStr, teamProjectMap]);

  const totalOverdue = useMemo(
    () => overdueGroups.reduce((sum, g) => sum + g.overdueTasks.length, 0),
    [overdueGroups],
  );

  // Open check-in modal for a project
  const handleOpenCheckin = useCallback(async (projectId: string) => {
    try {
      const [members, projectTasks] = await Promise.all([
        projectsApi.listMembers(projectId),
        Promise.resolve(tasks.filter(t => t.project_id === projectId && t.status !== 'DONE')),
      ]);
      setCheckinMembers(members);
      setCheckinTasks(projectTasks);
      setCheckinProjectId(projectId);
    } catch (err) {
      console.error('Failed to load project data for check-in:', err);
    }
  }, [tasks]);

  const handleCloseCheckin = useCallback(() => {
    setIsModalClosing(true);
    setTimeout(() => {
      setCheckinProjectId(null);
      setCheckinMembers([]);
      setCheckinTasks([]);
      setIsModalClosing(false);
    }, 300);
  }, []);

  const handleSubmitCheckin = useCallback(async (data: CheckinCreateV2) => {
    if (!checkinProjectId) return;
    setIsCheckinSaving(true);
    try {
      await projectsApi.createCheckinV2(checkinProjectId, data);
      handleCloseCheckin();
    } catch (err) {
      console.error('Failed to create check-in:', err);
      throw err;
    } finally {
      setIsCheckinSaving(false);
    }
  }, [checkinProjectId, handleCloseCheckin]);

  // Close modal on Escape key
  useEffect(() => {
    if (!checkinProjectId) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleCloseCheckin();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [checkinProjectId, handleCloseCheckin]);

  // Don't render if no overdue tasks in TEAM projects
  if (totalOverdue === 0) return null;

  const checkinProject = checkinProjectId
    ? teamProjectMap.get(checkinProjectId)
    : null;

  return (
    <>
      <div className={`overdue-checkin-card ${collapsed ? 'collapsed' : ''}`}>
        {/* Header */}
        <div className="card-header">
          <div className="overdue-checkin-header">
            <h3>Check-in</h3>
            <span className="overdue-checkin-badge">
              {totalOverdue}
            </span>
          </div>
          <button
            type="button"
            className="overdue-checkin-toggle"
            onClick={() => setCollapsed(prev => !prev)}
          >
            {collapsed ? '展開' : '折りたたむ'}
          </button>
        </div>

        {/* Project groups */}
        {overdueGroups.map(({ project, overdueTasks }) => (
          <div key={project.id} className="overdue-project-group">
            <div className="overdue-project-header">
              <div className="overdue-project-name">
                <span>{project.name}</span>
                <span className="overdue-project-count">
                  {overdueTasks.length}
                </span>
              </div>
              <button
                type="button"
                className="overdue-checkin-btn"
                onClick={() => handleOpenCheckin(project.id)}
              >
                Check-in
              </button>
            </div>

            <div className="overdue-task-list">
              {overdueTasks.map(task => (
                <div
                  key={task.id}
                  className="overdue-task-item"
                  onClick={() => onTaskClick?.(task)}
                >
                  <span className="overdue-task-title">{task.title}</span>
                  <span className={`overdue-days-badge ${task.overdueDays >= 7 ? 'serious' : 'mild'}`}>
                    {task.overdueDays}d
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Check-in Modal */}
      {checkinProjectId && currentUser && (
        <div
          className={`overdue-checkin-modal ${isModalClosing ? 'closing' : ''}`}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="overdue-checkin-backdrop"
            onClick={handleCloseCheckin}
          />
          <div className="overdue-checkin-panel">
            <button
              type="button"
              className="overdue-checkin-panel-close"
              onClick={handleCloseCheckin}
              aria-label="Close"
            >
              X
            </button>
            {checkinProject && (
              <div style={{
                background: 'rgba(245, 158, 11, 0.08)',
                borderRadius: '12px 12px 0 0',
                padding: '12px 16px',
                fontSize: '13px',
                color: '#92400e',
                fontWeight: 500,
              }}>
                {checkinProject.name} - 期限超過タスクがあります
              </div>
            )}
            <CheckinForm
              projectId={checkinProjectId}
              members={checkinMembers}
              tasks={checkinTasks}
              currentUserId={currentUser.id}
              onSubmit={handleSubmitCheckin}
              onCancel={handleCloseCheckin}
              isSubmitting={isCheckinSaving}
              compact
            />
          </div>
        </div>
      )}
    </>
  );
}
