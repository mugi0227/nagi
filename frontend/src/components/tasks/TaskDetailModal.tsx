import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import {
  FaArrowLeft,
  FaEdit,
  FaLayerGroup,
  FaLock,
  FaLockOpen,
  FaProjectDiagram,
  FaTimes,
  FaTrash,
} from 'react-icons/fa';
import {
  HiOutlineBookOpen,
  HiOutlineCalendar,
  HiOutlineCheckCircle,
  HiOutlineClock,
  HiOutlineFire,
  HiOutlineLightningBolt,
  HiOutlineLocationMarker,
  HiOutlineUserGroup
} from 'react-icons/hi';
import {
  HiFire,
} from 'react-icons/hi2';
import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import { phasesApi } from '../../api/phases';
import { getProject } from '../../api/projects';
import type { Phase, Project, Task } from '../../api/types';
import { useTimezone } from '../../hooks/useTimezone';
import { formatDate } from '../../utils/dateTime';
import type { DraftCardData } from '../chat/DraftCard';
import { AgendaList } from '../agenda';
import { StepNumber } from '../common/StepNumber';
import './TaskDetailModal.css';

interface TaskDetailModalProps {
  task: Task;
  subtasks?: Task[];
  allTasks?: Task[];
  initialSubtask?: Task | null;
  projectName?: string;
  phaseName?: string;
  onClose: () => void;
  onEdit?: (task: Task) => void;
  onDelete?: (task: Task) => void;
  onProgressChange?: (taskId: string, progress: number) => void;
  onTaskCheck?: (taskId: string) => void;
  onActionItemsCreated?: () => void;
  onStatusChange?: (taskId: string, status: string) => void;
  onCreateSubtask?: (parentTaskId: string) => void;
}

