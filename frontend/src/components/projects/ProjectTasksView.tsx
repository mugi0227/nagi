import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { milestonesApi } from '../../api/milestones';
import { phasesApi } from '../../api/phases';
import { projectsApi } from '../../api/projects';
import { tasksApi } from '../../api/tasks';
import type {
  Milestone,
  MilestoneCreate,
  MilestoneUpdate,
  PhaseCreate,
  PhaseUpdate,
  PhaseWithTaskCount,
  Task,
  TaskStatus,
} from '../../api/types';
import { PhaseList } from '../phases/PhaseList';
import { KanbanBoard } from '../tasks/KanbanBoard';
import './ProjectTasksView.css';

interface ProjectTasksViewProps {
  projectId: string;
  tasks: Task[];
  onUpdateTask: (id: string, status: TaskStatus) => void;
  onTaskClick: (task: Task) => void;
  onDeleteTask?: (id: string) => void;
  assigneeByTaskId: Record<string, string>;
  assignedMemberIdsByTaskId: Record<string, string[]>;
  memberOptions: { id: string; label: string }[];
  onAssignMultiple: (taskId: string, memberUserIds: string[]) => Promise<void>;
  onRefreshTasks?: () => void;
}

export function ProjectTasksView({
  projectId,
  tasks,
  onUpdateTask,
  onTaskClick,
  onDeleteTask,
  assigneeByTaskId,
  assignedMemberIdsByTaskId,
  memberOptions,
  onAssignMultiple,
  onRefreshTasks,
}: ProjectTasksViewProps) {
  const queryClient = useQueryClient();
  const [phases, setPhases] = useState<PhaseWithTaskCount[]>([]);
  const [isPhasesLoading, setIsPhasesLoading] = useState(false);
  const [showPhaseManager, setShowPhaseManager] = useState(false);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [isMilestonesLoading, setIsMilestonesLoading] = useState(false);
  const [isPlanningPhases, setIsPlanningPhases] = useState(false);
  const [planningPhaseId, setPlanningPhaseId] = useState<string | null>(null);
  const [breakdownTaskId, setBreakdownTaskId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'default' | 'dueDate'>('default');

  const fetchPhases = useCallback(async () => {
    setIsPhasesLoading(true);
    try {
      const data = await phasesApi.listByProject(projectId);
      setPhases(data);
    } catch (error) {
      console.error('Failed to fetch phases:', error);
    } finally {
      setIsPhasesLoading(false);
    }
  }, [projectId]);

  const fetchMilestones = useCallback(async () => {
    setIsMilestonesLoading(true);
    try {
      const data = await milestonesApi.listByProject(projectId);
      setMilestones(data);
    } catch (error) {
      console.error('Failed to fetch milestones:', error);
    } finally {
      setIsMilestonesLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchPhases();
    fetchMilestones();
  }, [fetchPhases, fetchMilestones]);

  const handleCreatePhase = async (phase: PhaseCreate) => {
    await phasesApi.create(phase);
    await fetchPhases();
  };

  const handleUpdatePhase = async (id: string, phase: PhaseUpdate) => {
    await phasesApi.update(id, phase);
    await fetchPhases();
  };

  const handleDeletePhase = async (id: string) => {
    await phasesApi.delete(id);
    await fetchPhases();
  };

  const handleCreateMilestone = async (milestone: MilestoneCreate) => {
    await milestonesApi.create(milestone);
    await fetchMilestones();
  };

  const handleUpdateMilestone = async (id: string, milestone: MilestoneUpdate) => {
    await milestonesApi.update(id, milestone);
    await fetchMilestones();
  };

  const handleDeleteMilestone = async (id: string) => {
    await milestonesApi.delete(id);
    await fetchMilestones();
  };

  const handleGeneratePhases = async (instruction?: string) => {
    setIsPlanningPhases(true);
    try {
      await projectsApi.breakdownPhases(projectId, {
        create_phases: true,
        create_milestones: true,
        instruction,
      });
      await fetchPhases();
      await fetchMilestones();
    } catch (error) {
      console.error('Failed to generate phases:', error);
      alert('フェーズの生成に失敗しました。');
    } finally {
      setIsPlanningPhases(false);
    }
  };

  const handleGeneratePhaseTasks = async (phaseId: string, instruction?: string) => {
    setPlanningPhaseId(phaseId);
    try {
      await phasesApi.breakdownTasks(phaseId, { create_tasks: true, instruction });
      onRefreshTasks?.();
    } catch (error) {
      console.error('Failed to generate phase tasks:', error);
      alert('このフェーズのタスク分解に失敗しました。');
    } finally {
      setPlanningPhaseId(null);
    }
  };

  const breakdownMutation = useMutation({
    mutationFn: ({ id, instruction }: { id: string; instruction?: string }) =>
      tasksApi.breakdownTask(id, { create_subtasks: true, instruction }),
    onMutate: ({ id }) => {
      setBreakdownTaskId(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['top3'] });
      queryClient.invalidateQueries({ queryKey: ['today-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['schedule'] });
      queryClient.invalidateQueries({ queryKey: ['subtasks'] });
      onRefreshTasks?.();
    },
    onError: () => {
      alert('タスク分解に失敗しました。');
    },
    onSettled: () => {
      setBreakdownTaskId(null);
    },
  });

  const handleBreakdownTask = (id: string, instruction?: string) => {
    breakdownMutation.mutate({ id, instruction });
  };

  return (
    <div className="project-tasks-view">
      {/* View Controls */}
      <div className="view-controls">
        <select
          className="sort-select"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as 'default' | 'dueDate')}
          style={{ marginRight: '1rem', padding: '0.5rem', borderRadius: '6px', border: '1px solid #ccc' }}
        >
          <option value="default">デフォルト順</option>
          <option value="dueDate">期限が近い順</option>
        </select>
        <button
          className="phase-manager-btn"
          onClick={() => setShowPhaseManager(!showPhaseManager)}
          disabled={isPhasesLoading}
        >
          {isPhasesLoading
            ? '読み込み中...'
            : (showPhaseManager ? 'フェーズ管理を閉じる' : 'フェーズ管理を開く')}
        </button>
      </div>

      {/* Phase Manager */}
      {showPhaseManager && (
        <div className="phase-manager-section">
          <PhaseList
            phases={phases}
            milestones={milestones}
            isMilestonesLoading={isMilestonesLoading}
            onCreatePhase={handleCreatePhase}
            onUpdatePhase={handleUpdatePhase}
            onDeletePhase={handleDeletePhase}
            onCreateMilestone={handleCreateMilestone}
            onUpdateMilestone={handleUpdateMilestone}
            onDeleteMilestone={handleDeleteMilestone}
            onGeneratePhases={handleGeneratePhases}
            onGeneratePhaseTasks={handleGeneratePhaseTasks}
            isPlanningPhases={isPlanningPhases}
            planningPhaseId={planningPhaseId}
            projectId={projectId}
          />
        </div>
      )}

      {/* Task View */}
      <div className="task-view-container">
        <KanbanBoard
          tasks={tasks}
          onUpdateTask={onUpdateTask}
          onTaskClick={onTaskClick}
          onDeleteTask={onDeleteTask}
          assigneeByTaskId={assigneeByTaskId}
          assignedMemberIdsByTaskId={assignedMemberIdsByTaskId}
          memberOptions={memberOptions}
          onAssignMultiple={onAssignMultiple}
          onBreakdownTask={handleBreakdownTask}
          breakdownTaskId={breakdownTaskId}
          sortBy={sortBy}
        />
      </div>
    </div>
  );
}
