import { useState, useEffect, FormEvent } from 'react';
import { FaTimes, FaSave } from 'react-icons/fa';
import { useProjects } from '../../hooks/useProjects';
import type { Task, TaskCreate, TaskUpdate, Priority, EnergyLevel } from '../../api/types';
import './TaskFormModal.css';

interface TaskFormModalProps {
  task?: Task;
  onClose: () => void;
  onSubmit: (data: TaskCreate | TaskUpdate) => void;
  isSubmitting?: boolean;
}

export function TaskFormModal({ task, onClose, onSubmit, isSubmitting }: TaskFormModalProps) {
  const { projects } = useProjects();
  const isEditMode = !!task;

  const [formData, setFormData] = useState({
    title: task?.title || '',
    description: task?.description || '',
    importance: task?.importance || 'MEDIUM' as Priority,
    urgency: task?.urgency || 'MEDIUM' as Priority,
    energy_level: task?.energy_level || 'LOW' as EnergyLevel,
    estimated_minutes: task?.estimated_minutes?.toString() || '',
    due_date: task?.due_date ? new Date(task.due_date).toISOString().slice(0, 16) : '',
    project_id: task?.project_id || '',
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();

    const submitData: TaskCreate | TaskUpdate = {
      title: formData.title,
      description: formData.description || undefined,
      importance: formData.importance,
      urgency: formData.urgency,
      energy_level: formData.energy_level,
      estimated_minutes: formData.estimated_minutes ? parseInt(formData.estimated_minutes) : undefined,
      due_date: formData.due_date || undefined,
      project_id: formData.project_id || undefined,
    };

    onSubmit(submitData);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="task-form-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{isEditMode ? 'タスク編集' : '新規タスク作成'}</h2>
          <button className="close-btn" onClick={onClose}>
            <FaTimes />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="task-form">
          {/* Title */}
          <div className="form-group">
            <label htmlFor="title">タスク名 *</label>
            <input
              type="text"
              id="title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="例: 確定申告の書類を集める"
              required
              autoFocus
            />
          </div>

          {/* Description */}
          <div className="form-group">
            <label htmlFor="description">説明</label>
            <textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="詳細や補足情報を入力..."
              rows={3}
            />
          </div>

          {/* Priority Row */}
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="importance">重要度</label>
              <select
                id="importance"
                value={formData.importance}
                onChange={(e) => setFormData({ ...formData, importance: e.target.value as Priority })}
              >
                <option value="HIGH">高</option>
                <option value="MEDIUM">中</option>
                <option value="LOW">低</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="urgency">緊急度</label>
              <select
                id="urgency"
                value={formData.urgency}
                onChange={(e) => setFormData({ ...formData, urgency: e.target.value as Priority })}
              >
                <option value="HIGH">高</option>
                <option value="MEDIUM">中</option>
                <option value="LOW">低</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="energy_level">エネルギー</label>
              <select
                id="energy_level"
                value={formData.energy_level}
                onChange={(e) => setFormData({ ...formData, energy_level: e.target.value as EnergyLevel })}
              >
                <option value="LOW">軽い</option>
                <option value="HIGH">重い</option>
              </select>
            </div>
          </div>

          {/* Time & Date Row */}
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="estimated_minutes">見積時間（分）</label>
              <input
                type="number"
                id="estimated_minutes"
                value={formData.estimated_minutes}
                onChange={(e) => setFormData({ ...formData, estimated_minutes: e.target.value })}
                placeholder="15"
                min="1"
              />
            </div>

            <div className="form-group">
              <label htmlFor="due_date">期限</label>
              <input
                type="datetime-local"
                id="due_date"
                value={formData.due_date}
                onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
              />
            </div>
          </div>

          {/* Project */}
          <div className="form-group">
            <label htmlFor="project_id">プロジェクト</label>
            <select
              id="project_id"
              value={formData.project_id}
              onChange={(e) => setFormData({ ...formData, project_id: e.target.value })}
            >
              <option value="">なし（Inbox）</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>

          {/* Actions */}
          <div className="form-actions">
            <button type="button" onClick={onClose} className="cancel-btn">
              キャンセル
            </button>
            <button type="submit" className="submit-btn" disabled={isSubmitting || !formData.title}>
              <FaSave />
              {isSubmitting ? '保存中...' : (isEditMode ? '更新' : '作成')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
