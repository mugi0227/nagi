import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { tasksApi } from '../../api/tasks';
import { projectsApi } from '../../api/projects';
import type { Task, TaskAssignment, ProjectMember } from '../../api/types';
import { useTimezone } from '../../hooks/useTimezone';
import { formatDate } from '../../utils/dateTime';
import './CreatedTaskCards.css';

interface CreatedTaskCardsProps {
  taskIds: string[];
  onTaskClick: (taskId: string) => void;
}

export function CreatedTaskCards({ taskIds, onTaskClick }: CreatedTaskCardsProps) {
  const timezone = useTimezone();

  const taskQueries = useQueries({
    queries: taskIds.map((id) => ({
      queryKey: ['task-detail', id],
      queryFn: () => tasksApi.getById(id),
      staleTime: 30_000,
      retry: 1,
    })),
  });

  const tasks = taskQueries
    .map((q) => q.data)
    .filter((t): t is Task => !!t);

  // Fetch assignments for each task
  const assignmentQueries = useQueries({
    queries: tasks.map((t) => ({
      queryKey: ['task-assignments', t.id],
      queryFn: () => tasksApi.listAssignments(t.id),
      staleTime: 30_000,
      retry: 1,
      enabled: tasks.length > 0,
    })),
  });

  // Collect unique project IDs
  const projectIds = useMemo(
    () => [...new Set(tasks.map((t) => t.project_id).filter((id): id is string => !!id))],
    [tasks],
  );

  // Fetch members for each project
  const memberQueries = useQueries({
    queries: projectIds.map((pid) => ({
      queryKey: ['project-members', pid],
      queryFn: () => projectsApi.listMembers(pid),
      staleTime: 5 * 60_000,
      retry: 1,
    })),
  });

  // Build assignee_id → display_name lookup
  const memberMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const q of memberQueries) {
      if (!q.data) continue;
      for (const m of q.data as ProjectMember[]) {
        if (!map.has(m.member_user_id)) {
          map.set(m.member_user_id, m.member_display_name || m.member_user_id);
        }
      }
    }
    return map;
  }, [memberQueries]);

  // Build task_id → assignee names
  const taskAssigneeNames = useMemo(() => {
    const map = new Map<string, string[]>();
    for (let i = 0; i < tasks.length; i++) {
      const assignments = assignmentQueries[i]?.data as TaskAssignment[] | undefined;
      if (!assignments) continue;
      const names = assignments
        .map((a) => memberMap.get(a.assignee_id))
        .filter((n): n is string => !!n);
      if (names.length > 0) {
        map.set(tasks[i].id, names);
      }
    }
    return map;
  }, [tasks, assignmentQueries, memberMap]);

  if (tasks.length === 0 && taskQueries.every((q) => q.isLoading)) {
    return null;
  }

  if (tasks.length === 0) {
    return null;
  }

  return (
    <div className="created-tasks">
      <div className="created-tasks-header">Created tasks</div>
      {tasks.map((task) => {
        const assignees = taskAssigneeNames.get(task.id) || [];
        return (
          <button
            key={task.id}
            className="created-task-card"
            onClick={() => onTaskClick(task.id)}
            type="button"
          >
            <span className={`created-task-priority ${task.importance}`} />
            <span className="created-task-title">{task.title}</span>
            {assignees.length > 0 && (
              <span className="created-task-assignees">
                {assignees.map((name) => (
                  <span key={name} className="created-task-avatar" title={name}>
                    {name.charAt(0)}
                  </span>
                ))}
              </span>
            )}
            <span className="created-task-meta">
              {task.estimated_minutes && `${task.estimated_minutes}min`}
              {task.due_date && (
                <span>
                  {formatDate(task.due_date, { month: 'numeric', day: 'numeric' }, timezone)}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
