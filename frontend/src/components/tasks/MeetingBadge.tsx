import { FaCalendarAlt, FaMapMarkerAlt, FaUsers } from 'react-icons/fa';
import type { Task } from '../../api/types';
import './MeetingBadge.css';

interface MeetingBadgeProps {
  task: Task;
  showDetails?: boolean;
}

export function MeetingBadge({ task, showDetails = false }: MeetingBadgeProps) {
  if (!task.is_fixed_time) {
    return null;
  }

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('ja-JP', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  };

  const formatDateRange = (start?: string, end?: string) => {
    if (!start || !end) return '';
    return `${formatTime(start)} - ${formatTime(end)}`;
  };

  if (!showDetails) {
    // Compact badge for inline display
    return (
      <span className="meeting-badge compact">
        <FaCalendarAlt className="meeting-icon" />
        {task.start_time && task.end_time && (
          <span className="meeting-time">
            {formatDateRange(task.start_time, task.end_time)}
          </span>
        )}
        {task.location && (
          <span className="meeting-location">· {task.location}</span>
        )}
      </span>
    );
  }

  // Detailed view for task cards
  return (
    <div className="meeting-badge detailed">
      <div className="meeting-header">
        <FaCalendarAlt className="meeting-icon" />
        <span className="meeting-label">会議</span>
      </div>

      {task.start_time && task.end_time && (
        <div className="meeting-detail">
          <span className="meeting-time-range">
            {formatDateRange(task.start_time, task.end_time)}
          </span>
        </div>
      )}

      {task.location && (
        <div className="meeting-detail">
          <FaMapMarkerAlt className="detail-icon" />
          <span>{task.location}</span>
        </div>
      )}

      {task.attendees && task.attendees.length > 0 && (
        <div className="meeting-detail">
          <FaUsers className="detail-icon" />
          <span>{task.attendees.length}名参加</span>
        </div>
      )}
    </div>
  );
}
