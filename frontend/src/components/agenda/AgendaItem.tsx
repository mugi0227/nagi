/**
 * Individual agenda item component
 */

import React from 'react';
import { Trash2, Edit2, GripVertical, Clock, CheckCircle2 } from 'lucide-react';
import type { MeetingAgendaItem } from '../../types/agenda';

interface AgendaItemProps {
  item: MeetingAgendaItem;
  onEdit: (item: MeetingAgendaItem) => void;
  onDelete: (id: string) => void;
  onToggleComplete: (id: string, isCompleted: boolean) => void;
  isDragging?: boolean;
}

export const AgendaItem: React.FC<AgendaItemProps> = ({
  item,
  onEdit,
  onDelete,
  onToggleComplete,
  isDragging = false,
}) => {
  return (
    <div
      className={`agenda-item ${isDragging ? 'dragging' : ''} ${item.is_completed ? 'completed' : ''}`}
    >
      {/* Drag handle */}
      <div className="agenda-drag-handle">
        <GripVertical className="agenda-icon-md" />
      </div>

      {/* Complete checkbox */}
      <button
        onClick={() => onToggleComplete(item.id, !item.is_completed)}
        className={`agenda-checkbox ${item.is_completed ? 'checked' : ''}`}
      >
        {item.is_completed && <CheckCircle2 className="agenda-icon-sm" />}
      </button>

      {/* Content */}
      <div className="agenda-content">
        <h4 className={`agenda-title ${item.is_completed ? 'completed' : ''}`}>
          {item.title}
        </h4>

        {item.description && (
          <p className="agenda-description">{item.description}</p>
        )}

        {item.duration_minutes && (
          <div className="agenda-duration">
            <Clock className="agenda-icon-sm" />
            <span>{item.duration_minutes}分</span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="agenda-actions">
        <button
          onClick={() => onEdit(item)}
          className="agenda-action-btn"
          title="編集"
        >
          <Edit2 className="agenda-icon-sm" />
        </button>

        <button
          onClick={() => onDelete(item.id)}
          className="agenda-action-btn delete"
          title="削除"
        >
          <Trash2 className="agenda-icon-sm" />
        </button>
      </div>
    </div>
  );
};
