import { useCallback, useEffect, useState } from 'react';
import { FaList, FaChartBar } from 'react-icons/fa';
import { phasesApi } from '../../api/phases';
import { KanbanBoard } from '../tasks/KanbanBoard';
import { PhaseList } from '../phases/PhaseList';
import type { PhaseCreate, PhaseUpdate, PhaseWithTaskCount, Task, TaskStatus } from '../../api/types';
import './ProjectTasksView.css';

type ViewMode = 'kanban' | 'gantt';

interface ProjectTasksViewProps {
  projectId: string;
  tasks: Task[];
  onUpdateTask: (id: string, status: TaskStatus) => void;
  onTaskClick: (task: Task) => void;
  assigneeByTaskId: Record<string, string>;
  assignedMemberIdByTaskId: Record<string, string>;
  memberOptions: { id: string; label: string }[];
  onAssign: (taskId: string, memberUserId: string | null) => Promise<void>;
}

export function ProjectTasksView({
  projectId,
  tasks,
  onUpdateTask,
  onTaskClick,
  assigneeByTaskId,
  assignedMemberIdByTaskId,
  memberOptions,
  onAssign,
}: ProjectTasksViewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('kanban');
  const [phases, setPhases] = useState<PhaseWithTaskCount[]>([]);
  const [isPhasesLoading, setIsPhasesLoading] = useState(false);
  const [showPhaseManager, setShowPhaseManager] = useState(false);

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

  useEffect(() => {
    fetchPhases();
  }, [fetchPhases]);

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

  return (
    <div className="project-tasks-view">
      {/* View Controls */}
      <div className="view-controls">
        <div className="view-mode-tabs">
          <button
            className={`tab ${viewMode === 'kanban' ? 'active' : ''}`}
            onClick={() => setViewMode('kanban')}
          >
            <FaList /> カンバンボード
          </button>
          <button
            className={`tab ${viewMode === 'gantt' ? 'active' : ''}`}
            onClick={() => setViewMode('gantt')}
          >
            <FaChartBar /> ガントチャート
          </button>
        </div>

        <button
          className="phase-manager-btn"
          onClick={() => setShowPhaseManager(!showPhaseManager)}
          disabled={isPhasesLoading}
        >
          {isPhasesLoading
            ? 'Loading...'
            : (showPhaseManager ? 'Close phase manager' : 'Open phase manager')}
        </button>
      </div>

      {/* Phase Manager */}
      {showPhaseManager && (
        <div className="phase-manager-section">
          <PhaseList
            phases={phases}
            onCreatePhase={handleCreatePhase}
            onUpdatePhase={handleUpdatePhase}
            onDeletePhase={handleDeletePhase}
            projectId={projectId}
          />
        </div>
      )}

      {/* Task View */}
      <div className="task-view-container">
        {viewMode === 'kanban' ? (
          <KanbanBoard
            tasks={tasks}
            onUpdateTask={onUpdateTask}
            onTaskClick={onTaskClick}
            assigneeByTaskId={assigneeByTaskId}
            assignedMemberIdByTaskId={assignedMemberIdByTaskId}
            memberOptions={memberOptions}
            onAssign={onAssign}
          />
        ) : (
          <div className="gantt-placeholder">
            <p>ガントチャート表示（実装予定）</p>
            <p className="text-muted">
              フェーズごとにタスクをグループ化したガントチャートを表示します
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
