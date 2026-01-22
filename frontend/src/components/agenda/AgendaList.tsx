/**
 * Agenda list component with drag-and-drop reordering
 */

import React, { useState } from 'react';
import './Agenda.css';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Plus, Loader2, AlertCircle } from 'lucide-react';
import { AgendaItem } from './AgendaItem';
import { AgendaModal } from './AgendaModal';
import {
  useAgendaItems,
  useTaskAgendaItems,
  useCreateAgendaItem,
  useCreateTaskAgendaItem,
  useUpdateAgendaItem,
  useDeleteAgendaItem,
  useReorderAgendaItems,
} from '../../hooks/useAgenda';
import type { MeetingAgendaItem, MeetingAgendaItemCreate } from '../../types/agenda';

interface AgendaListProps {
  meetingId?: string;  // RecurringMeeting ID (for recurring meetings)
  taskId?: string;     // Task ID (for standalone meetings)
  eventDate?: string;  // YYYY-MM-DD format
  readonly?: boolean;  // Hide edit/delete/add controls
}

// Sortable wrapper for AgendaItem
function SortableAgendaItem({
  item,
  onEdit,
  onDelete,
  onToggleComplete,
  readonly,
}: {
  item: MeetingAgendaItem;
  onEdit: (item: MeetingAgendaItem) => void;
  onDelete: (id: string) => void;
  onToggleComplete: (id: string, isCompleted: boolean) => void;
  readonly?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: readonly,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  // Pass drag listeners only to the drag handle, not the entire item
  const dragHandleProps = readonly ? undefined : { ...attributes, ...listeners };

  return (
    <div ref={setNodeRef} style={style}>
      <AgendaItem
        item={item}
        onEdit={onEdit}
        onDelete={onDelete}
        onToggleComplete={onToggleComplete}
        isDragging={isDragging}
        readonly={readonly}
        dragHandleProps={dragHandleProps}
      />
    </div>
  );
}

export const AgendaList: React.FC<AgendaListProps> = ({ meetingId, taskId, eventDate, readonly = false }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MeetingAgendaItem | null>(null);

  // Determine if this is a standalone meeting (taskId only, no meetingId)
  const isStandalone = taskId && !meetingId;

  // Use meeting-based hooks for recurring meetings, task-based for standalone
  const meetingQuery = useAgendaItems(meetingId, eventDate);
  const taskQuery = useTaskAgendaItems(isStandalone ? taskId : undefined);

  // Select the appropriate query result
  const { data: items = [], isLoading, error } = isStandalone ? taskQuery : meetingQuery;

  // Create mutations - use task-based for standalone, meeting-based otherwise
  const meetingCreateMutation = useCreateAgendaItem(meetingId || '', eventDate);
  const taskCreateMutation = useCreateTaskAgendaItem(taskId || '');
  const createMutation = isStandalone ? taskCreateMutation : meetingCreateMutation;

  // Update, delete, and reorder mutations - pass both IDs for proper cache invalidation
  const updateMutation = useUpdateAgendaItem(meetingId, eventDate, taskId);
  const deleteMutation = useDeleteAgendaItem(meetingId, eventDate, taskId);
  const reorderMutation = useReorderAgendaItems(meetingId, eventDate, taskId);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = items.findIndex((item) => item.id === active.id);
      const newIndex = items.findIndex((item) => item.id === over.id);

      const reordered = arrayMove(items, oldIndex, newIndex);
      const orderedIds = reordered.map((item) => item.id);

      reorderMutation.mutate(orderedIds);
    }
  };

  const handleCreate = (data: MeetingAgendaItemCreate) => {
    const orderIndex = items.length;
    createMutation.mutate(
      { ...data, order_index: orderIndex },
      {
        onSuccess: () => {
          setIsModalOpen(false);
        },
      }
    );
  };

  const handleUpdate = (id: string, data: MeetingAgendaItemCreate) => {
    updateMutation.mutate(
      { id, data },
      {
        onSuccess: () => {
          setIsModalOpen(false);
          setEditingItem(null);
        },
      }
    );
  };

  const handleEdit = (item: MeetingAgendaItem) => {
    setEditingItem(item);
    setIsModalOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm('このアジェンダ項目を削除しますか?')) {
      deleteMutation.mutate(id);
    }
  };

  const handleToggleComplete = (id: string, isCompleted: boolean) => {
    updateMutation.mutate({ id, data: { is_completed: isCompleted } });
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setEditingItem(null);
  };

  const totalDuration = items.reduce((sum, item) => sum + (item.duration_minutes || 0), 0);

  if (isLoading) {
    return (
      <div className="agenda-loading-container">
        <Loader2 className="agenda-loading-spinner" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="agenda-error-container">
        <AlertCircle className="agenda-icon-md" />
        <span>アジェンダの読み込みに失敗しました</span>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="agenda-list-header">
        <div>
          <h3>アジェンダ</h3>
          {totalDuration > 0 && (
            <p className="agenda-total-time">合計時間: {totalDuration}分</p>
          )}
        </div>

        {!readonly && (
          <button
            onClick={() => setIsModalOpen(true)}
            className="agenda-add-btn"
          >
            <Plus className="agenda-icon-sm" />
            <span>追加</span>
          </button>
        )}
      </div>

      {/* Agenda items */}
      {items.length === 0 ? (
        <div className="agenda-empty">
          <p>アジェンダがまだ登録されていません</p>
          <p>「追加」ボタンから議題を登録してください</p>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
            <div className="agenda-items-container">
              {items.map((item) => (
                <SortableAgendaItem
                  key={item.id}
                  item={item}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onToggleComplete={handleToggleComplete}
                  readonly={readonly}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* Add/Edit Modal */}
      <AgendaModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        onSubmit={editingItem ? (data) => handleUpdate(editingItem.id, data) : handleCreate}
        initialData={editingItem || undefined}
        isSubmitting={createMutation.isPending || updateMutation.isPending}
      />
    </div>
  );
};
