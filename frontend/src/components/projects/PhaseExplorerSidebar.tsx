import { FaChevronRight, FaFolder, FaFolderOpen, FaInbox } from 'react-icons/fa';
import type { PhaseWithTaskCount, Task } from '../../api/types';
import './PhaseExplorerSidebar.css';

interface PhaseExplorerSidebarProps {
  phases: PhaseWithTaskCount[];
  tasks: Task[];
  selectedPhaseId: string | null; // null = 未割当
  onSelectPhase: (phaseId: string | null) => void;
  selectedTaskIds: Set<string>;
  onMoveTasksToPhase: (phaseId: string | null) => void;
  isDraggingTasks: boolean;
  onDragOverPhase: (phaseId: string | null) => void;
  dragOverPhaseId: string | null;
  // Single task drag
  draggingTaskId: string | null;
  onMoveSingleTaskToPhase: (taskId: string, phaseId: string | null) => void;
}

export function PhaseExplorerSidebar({
  phases,
  tasks,
  selectedPhaseId,
  onSelectPhase,
  selectedTaskIds,
  onMoveTasksToPhase,
  isDraggingTasks,
  onDragOverPhase,
  dragOverPhaseId,
  draggingTaskId,
  onMoveSingleTaskToPhase,
}: PhaseExplorerSidebarProps) {
  // Count tasks by phase
  const unassignedCount = tasks.filter(t => !t.phase_id && !t.parent_id).length;
  const taskCountByPhaseId: Record<string, number> = {};
  phases.forEach(phase => {
    taskCountByPhaseId[phase.id] = tasks.filter(t => t.phase_id === phase.id && !t.parent_id).length;
  });

  const sortedPhases = [...phases].sort((a, b) => a.order_in_project - b.order_in_project);

  const handleDragOver = (e: React.DragEvent, phaseId: string | null) => {
    e.preventDefault();
    onDragOverPhase(phaseId);
  };

  const handleDragLeave = () => {
    onDragOverPhase(null);
  };

  const handleDrop = (e: React.DragEvent, phaseId: string | null) => {
    e.preventDefault();
    onDragOverPhase(null);
    if (selectedTaskIds.size > 0) {
      // Multi-select drag
      onMoveTasksToPhase(phaseId);
    } else if (draggingTaskId) {
      // Single task drag
      onMoveSingleTaskToPhase(draggingTaskId, phaseId);
    }
  };

  // Show drag highlight for both multi-select and single task drag
  const isDragging = isDraggingTasks || draggingTaskId !== null;

  return (
    <div className="phase-explorer-sidebar">
      <div className="phase-explorer-header">
        <span className="phase-explorer-title">フェーズ</span>
      </div>

      <div className="phase-explorer-list">
        {/* Unassigned */}
        <div
          className={`phase-explorer-item ${selectedPhaseId === null ? 'active' : ''} ${isDragging && dragOverPhaseId === null ? 'drag-over' : ''}`}
          onClick={() => onSelectPhase(null)}
          onDragOver={(e) => handleDragOver(e, null)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, null)}
        >
          <span className="phase-explorer-icon">
            <FaInbox />
          </span>
          <span className="phase-explorer-name">未割当</span>
          <span className="phase-explorer-count">{unassignedCount}</span>
        </div>

        {/* Phases */}
        {sortedPhases.map((phase) => {
          const isActive = selectedPhaseId === phase.id;
          const isDragOver = isDragging && dragOverPhaseId === phase.id;
          return (
            <div
              key={phase.id}
              className={`phase-explorer-item ${isActive ? 'active' : ''} ${isDragOver ? 'drag-over' : ''}`}
              onClick={() => onSelectPhase(phase.id)}
              onDragOver={(e) => handleDragOver(e, phase.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, phase.id)}
            >
              <span className="phase-explorer-icon">
                {isActive ? <FaFolderOpen /> : <FaFolder />}
              </span>
              <span className="phase-explorer-name">{phase.name}</span>
              <span className="phase-explorer-count">{taskCountByPhaseId[phase.id] || 0}</span>
              {isActive && <FaChevronRight className="phase-explorer-active-indicator" />}
            </div>
          );
        })}
      </div>

      {/* Selection Summary */}
      {selectedTaskIds.size > 0 && (
        <div className="phase-explorer-selection">
          <div className="selection-count">{selectedTaskIds.size}件選択中</div>
          <div className="selection-hint">フェーズにドラッグで移動</div>
        </div>
      )}
    </div>
  );
}
