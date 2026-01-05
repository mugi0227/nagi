import { useState, useMemo } from 'react';
import { FaTimes, FaFire, FaClock, FaLeaf, FaBatteryFull, FaBatteryQuarter, FaCheckCircle, FaCircle, FaArrowLeft, FaBookOpen, FaEdit, FaLock, FaLockOpen } from 'react-icons/fa';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import type { Task } from '../../api/types';
import { StepNumber } from '../common/StepNumber';
import './TaskDetailModal.css';

interface TaskDetailModalProps {
  task: Task;
  subtasks?: Task[];
  allTasks?: Task[];
  initialSubtask?: Task | null;
  onClose: () => void;
  onEdit?: (task: Task) => void;
  onProgressChange?: (taskId: string, progress: number) => void;
  onTaskCheck?: (taskId: string) => void;
}

// Helper to extract guide from description
function extractGuide(description?: string | null): { mainDescription: string; guide: string } {
  if (!description) return { mainDescription: '', guide: '' };

  // Look for guide separator
  const guideSeparator = '---\n\n## 進め方ガイド';
  const guideStartOnly = '## 進め方ガイド';

  const separatorIndex = description.indexOf(guideSeparator);
  if (separatorIndex !== -1) {
    return {
      mainDescription: description.substring(0, separatorIndex).trim(),
      guide: description.substring(separatorIndex + guideSeparator.length).trim(),
    };
  }

  // Check if it starts with guide directly
  if (description.startsWith(guideStartOnly)) {
    return {
      mainDescription: '',
      guide: description.substring(guideStartOnly.length).trim(),
    };
  }

  return { mainDescription: description, guide: '' };
}

