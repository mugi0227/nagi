import { AnimatePresence, motion, useAnimationControls } from 'framer-motion';
import { FaCheck } from 'react-icons/fa';
import { FaBatteryFull, FaBatteryQuarter, FaClock, FaEllipsis, FaFire, FaLeaf, FaLock } from 'react-icons/fa6';
import type { Task } from '../../api/types';
import { useTimezone } from '../../hooks/useTimezone';
import { formatDate } from '../../utils/dateTime';
import './TaskItem.css';

interface TaskItemProps {
  task: Task;
  onCheck?: (taskId: string) => void;
  onClick?: (task: Task) => void;
  isRemoving?: boolean;
  allowToggleDone?: boolean;
  isBlocked?: boolean;
  blockedReason?: string;
}

const TEXT = {
  blocked: '\u30d6\u30ed\u30c3\u30af\u4e2d',
};

export function TaskItem({
  task,
  onCheck,
  onClick,
  isRemoving = false,
  allowToggleDone = false,
  isBlocked = false,
  blockedReason,
}: TaskItemProps) {
  const timezone = useTimezone();
  const getPriorityIcon = (level: string) => {
    switch (level) {
      case 'HIGH': return <FaFire />;
      case 'MEDIUM': return <FaClock />;
      case 'LOW': return <FaLeaf />;
      default: return null;
    }
  };

  const getEnergyIcon = (level: string) => {
    return level === 'LOW' ? <FaBatteryQuarter /> : <FaBatteryFull />;
  };

  const getEnergyLabel = (level: string) => {
    return level === 'LOW' ? 'Low Energy' : 'High Energy';
  };

  const handleClick = () => {
    if (onClick) {
      onClick(task);
    }
  };

  const controls = useAnimationControls();

  const handleCheckClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onCheck && (allowToggleDone || task.status !== 'DONE')) {
      if (task.status !== 'DONE') {
        // Play "burst" animation sequence
        await controls.start({
          scale: [1, 1.2, 1],
          transition: { duration: 0.2 }
        });
      }
      onCheck(task.id);
    }
  };

  const handleActionClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const isDone = task.status === 'DONE';

  return (
    <div
      className={`task-item ${isRemoving ? 'removing' : ''}`}
      onClick={handleClick}
      data-done={isDone}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      <motion.div
        className={`task-check ${isDone ? 'done' : ''}`}
        onClick={handleCheckClick}
        animate={controls}
      >
        <div className="circle-bg" />
        <AnimatePresence mode="wait">
          {isDone ? (
            <motion.div
              key="check"
              className="check-icon-wrapper done"
              initial={{ scale: 0, opacity: 0, rotate: -45 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              exit={{ scale: 0, opacity: 0, rotate: 45 }}
              transition={{
                type: "spring",
                damping: 10,
                stiffness: 300,
                scale: { type: "spring", damping: 12, stiffness: 200 }
              }}
            >
              <FaCheck className="check-icon" />
              {/* Particle Burst Effect */}
              <motion.div
                className="check-burst"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 2.5, opacity: [0, 1, 0] }}
                transition={{ duration: 0.5, ease: "easeOut" }}
              />
            </motion.div>
          ) : (
            <motion.div
              key="preview"
              className="check-icon-wrapper hover-preview"
            >
              <FaCheck className="check-icon" />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      <div className="task-content">
        <span className="task-title">{task.title}</span>

        <div className="task-meta">
          {isBlocked && (
            <span className="task-dependency-indicator" title={blockedReason ?? TEXT.blocked}>
              <FaLock />
              <span>{TEXT.blocked}</span>
            </span>
          )}

          {task.due_date && (
            <span className="meta-tag due-date">
              <FaClock />
              <span>
                {formatDate(task.due_date, { month: 'numeric', day: 'numeric' }, timezone)}まで
              </span>
            </span>
          )}

          {/* Tag for Priority */}
          <span className={`meta-tag urgency-${task.urgency.toLowerCase()}`}>
            {getPriorityIcon(task.urgency)}
            <span>{task.urgency === 'HIGH' ? 'High Urgency' : task.urgency === 'MEDIUM' ? 'Medium' : 'Low'}</span>
          </span>

          {/* Tag for Energy */}
          <span className={`meta-tag energy-${task.energy_level.toLowerCase()}`}>
            {getEnergyIcon(task.energy_level)}
            <span>{getEnergyLabel(task.energy_level)}</span>
          </span>
        </div>
      </div>

      <button
        className="task-action-btn"
        aria-label="More actions"
        onClick={handleActionClick}
      >
        <FaEllipsis />
      </button>
    </div>
  );
}
