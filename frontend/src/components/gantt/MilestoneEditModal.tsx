import { useState, type FormEvent } from 'react';
import { FaTimes, FaSave, FaTrash, FaRobot, FaFlag } from 'react-icons/fa';
import { motion } from 'framer-motion';
import type { Milestone, MilestoneUpdate, MilestoneStatus } from '../../api/types';
import type { DraftCardData } from '../chat/DraftCard';
import './MilestoneEditModal.css';

interface MilestoneEditModalProps {
  milestone: Milestone;
  linkedTaskCount: number;
  phaseName?: string;
  phaseId: string;
  onClose: () => void;
  onUpdate: (data: MilestoneUpdate) => Promise<void>;
  onDelete: () => void;
  isSubmitting?: boolean;
}

export function MilestoneEditModal({
  milestone,
  linkedTaskCount,
  phaseName,
  phaseId,
  onClose,
  onUpdate,
  onDelete,
  isSubmitting,
}: MilestoneEditModalProps) {
  const [formData, setFormData] = useState({
    title: milestone.title,
    description: milestone.description || '',
    status: milestone.status,
    due_date: milestone.due_date ? milestone.due_date.split('T')[0] : '',
  });

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await onUpdate({
      title: formData.title,
      description: formData.description || undefined,
      status: formData.status,
      due_date: formData.due_date || undefined,
    });
  };

  const handleGenerateTasksFromMilestone = () => {
    const draftCard: DraftCardData = {
      type: 'task',
      title: 'マイルストーンからタスク生成',
      info: [
        { label: 'マイルストーン', value: milestone.title },
        { label: 'マイルストーンID', value: milestone.id },
      ],
      placeholder: '例: 優先度高めのものから3件だけ',
      promptTemplate: `マイルストーン「${milestone.title}」(ID: ${milestone.id}) に紐づくタスクを作成して。
マイルストーンの説明: ${milestone.description || 'なし'}
期限: ${milestone.due_date || '未設定'}

追加の指示があれば以下に記入:
{instruction}`,
    };

    const event = new CustomEvent('secretary:chat-open', { detail: { draftCard } });
    window.dispatchEvent(event);
    onClose();
  };

  const handleGenerateMilestonesFromPhase = () => {
    const draftCard: DraftCardData = {
      type: 'task',
      title: 'フェーズからマイルストーン生成',
      info: [
        { label: 'フェーズ', value: phaseName || 'N/A' },
        { label: 'フェーズID', value: phaseId },
      ],
      placeholder: '例: 2週間ごとにマイルストーンを設定',
      promptTemplate: `フェーズ「${phaseName || 'N/A'}」(ID: ${phaseId}) にマイルストーンを追加して。

追加の指示があれば以下に記入:
{instruction}`,
    };

    const event = new CustomEvent('secretary:chat-open', { detail: { draftCard } });
    window.dispatchEvent(event);
    onClose();
  };

  const statusOptions: { value: MilestoneStatus; label: string }[] = [
    { value: 'ACTIVE', label: 'アクティブ' },
    { value: 'COMPLETED', label: '完了' },
    { value: 'ARCHIVED', label: 'アーカイブ' },
  ];

  return (
    <motion.div
      className="modal-overlay"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="base-modal milestone-edit-modal"
        initial={{ scale: 0.95, opacity: 0, y: 10 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 10 }}
        transition={{ type: 'spring', damping: 30, stiffness: 450, mass: 0.8 }}
      >
        <div className="modal-header">
          <h2>
            <FaFlag className="header-icon" />
            マイルストーン編集
          </h2>
          <button className="close-btn" onClick={onClose} type="button">
            <FaTimes />
          </button>
        </div>

        <form className="milestone-form" onSubmit={handleSubmit}>
          {/* 基本情報 */}
          <div className="form-section">
            <div className="form-group">
              <label htmlFor="title">タイトル *</label>
              <input
                type="text"
                id="title"
                className="title-input"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                required
                autoFocus
              />
            </div>

            <div className="form-group">
              <label htmlFor="description">説明</label>
              <textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="マイルストーンの説明..."
              />
            </div>
          </div>

          {/* ステータス・期限 */}
          <div className="form-section">
            <h3 className="section-title">設定</h3>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="status">ステータス</label>
                <div className="segmented-control">
                  {statusOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={`segment-btn ${formData.status === option.value ? 'active' : ''}`}
                      onClick={() => setFormData({ ...formData, status: option.value })}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="due_date">期限</label>
                <input
                  type="date"
                  id="due_date"
                  value={formData.due_date}
                  onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                />
              </div>
            </div>
          </div>

          {/* AI生成セクション */}
          <div className="form-section ai-section">
            <h3 className="section-title">
              <FaRobot /> AI生成
            </h3>
            <div className="ai-action-buttons">
              <button
                type="button"
                className="ai-action-btn primary"
                onClick={handleGenerateTasksFromMilestone}
              >
                <FaRobot /> タスクを生成
              </button>
              <button
                type="button"
                className="ai-action-btn secondary"
                onClick={handleGenerateMilestonesFromPhase}
              >
                <FaFlag /> このフェーズにマイルストーン追加
              </button>
            </div>
            <p className="field-hint">
              ボタンを押すとチャット画面が開き、プロンプトが自動入力されます。
            </p>
          </div>

          {/* 紐づきタスク情報 */}
          {linkedTaskCount > 0 && (
            <div className="linked-tasks-info">
              <span className="linked-count">{linkedTaskCount}件</span>のタスクが紐づいています
            </div>
          )}

          {/* フッター */}
          <div className="modal-footer">
            <button
              type="button"
              className="delete-btn"
              onClick={onDelete}
              disabled={isSubmitting}
            >
              <FaTrash /> 削除
            </button>
            <div className="footer-right">
              <button type="button" className="cancel-btn" onClick={onClose} disabled={isSubmitting}>
                キャンセル
              </button>
              <button type="submit" className="submit-btn" disabled={isSubmitting || !formData.title}>
                <FaSave />
                <span>{isSubmitting ? '保存中...' : '保存'}</span>
              </button>
            </div>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}