export function TaskDetailModal({
  task,
  subtasks = [],
  allTasks = [],
  initialSubtask = null,
  onClose,
  onEdit,
  onProgressChange,
  onTaskCheck
}: TaskDetailModalProps) {
  const [selectedSubtask, setSelectedSubtask] = useState<Task | null>(initialSubtask);
  const [localProgress, setLocalProgress] = useState<number>(task.progress ?? 0);

  // Sort subtasks by order_in_parent (fallback to title)
  const sortedSubtasks = useMemo(() => {
    return [...subtasks].sort((a, b) => {
      const aOrder = a.order_in_parent ?? Number.POSITIVE_INFINITY;
      const bOrder = b.order_in_parent ?? Number.POSITIVE_INFINITY;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.title.localeCompare(b.title);
    });
  }, [subtasks]);

  const stepNumberBySubtaskId = useMemo(() => {
    const map = new Map<string, number>();
    sortedSubtasks.forEach((subtask) => {
      if (subtask.order_in_parent != null) {
        map.set(subtask.id, subtask.order_in_parent);
      }
    });
    return map;
  }, [sortedSubtasks]);

  // Look up dependency tasks for parent task (left panel always shows parent)
  const dependencies = useMemo(() => {
    if (!task.dependency_ids || task.dependency_ids.length === 0) {
      return [];
    }

    return task.dependency_ids
      .map(depId => allTasks.find(t => t.id === depId))
      .filter((t): t is Task => t !== undefined);
  }, [task, allTasks]);

  // Look up dependency tasks for selected subtask (shown in right panel)
  const subtaskDependencies = useMemo(() => {
    if (!selectedSubtask?.dependency_ids || selectedSubtask.dependency_ids.length === 0) {
      return [];
    }

    return selectedSubtask.dependency_ids
      .map(depId => sortedSubtasks.find(t => t.id === depId) || allTasks.find(t => t.id === depId))
      .filter((t): t is Task => t !== undefined);
  }, [selectedSubtask, sortedSubtasks, allTasks]);

  // Calculate effective estimated minutes (parent task's own time or sum of subtasks)
  const effectiveEstimatedMinutes = useMemo(() => {
    if (sortedSubtasks.length > 0) {
      // If has subtasks: return sum of subtask estimates
      return sortedSubtasks.reduce((sum, subtask) => sum + (subtask.estimated_minutes || 0), 0);
    } else {
      // If no subtasks: return task's own estimate
      return task.estimated_minutes || 0;
    }
  }, [task.estimated_minutes, sortedSubtasks]);

  const getPriorityIcon = (level: string) => {
    switch (level) {
      case 'HIGH':
        return <FaFire />;
      case 'MEDIUM':
        return <FaClock />;
      case 'LOW':
        return <FaLeaf />;
      default:
        return <FaLeaf />;
    }
  };

  const getEnergyIcon = (level: string) => {
    return level === 'HIGH' ? <FaBatteryFull /> : <FaBatteryQuarter />;
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      TODO: '未着手',
      IN_PROGRESS: '進行中',
      WAITING: '待機中',
      DONE: '完了',
    };
    return labels[status] || status;
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    return date.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const selectedGuide = selectedSubtask ? extractGuide(selectedSubtask.description) : null;
  const taskDescription = extractGuide(task.description);
  const selectedSubtaskStepNumber = selectedSubtask ? stepNumberBySubtaskId.get(selectedSubtask.id) : undefined;

  const handleSubtaskCheck = (subtaskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (onTaskCheck) {
      onTaskCheck(subtaskId);
    }
  };

  return (
    <motion.div
      className="modal-overlay"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        layout
        className={`modal-container ${selectedSubtask ? 'split-view' : ''}`}
        onClick={(e) => e.stopPropagation()}
        initial={{ scale: 0.95, opacity: 0, y: 10 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 10 }}
        transition={{
          type: "spring",
          damping: 35,
          stiffness: 400,
          mass: 1,
          layout: { duration: 0.45, ease: [0.16, 1, 0.3, 1] }
        }}
      >
        {/* Main Task Panel - Always shows parent task */}
        <motion.div layout className="modal-content">
          <div className="modal-header">
            <h2>{task.title}</h2>
            <div className="modal-header-actions">
              {onEdit && (
                <button className="edit-btn" onClick={() => onEdit(task)} title="編集">
                  <FaEdit />
                </button>
              )}
              <button className="close-btn" onClick={onClose}>
                <FaTimes />
              </button>
            </div>
          </div>

          <div className="modal-body">
            {/* Status */}
            <div className="detail-section">
              <h3>ステータス</h3>
              <span className={`status-badge status-${task.status.toLowerCase()}`}>
                {getStatusLabel(task.status)}
              </span>
            </div>

            {/* Progress */}
            <div className="detail-section">
              <h3>進捗率</h3>
              <div className="progress-control">
                <div className="progress-bar-container">
                  <div
                    className="progress-bar-fill"
                    style={{ width: `${localProgress}%` }}
                  />
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={localProgress}
                    onChange={(e) => {
                      const newProgress = parseInt(e.target.value, 10);
                      setLocalProgress(newProgress);
                    }}
                    onMouseUp={() => {
                      if (onProgressChange) {
                        onProgressChange(task.id, localProgress);
                      }
                    }}
                    onTouchEnd={() => {
                      if (onProgressChange) {
                        onProgressChange(task.id, localProgress);
                      }
                    }}
                    className="progress-slider"
                  />
                </div>
                <span className="progress-value">{localProgress}%</span>
              </div>
            </div>

            {/* Description */}
            {task.description && (
              <div className="detail-section">
                <h3>説明</h3>
                <>
                  {taskDescription.mainDescription && (
                    <div className="description-text markdown-content">
                      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
                        {taskDescription.mainDescription}
                      </ReactMarkdown>
                    </div>
                  )}
                  {taskDescription.guide && (
                    <div className="task-guide markdown-content">
                      <h4>進め方ガイド</h4>
                      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
                        {taskDescription.guide}
                      </ReactMarkdown>
                    </div>
                  )}
                </>
              </div>
            )}

            {/* Metadata */}
            <div className="detail-section">
              <h3>優先度・エネルギー</h3>
              <div className="metadata-grid">
                <div className="metadata-item">
                  <span className="metadata-label">重要度</span>
                  <span className={`meta-badge importance-${task.importance.toLowerCase()}`}>
                    {getPriorityIcon(task.importance)}
                    <span>{task.importance}</span>
                  </span>
                </div>
                <div className="metadata-item">
                  <span className="metadata-label">緊急度</span>
                  <span className={`meta-badge urgency-${task.urgency.toLowerCase()}`}>
                    {getPriorityIcon(task.urgency)}
                    <span>{task.urgency}</span>
                  </span>
                </div>
                <div className="metadata-item">
                  <span className="metadata-label">必要エネルギー</span>
                  <span className={`meta-badge energy-${task.energy_level.toLowerCase()}`}>
                    {getEnergyIcon(task.energy_level)}
                    <span>{task.energy_level}</span>
                  </span>
                </div>
                {effectiveEstimatedMinutes > 0 && (
                  <div className="metadata-item">
                    <span className="metadata-label">見積もり時間</span>
                    <span className="metadata-value">
                      {effectiveEstimatedMinutes}分
                      {sortedSubtasks.length > 0 && task.estimated_minutes && task.estimated_minutes !== effectiveEstimatedMinutes && (
                        <span className="metadata-hint"> (サブタスク合計)</span>
                      )}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Dependencies */}
            {dependencies.length > 0 && (
              <div className="detail-section">
                <h3>依存関係</h3>
                <p className="dependency-hint">以下のタスクを先に完了する必要があります（クリックで移動）</p>
                <ul className="dependencies-list">
                  {dependencies.map((dep) => (
                    <li
                      key={dep.id}
                      className={`dependency-item ${dep.status === 'DONE' ? 'completed' : 'pending'} clickable`}
                      onClick={() => {
                        // Jump to another task (close current modal and open new one)
                        onClose();
                        // Small delay to allow modal close animation
                        setTimeout(() => {
                          const taskCard = document.querySelector(`[data-task-id="${dep.id}"]`);
                          if (taskCard) {
                            (taskCard as HTMLElement).click();
                          }
                        }, 300);
                      }}
                      style={{ cursor: 'pointer' }}
                    >
                      {dep.status === 'DONE' ? (
                        <FaLockOpen className="dependency-icon completed" />
                      ) : (
                        <FaLock className="dependency-icon pending" />
                      )}
                      <span className="dependency-title">{dep.title}</span>
                      <span className={`dependency-status status-${dep.status.toLowerCase()}`}>
                        {getStatusLabel(dep.status)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Due Date */}
            {task.due_date && (
              <div className="detail-section">
                <h3>期限</h3>
                <p className="due-date">{formatDate(task.due_date)}</p>
              </div>
            )}

            {/* Subtasks - always visible in left panel */}
            {sortedSubtasks.length > 0 && (
              <div className="detail-section">
                <h3>サブタスク ({sortedSubtasks.length}件)</h3>
                <ul className="subtasks-list">
                  {sortedSubtasks.map((subtask) => {
                    const { guide } = extractGuide(subtask.description);
                    const hasGuide = guide.length > 0;
                    const stepNumber = stepNumberBySubtaskId.get(subtask.id);

                    // Check if this subtask has dependencies
                    const hasDependencies = subtask.dependency_ids && subtask.dependency_ids.length > 0;
                    const dependencyTasks = hasDependencies
                      ? subtask.dependency_ids
                        .map(depId => sortedSubtasks.find(t => t.id === depId))
                        .filter((t): t is Task => t !== undefined)
                      : [];
                    const dependencyStepNumbers = hasDependencies
                      ? subtask.dependency_ids.map(depId => stepNumberBySubtaskId.get(depId) ?? '?')
                      : [];
                    const hasPendingDependencies = hasDependencies
                      && (dependencyTasks.length !== subtask.dependency_ids.length
                        || dependencyTasks.some(dep => dep.status !== 'DONE'));

                    return (
                      <li
                        key={subtask.id}
                        className={`subtask-item ${hasGuide ? 'has-guide' : ''} ${selectedSubtask?.id === subtask.id ? 'selected' : ''}`}
                        onClick={() => hasGuide && setSelectedSubtask(subtask)}
                      >
                        <div
                          className={`subtask-check-wrapper ${subtask.status === 'DONE' ? 'done' : ''}`}
                          onClick={(e) => handleSubtaskCheck(subtask.id, e)}
                        >
                          <AnimatePresence mode="wait">
                            {subtask.status === 'DONE' ? (
                              <motion.div
                                key="check"
                                initial={{ scale: 0, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0, opacity: 0 }}
                              >
                                <FaCheckCircle className="subtask-icon done" />
                              </motion.div>
                            ) : (
                              <motion.div
                                key="circle"
                                initial={{ scale: 0, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0, opacity: 0 }}
                              >
                                <FaCircle className="subtask-icon" />
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                        {hasDependencies && hasPendingDependencies && (
                          <FaLock className="subtask-dependency-icon" title={`${dependencyTasks.map(d => d.title).join(', ')} に依存`} />
                        )}
                        {stepNumber != null && (
                          <StepNumber stepNumber={stepNumber} className="small" />
                        )}
                        <span className={subtask.status === 'DONE' ? 'subtask-title done' : 'subtask-title'}>
                          {subtask.title}
                        </span>
                        {hasDependencies && (
                          <span className="subtask-dependency-hint" title={`${dependencyTasks.map(d => d.title).join(', ')} に依存`}>
                            {dependencyStepNumbers.join(',')} に依存
                          </span>
                        )}
                        {hasGuide && (
                          <FaBookOpen className="subtask-guide-icon" title="進め方ガイドあり" />
                        )}
                        {subtask.estimated_minutes && (
                          <span className="subtask-time">{subtask.estimated_minutes}分</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {/* Meta Info */}
            <div className="detail-section meta-info">
              <div className="meta-info-row">
                <span className="meta-info-label">作成者:</span>
                <span className="meta-info-value">{task.created_by === 'AGENT' ? 'AI秘書' : 'ユーザー'}</span>
              </div>
              <div className="meta-info-row">
                <span className="meta-info-label">作成日時:</span>
                <span className="meta-info-value">{formatDate(task.created_at)}</span>
              </div>
              <div className="meta-info-row">
                <span className="meta-info-label">更新日時:</span>
                <span className="meta-info-value">{formatDate(task.updated_at)}</span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Guide Panel - Shows subtask details */}
        <AnimatePresence>
          {selectedSubtask && (
            <motion.div
              layout
              className="guide-panel"
              initial={{ x: 50, opacity: 0, width: 0, marginLeft: 0 }}
              animate={{ x: 0, opacity: 1, width: 500, marginLeft: "1.5rem" }}
              exit={{ x: 50, opacity: 0, width: 0, marginLeft: 0 }}
              transition={{
                type: "spring",
                damping: 35,
                stiffness: 400,
                mass: 1,
                layout: { duration: 0.45, ease: [0.16, 1, 0.3, 1] }
              }}
            >
              <div className="guide-header">
                <button className="back-btn" onClick={() => setSelectedSubtask(null)}>
                  <FaArrowLeft />
                </button>
                <h3>サブタスク詳細</h3>
              </div>
              <div className="guide-content">
                {/* Subtask Title */}
                <div className="guide-task-title">
                  <FaBookOpen />
                  {selectedSubtaskStepNumber != null && (
                    <StepNumber stepNumber={selectedSubtaskStepNumber} className="small" />
                  )}
                  <span>{selectedSubtask.title}</span>
                </div>

                {/* Status */}
                <div className="guide-section">
                  <h4>ステータス</h4>
                  <span className={`status-badge status-${selectedSubtask.status.toLowerCase()}`}>
                    {getStatusLabel(selectedSubtask.status)}
                  </span>
                </div>

                {/* Dependencies */}
                {subtaskDependencies.length > 0 && (
                  <div className="guide-section">
                    <h4>
                      <FaLock style={{ marginRight: '0.5rem' }} />
                      依存関係
                    </h4>
                    <p className="dependency-hint">以下のサブタスクを先に完了する必要があります（クリックで切り替え）</p>
                    <ul className="dependencies-list">
                      {subtaskDependencies.map((dep) => (
                        <li
                          key={dep.id}
                          className={`dependency-item ${dep.status === 'DONE' ? 'completed' : 'pending'} clickable`}
                          onClick={() => setSelectedSubtask(dep)}
                          style={{ cursor: 'pointer' }}
                        >
                          {dep.status === 'DONE' ? (
                            <FaLockOpen className="dependency-icon completed" />
                          ) : (
                            <FaLock className="dependency-icon pending" />
                          )}
                          {stepNumberBySubtaskId.has(dep.id) && (
                            <StepNumber
                              stepNumber={stepNumberBySubtaskId.get(dep.id)!}
                              className="small"
                            />
                          )}
                          <span className="dependency-title">{dep.title}</span>
                          <span className={`dependency-status status-${dep.status.toLowerCase()}`}>
                            {getStatusLabel(dep.status)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Metadata */}
                <div className="guide-section">
                  <h4>優先度・エネルギー</h4>
                  <div className="metadata-grid">
                    <div className="metadata-item">
                      <span className="metadata-label">重要度</span>
                      <span className={`meta-badge importance-${selectedSubtask.importance.toLowerCase()}`}>
                        {getPriorityIcon(selectedSubtask.importance)}
                        <span>{selectedSubtask.importance}</span>
                      </span>
                    </div>
                    <div className="metadata-item">
                      <span className="metadata-label">緊急度</span>
                      <span className={`meta-badge urgency-${selectedSubtask.urgency.toLowerCase()}`}>
                        {getPriorityIcon(selectedSubtask.urgency)}
                        <span>{selectedSubtask.urgency}</span>
                      </span>
                    </div>
                    <div className="metadata-item">
                      <span className="metadata-label">エネルギー</span>
                      <span className={`meta-badge energy-${selectedSubtask.energy_level.toLowerCase()}`}>
                        {getEnergyIcon(selectedSubtask.energy_level)}
                        <span>{selectedSubtask.energy_level}</span>
                      </span>
                    </div>
                    {selectedSubtask.estimated_minutes && (
                      <div className="metadata-item">
                        <span className="metadata-label">見積時間</span>
                        <span className="metadata-value">{selectedSubtask.estimated_minutes}分</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Description */}
                {selectedGuide?.mainDescription && (
                  <div className="guide-section">
                    <h4>説明</h4>
                    <div className="guide-description markdown-content">
                      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
                        {selectedGuide.mainDescription}
                      </ReactMarkdown>
                    </div>
                  </div>
                )}

                {/* Guide */}
                {selectedGuide?.guide && (
                  <div className="guide-section">
                    <h4>進め方ガイド</h4>
                    <div className="guide-steps markdown-content">
                      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
                        {selectedGuide.guide}
                      </ReactMarkdown>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
