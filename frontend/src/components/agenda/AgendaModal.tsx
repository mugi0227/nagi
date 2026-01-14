/**
 * Modal for adding/editing agenda items
 */

import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import './Agenda.css';
import { useForm } from 'react-hook-form';
import { X } from 'lucide-react';
import type { MeetingAgendaItem, MeetingAgendaItemCreate } from '../../types/agenda';

interface AgendaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: MeetingAgendaItemCreate) => void;
  initialData?: Partial<MeetingAgendaItem>;
  isSubmitting?: boolean;
}

export const AgendaModal: React.FC<AgendaModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  initialData,
  isSubmitting = false,
}) => {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<MeetingAgendaItemCreate>({
    defaultValues: {
      title: initialData?.title || '',
      description: initialData?.description || '',
      duration_minutes: initialData?.duration_minutes || undefined,
    },
  });

  useEffect(() => {
    if (isOpen) {
      reset({
        title: initialData?.title || '',
        description: initialData?.description || '',
        duration_minutes: initialData?.duration_minutes || undefined,
      });
    }
  }, [isOpen, initialData, reset]);

  if (!isOpen) return null;

  const handleFormSubmit = (data: MeetingAgendaItemCreate) => {
    onSubmit(data);
  };

  return createPortal(
    <div className="agenda-modal-overlay">
      {/* Modal */}
      <div className="agenda-modal-content">
        {/* Header */}
        <div className="agenda-modal-header">
          <h2>{initialData ? 'アジェンダ編集' : 'アジェンダ追加'}</h2>
          <button
            onClick={onClose}
            className="agenda-modal-close-btn"
          >
            <X className="agenda-icon-md" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(handleFormSubmit)} className="agenda-modal-form">
          {/* Title */}
          <div className="agenda-form-group">
            <label htmlFor="title" className="agenda-form-label">
              議題タイトル <span className="required">*</span>
            </label>
            <input
              id="title"
              type="text"
              {...register('title', { required: 'タイトルは必須です' })}
              className={`agenda-form-input ${errors.title ? 'error' : ''}`}
              placeholder="例: プロジェクト進捗報告"
            />
            {errors.title && (
              <p className="agenda-form-error">{errors.title.message}</p>
            )}
          </div>

          {/* Description */}
          <div className="agenda-form-group">
            <label htmlFor="description" className="agenda-form-label">
              説明（オプション）
            </label>
            <textarea
              id="description"
              {...register('description')}
              rows={3}
              className="agenda-form-textarea"
              placeholder="例: 各チームの進捗を共有し、課題を洗い出す"
            />
          </div>

          {/* Duration */}
          <div className="agenda-form-group">
            <label htmlFor="duration_minutes" className="agenda-form-label">
              割り当て時間（分）
            </label>
            <input
              id="duration_minutes"
              type="number"
              {...register('duration_minutes', {
                valueAsNumber: true,
                min: { value: 1, message: '1分以上を指定してください' },
                max: { value: 480, message: '480分以下を指定してください' },
              })}
              className={`agenda-form-input ${errors.duration_minutes ? 'error' : ''}`}
              placeholder="15"
              min="1"
              max="480"
            />
            {errors.duration_minutes && (
              <p className="agenda-form-error">{errors.duration_minutes.message}</p>
            )}
          </div>

          {/* Actions */}
          <div className="agenda-modal-actions">
            <button
              type="button"
              onClick={onClose}
              className="agenda-btn agenda-btn-secondary"
              disabled={isSubmitting}
            >
              キャンセル
            </button>
            <button
              type="submit"
              className="agenda-btn agenda-btn-primary"
              disabled={isSubmitting}
            >
              {isSubmitting ? '保存中...' : initialData ? '更新' : '追加'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};