// Helper to extract guide from description
function extractGuide(description?: string | null): { mainDescription: string; guide: string } {
  if (!description) return { mainDescription: '', guide: '' };

  const guideSeparator = '---\n\n## 進め方ガイド';
  const guideStartOnly = '## 進め方ガイド';

  const separatorIndex = description.indexOf(guideSeparator);
  if (separatorIndex !== -1) {
    return {
      mainDescription: description.substring(0, separatorIndex).trim(),
      guide: description.substring(separatorIndex + guideSeparator.length).trim(),
    };
  }

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
  projectName,
  phaseName,
  onClose,
  onEdit,
  onDelete,
  onProgressChange,
  onTaskCheck,
  onActionItemsCreated: _onActionItemsCreated,
  onStatusChange,
  onCreateSubtask
}: TaskDetailModalProps) {
  const timezone = useTimezone();
  const [selectedSubtask, setSelectedSubtask] = useState<Task | null>(initialSubtask);
  const [localProgress, setLocalProgress] = useState<number>(task.progress ?? 0);
  const [localStatus, setLocalStatus] = useState<string>(task.status);
  const [localSubtasks, setLocalSubtasks] = useState<Task[]>(subtasks);
  const [fetchedProject, setFetchedProject] = useState<Project | null>(null);
  const [fetchedPhase, setFetchedPhase] = useState<Phase | null>(null);

  // Fetch project and phase info if not provided via props
  useEffect(() => {
    let isActive = true;
    const fetchProjectAndPhase = async () => {
      // Fetch project if we have project_id but no projectName prop
      if (task.project_id && !projectName) {
        try {
          const proj = await getProject(task.project_id);
          if (isActive && proj) {
            setFetchedProject(proj);
          }
        } catch (err) {
          console.error('Failed to fetch project:', err);
        }
      }
      // Fetch phase if we have phase_id but no phaseName prop
      if (task.phase_id && !phaseName) {
        try {
          const phase = await phasesApi.getById(task.phase_id);
          if (isActive && phase) {
            setFetchedPhase(phase);
          }
        } catch (err) {
          console.error('Failed to fetch phase:', err);
        }
      }
    };
    fetchProjectAndPhase();
    return () => { isActive = false; };
  }, [task.project_id, task.phase_id, projectName, phaseName]);

  // Determine effective project/phase names (props take precedence)
  const effectiveProjectName = projectName || fetchedProject?.name;
  const effectivePhaseName = phaseName || fetchedPhase?.name;

  useEffect(() => {
    setLocalProgress(task.progress ?? 0);
    setLocalStatus(task.status);
  }, [task.id, task.progress, task.status]);

  useEffect(() => {
    setLocalSubtasks(subtasks);
  }, [subtasks]);

  const sortedSubtasks = useMemo(() => {
    return [...localSubtasks].sort((a, b) => {
      const aOrder = a.order_in_parent ?? Number.POSITIVE_INFINITY;
      const bOrder = b.order_in_parent ?? Number.POSITIVE_INFINITY;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.title.localeCompare(b.title);
    });
  }, [localSubtasks]);

  const stepNumberBySubtaskId = useMemo(() => {
    const map = new Map<string, number>();
    sortedSubtasks.forEach((subtask) => {
      if (subtask.order_in_parent != null) {
        map.set(subtask.id, subtask.order_in_parent);
      }
    });
    return map;
  }, [sortedSubtasks]);

  const dependencies = useMemo(() => {
    if (!task.dependency_ids || task.dependency_ids.length === 0) return [];
    return task.dependency_ids
      .map(depId => allTasks.find(t => t.id === depId))
      .filter((t): t is Task => t !== undefined);
  }, [task, allTasks]);

  const effectiveEstimatedMinutes = useMemo(() => {
    if (sortedSubtasks.length > 0) {
      return sortedSubtasks.reduce((sum, subtask) => sum + (subtask.estimated_minutes || 0), 0);
    }
    return task.estimated_minutes || 0;
  }, [task.estimated_minutes, sortedSubtasks]);

  const getPriorityIcon = (level: string) => {
    switch (level) {
      case 'HIGH': return <HiFire className="priority-icon-high" />;
      case 'MEDIUM': return <HiOutlineFire className="priority-icon-medium" />;
      case 'LOW': return <HiOutlineClock className="priority-icon-low" />;
      default: return <HiOutlineFire />;
    }
  };

  const getEnergyIcon = (level: string) => {
    return level === 'HIGH' ? <HiOutlineLightningBolt className="energy-icon-high" /> : <HiOutlineClock className="energy-icon-low" />;
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

  const formatDateValue = (dateStr?: string) => {
    if (!dateStr) return null;
    return formatDate(dateStr, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }, timezone);
  };

  const formatMeetingTime = (start?: string, end?: string) => {
    if (!start || !end) return null;
    const startLabel = formatDate(start, {
      month: 'numeric',
      day: 'numeric',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }, timezone);
    const endLabel = formatDate(end, {
      hour: '2-digit',
      minute: '2-digit',
    }, timezone);
    return `${startLabel} - ${endLabel}`;
  };

  const selectedGuide = selectedSubtask ? extractGuide(selectedSubtask.description) : null;
  const taskDescription = extractGuide(task.description);
  const selectedSubtaskStepNumber = selectedSubtask ? stepNumberBySubtaskId.get(selectedSubtask.id) : undefined;
  const isMeeting = task.is_fixed_time && task.start_time && task.end_time;
  const meetingTimeLabel = formatMeetingTime(task.start_time, task.end_time);

  // Helper to check if a subtask is locked (dependencies not complete)
  const isSubtaskLocked = (subtask: Task): boolean => {
    if (!subtask.dependency_ids || subtask.dependency_ids.length === 0) return false;
    return subtask.dependency_ids.some(depId => {
      // First check localSubtasks (for optimistic updates), then allTasks
      const localTask = localSubtasks.find(t => t.id === depId);
      if (localTask) return localTask.status !== 'DONE';
      const task = allTasks.find(t => t.id === depId);
      return task ? task.status !== 'DONE' : false;
    });
  };

  const handleSubtaskCheck = (subtaskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    // Find the subtask and check if it's locked
    const subtask = localSubtasks.find(s => s.id === subtaskId);
    if (!subtask) return;

    // Don't allow checking locked subtasks (unless unchecking)
    if (subtask.status !== 'DONE' && isSubtaskLocked(subtask)) {
      console.log('[TaskDetailModal] Subtask is locked, cannot check:', subtaskId);
      return;
    }

    console.log('[TaskDetailModal] Subtask check:', subtaskId);

    // Optimistic update: toggle subtask status in local state
    setLocalSubtasks(prev =>
      prev.map(s => {
        if (s.id === subtaskId) {
          const newStatus = s.status === 'DONE' ? 'TODO' : 'DONE';
          return { ...s, status: newStatus };
        }
        return s;
      })
    );

    // Update selectedSubtask if it matches
    if (selectedSubtask?.id === subtaskId) {
      setSelectedSubtask(prev => {
        if (!prev) return prev;
        const newStatus = prev.status === 'DONE' ? 'TODO' : 'DONE';
        return { ...prev, status: newStatus };
      });
    }

    if (onTaskCheck) {
      onTaskCheck(subtaskId);
    } else {
      console.warn('[TaskDetailModal] onTaskCheck is not provided');
    }
  };

  const handleCreateActionItems = () => {
    if (!task.meeting_notes) return;
    const draftCard: DraftCardData = {
      type: 'actionItem',
      title: 'アクションアイテム生成',
      info: [
        { label: 'タスク', value: task.title },
        { label: 'タスクID', value: task.id },
      ],
      placeholder: '例: 優先度順に並べて',
      promptTemplate: `タスク「${task.title}」(ID: ${task.id}) の会議ノートからアクションアイテムを作成して。

追加の指示があれば以下に記入:
{instruction}`,
    };
    const event = new CustomEvent('secretary:chat-open', { detail: { draftCard } });
    window.dispatchEvent(event);
  };

  return (
    <motion.div
      className="modal-overlay"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
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
        <motion.div layout className="modal-content side-layout-modal">
          <div className="modal-header">
            <div className="title-area">
              {isMeeting && <span className="meeting-tag">MEETING</span>}
              <h2>{task.title}</h2>
            </div>
            <div className="modal-header-actions">
              {onEdit && (
                <button className="edit-btn" onClick={() => onEdit(task)} title="編集">
                  <FaEdit />
                </button>
              )}
              {onDelete && (
                <button className="delete-btn" onClick={() => onDelete(task)} title="削除">
                  <FaTrash />
                </button>
              )}
              <button className="close-btn" onClick={onClose}>
                <FaTimes />
              </button>
            </div>
          </div>

          <div className="modal-body-wrapper">
            {/* Main Area */}
            <div className="modal-main-area">
              {(taskDescription.mainDescription || taskDescription.guide) && (
                <div className="detail-section">
                  <h3 className="section-label">説明</h3>
                  <div className="description-container">
                    {taskDescription.mainDescription && (
                      <div className="description-text markdown-content">
                        <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
                          {taskDescription.mainDescription}
                        </ReactMarkdown>
                      </div>
                    )}
                    {taskDescription.guide && (
                      <div className="task-guide markdown-content">
                        <h4><HiOutlineBookOpen /> 進め方ガイド</h4>
                        <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
                          {taskDescription.guide}
                        </ReactMarkdown>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {isMeeting && (
                <>
                  <div className="detail-section meeting-section">
                    <div className="section-header-with-icon">
                      <HiOutlineCalendar />
                      <h3>会議情報</h3>
                    </div>
                    <div className="meeting-meta-box">
                      <div className="meeting-meta-grid">
                        <div className="meta-info-item">
                          <HiOutlineClock />
                          <span>{meetingTimeLabel}</span>
                        </div>
                        {task.location && (
                          <div className="meta-info-item">
                            <HiOutlineLocationMarker />
                            <span>{task.location}</span>
                          </div>
                        )}
                        {task.attendees?.length > 0 && (
                          <div className="meta-info-item">
                            <HiOutlineUserGroup />
                            <span>{task.attendees.join(', ')}</span>
                          </div>
                        )}
                      </div>
                      {task.meeting_notes ? (
                        <div className="meeting-notes-content markdown-content">
                          <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
                            {task.meeting_notes}
                          </ReactMarkdown>
                        </div>
                      ) : (
                        <p className="empty-hint">議事録はまだありません。</p>
                      )}
                      <div className="meeting-actions">
                        <button
                          type="button"
                          className="premium-action-btn"
                          onClick={handleCreateActionItems}
                          disabled={!task.meeting_notes}
                        >
                          アクションアイテムを生成
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Agenda Section */}
                  <div className="detail-section agenda-section">
                    <AgendaList
                      meetingId={task.recurring_meeting_id || undefined}
                      taskId={task.recurring_meeting_id ? undefined : task.id}
                      eventDate={task.start_time ? task.start_time.split('T')[0] : undefined}
                    />
                  </div>
                </>
              )}

              {/* Subtasks Section - 常時表示 */}
              <div className="detail-section subtasks-section">
                <div className="section-header-row">
                  <h3 className="section-label">サブタスク ({sortedSubtasks.length})</h3>
                  {onCreateSubtask && (
                    <button
                      type="button"
                      className="add-subtask-btn"
                      onClick={() => onCreateSubtask(task.id)}
                    >
                      ＋ 追加
                    </button>
                  )}
                </div>
                {sortedSubtasks.length > 0 ? (
                  <ul className="subtasks-list">
                    {sortedSubtasks.map((subtask) => {

                      const { guide } = extractGuide(subtask.description);
                      const hasGuide = guide.length > 0;
                      const stepNumber = stepNumberBySubtaskId.get(subtask.id);
                      const isLocked = isSubtaskLocked(subtask);

                      return (
                        <li
                          key={subtask.id}
                          className={`subtask-item ${hasGuide ? 'has-guide' : ''} ${selectedSubtask?.id === subtask.id ? 'selected' : ''}`}
                          onClick={() => hasGuide && setSelectedSubtask(subtask)}
                        >
                          <div
                            className={`subtask-check-wrapper ${subtask.status === 'DONE' ? 'checked' : ''}`}
                            onClick={(e) => handleSubtaskCheck(subtask.id, e)}
                          >
                            {subtask.status === 'DONE' && <HiOutlineCheckCircle />}
                          </div>
                          {isLocked && <FaLock className="subtask-lock" />}
                          {stepNumber != null && <StepNumber stepNumber={stepNumber} className="small" />}
                          <span className={`subtask-title ${subtask.status === 'DONE' ? 'done' : ''}`}>
                            {subtask.title}
                          </span>
                          {hasGuide && <HiOutlineBookOpen className="guide-indicator" />}
                          {subtask.estimated_minutes && <span className="subtask-duration">{subtask.estimated_minutes}分</span>}
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="empty-hint">サブタスクはまだありません</p>
                )}
              </div>

              <div className="detail-section footer-meta">

                <p>作成: {task.created_by === 'AGENT' ? 'AI秘書' : '自分'} • {formatDateValue(task.created_at)}</p>
                <p>更新: {formatDateValue(task.updated_at)}</p>
              </div>
            </div>

            {/* Sidebar (always visible) */}
            <div className="modal-sidebar">
              <div className="sidebar-group">
                <h3 className="sidebar-label">状況</h3>
                <button
                  type="button"
                  className={`status-badge-lg status-${localStatus.toLowerCase()} clickable`}
                  onClick={() => {
                    const statusOrder = ['TODO', 'IN_PROGRESS', 'WAITING', 'DONE'];
                    const currentIndex = statusOrder.indexOf(localStatus);
                    const nextIndex = (currentIndex + 1) % statusOrder.length;
                    const nextStatus = statusOrder[nextIndex];
                    console.log('[TaskDetailModal] Status change:', task.id, localStatus, '->', nextStatus);
                    // Optimistic update - update local state immediately
                    setLocalStatus(nextStatus);
                    onStatusChange?.(task.id, nextStatus);
                  }}
                  title="クリックでステータス変更"
                >
                  {getStatusLabel(localStatus)}
                </button>

                <div className="progress-mini-item">

                  <div className="progress-header">
                    <span>進捗率</span>
                    <span className="progress-val">{localProgress}%</span>
                  </div>
                  <div className="progress-control">
                    <div className="progress-bar-container">
                      <div className="progress-bar-fill" style={{ width: `${localProgress}%` }} />
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="5"
                        value={localProgress}
                        onChange={(e) => setLocalProgress(parseInt(e.target.value, 10))}
                        onMouseUp={() => onProgressChange?.(task.id, localProgress)}
                        onTouchEnd={() => onProgressChange?.(task.id, localProgress)}
                        className="progress-slider"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="sidebar-group">
                <h3 className="sidebar-label">メタデータ</h3>
                <div className="sidebar-meta-list">
                  <div className="sidebar-meta-item">
                    <span className="label">重要度</span>
                    <span className={`meta-badge-sm importance-${task.importance.toLowerCase()}`}>
                      {getPriorityIcon(task.importance)}
                      {task.importance}
                    </span>
                  </div>
                  <div className="sidebar-meta-item">
                    <span className="label">緊急度</span>
                    <span className={`meta-badge-sm urgency-${task.urgency.toLowerCase()}`}>
                      {getPriorityIcon(task.urgency)}
                      {task.urgency}
                    </span>
                  </div>
                  <div className="sidebar-meta-item">
                    <span className="label">エネルギー</span>
                    <span className={`meta-badge-sm energy-${task.energy_level.toLowerCase()}`}>
                      {getEnergyIcon(task.energy_level)}
                      {task.energy_level}
                    </span>
                  </div>
                  {effectiveEstimatedMinutes > 0 && (
                    <div className="sidebar-meta-item">
                      <span className="label">見積時間</span>
                      <span className="value"><HiOutlineClock /> {effectiveEstimatedMinutes}分</span>
                    </div>
                  )}
                </div>
              </div>

              {(task.project_id || task.phase_id) && (
                <div className="sidebar-group">
                  <h3 className="sidebar-label">プロジェクト</h3>
                  <div className="sidebar-meta-list">
                    {task.project_id && (
                      <div className="sidebar-meta-item">
                        <span className="label">プロジェクト</span>
                        <span className="value"><FaProjectDiagram /> {effectiveProjectName || '読み込み中...'}</span>
                      </div>
                    )}
                    {task.phase_id && (
                      <div className="sidebar-meta-item">
                        <span className="label">フェーズ</span>
                        <span className="value"><FaLayerGroup /> {effectivePhaseName || '読み込み中...'}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {(task.due_date || task.start_not_before) && (
                <div className="sidebar-group">
                  <h3 className="sidebar-label">スケジュール</h3>
                  <div className="sidebar-meta-list">
                    {task.due_date && (
                      <div className="sidebar-meta-item">
                        <span className="label">期限</span>
                        <span className="value"><HiOutlineCalendar /> {formatDateValue(task.due_date)}</span>
                      </div>
                    )}
                    {task.start_not_before && (
                      <div className="sidebar-meta-item">
                        <span className="label">着手可能日</span>
                        <span className="value"><HiOutlineCalendar /> {formatDateValue(task.start_not_before)}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {dependencies.length > 0 && (
                <div className="sidebar-group">
                  <h3 className="sidebar-label">依存関係</h3>
                  <ul className="sidebar-dependencies">
                    {dependencies.map((dep) => (
                      <li
                        key={dep.id}
                        className={`sidebar-dep-item ${dep.status === 'DONE' ? 'completed' : ''}`}
                        title={dep.title}
                        onClick={() => {
                          onClose();
                          setTimeout(() => {
                            const taskCard = document.querySelector(`[data-task-id="${dep.id}"]`);
                            if (taskCard) (taskCard as HTMLElement).click();
                          }, 300);
                        }}
                      >
                        {dep.status === 'DONE' ? <FaLockOpen /> : <FaLock />}
                        <span>{dep.title}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>

      <AnimatePresence>
        {selectedSubtask && (
          <motion.div
            layout
            className="guide-panel"
            onClick={(e) => e.stopPropagation()}
            initial={{ x: 50, opacity: 0, width: 0 }}

            animate={{ x: 0, opacity: 1, width: window.innerWidth > 1024 ? 700 : "100%" }}
            exit={{ x: 50, opacity: 0, width: 0 }}
            transition={{ type: "spring", damping: 35, stiffness: 400 }}
          >
            <div className="guide-header">
              <button className="back-btn" onClick={(e) => { e.stopPropagation(); setSelectedSubtask(null); }}>
                <FaArrowLeft />
              </button>

              <h3>サブタスク詳細</h3>

              <div className="guide-header-actions">
                {onEdit && (
                  <button
                    className="guide-edit-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit(selectedSubtask);
                    }}
                    title="サブタスクを編集"
                  >
                    <FaEdit />
                  </button>
                )}
              </div>
            </div>

            <div className="guide-body">
              <div className="guide-title-row">
                {selectedSubtaskStepNumber != null && <StepNumber stepNumber={selectedSubtaskStepNumber} />}
                <h4>{selectedSubtask.title}</h4>
              </div>

              <div className="guide-meta-box">
                <div className="metadata-grid">
                  <div className="metadata-item">
                    <span className="metadata-label">状況</span>
                    <span className={`status-badge status-${selectedSubtask.status.toLowerCase()}`}>
                      {getStatusLabel(selectedSubtask.status)}
                    </span>
                  </div>
                  {selectedSubtask.estimated_minutes && (
                    <div className="metadata-item">
                      <span className="metadata-label">時間</span>
                      <span className="metadata-value">{selectedSubtask.estimated_minutes}分</span>
                    </div>
                  )}
                </div>
              </div>

              {selectedGuide?.mainDescription && (
                <div className="guide-section">
                  <h4>説明</h4>
                  <div className="markdown-content">
                    <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
                      {selectedGuide.mainDescription}
                    </ReactMarkdown>
                  </div>
                </div>
              )}

              {selectedGuide?.guide && (
                <div className="guide-section">
                  <div className="section-header-with-icon">
                    <HiOutlineBookOpen />
                    <h4>進め方ガイド</h4>
                  </div>
                  <div className="guide-steps-box markdown-content">
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
    </motion.div >
  );
}
