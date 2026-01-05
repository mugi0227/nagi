import { useState } from 'react';
import { FaPlus, FaEdit, FaTrash, FaCheck, FaTimes, FaChevronUp, FaChevronDown } from 'react-icons/fa';
import { motion, AnimatePresence } from 'framer-motion';
import type { PhaseWithTaskCount, PhaseCreate, PhaseUpdate } from '../../api/types';
import './PhaseList.css';

interface PhaseListProps {
  phases: PhaseWithTaskCount[];
  onCreatePhase: (phase: PhaseCreate) => Promise<void>;
  onUpdatePhase: (id: string, phase: PhaseUpdate) => Promise<void>;
  onDeletePhase: (id: string) => Promise<void>;
  projectId: string;
}

export function PhaseList({ phases, onCreatePhase, onUpdatePhase, onDeletePhase, projectId }: PhaseListProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newPhaseName, setNewPhaseName] = useState('');
  const [newPhaseDescription, setNewPhaseDescription] = useState('');
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');

  const handleCreate = async () => {
    if (!newPhaseName.trim()) return;

    try {
      await onCreatePhase({
        project_id: projectId,
        name: newPhaseName,
        description: newPhaseDescription || undefined,
        order_in_project: phases.length + 1,
      });
      setNewPhaseName('');
      setNewPhaseDescription('');
      setIsAdding(false);
    } catch (error) {
      console.error('Failed to create phase:', error);
      alert('フェーズの作成に失敗しました');
    }
  };

  const handleUpdate = async (id: string) => {
    if (!editName.trim()) return;

    try {
      await onUpdatePhase(id, {
        name: editName,
        description: editDescription || undefined,
      });
      setEditingId(null);
    } catch (error) {
      console.error('Failed to update phase:', error);
      alert('フェーズの更新に失敗しました');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('このフェーズを削除しますか？')) return;

    try {
      await onDeletePhase(id);
    } catch (error) {
      console.error('Failed to delete phase:', error);
      alert('フェーズの削除に失敗しました');
    }
  };

  const handleStartEdit = (phase: PhaseWithTaskCount) => {
    setEditingId(phase.id);
    setEditName(phase.name);
    setEditDescription(phase.description || '');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditName('');
    setEditDescription('');
  };

  const handleMoveUp = async (phase: PhaseWithTaskCount) => {
    if (phase.order_in_project <= 1) return;
    await onUpdatePhase(phase.id, { order_in_project: phase.order_in_project - 1 });
  };

  const handleMoveDown = async (phase: PhaseWithTaskCount) => {
    if (phase.order_in_project >= phases.length) return;
    await onUpdatePhase(phase.id, { order_in_project: phase.order_in_project + 1 });
  };

  const sortedPhases = [...phases].sort((a, b) => a.order_in_project - b.order_in_project);

  return (
    <div className="phase-list">
      <div className="phase-list-header">
        <h3>フェーズ管理</h3>
        <button className="add-phase-btn" onClick={() => setIsAdding(true)}>
          <FaPlus /> フェーズを追加
        </button>
      </div>

      <AnimatePresence>
        {isAdding && (
          <motion.div
            className="phase-form"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <input
              type="text"
              placeholder="フェーズ名"
              value={newPhaseName}
              onChange={(e) => setNewPhaseName(e.target.value)}
              className="phase-name-input"
              autoFocus
            />
            <textarea
              placeholder="説明（任意）"
              value={newPhaseDescription}
              onChange={(e) => setNewPhaseDescription(e.target.value)}
              className="phase-description-input"
              rows={2}
            />
            <div className="phase-form-actions">
              <button className="btn-save" onClick={handleCreate}>
                <FaCheck /> 作成
              </button>
              <button className="btn-cancel" onClick={() => {
                setIsAdding(false);
                setNewPhaseName('');
                setNewPhaseDescription('');
              }}>
                <FaTimes /> キャンセル
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="phases-container">
        <AnimatePresence>
          {sortedPhases.map((phase, index) => (
            <motion.div
              key={phase.id}
              className={`phase-item ${phase.status === 'COMPLETED' ? 'phase-completed' : ''}`}
              layout
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              {editingId === phase.id ? (
                <div className="phase-edit-form">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="phase-name-input"
                    autoFocus
                  />
                  <textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    className="phase-description-input"
                    rows={2}
                  />
                  <div className="phase-form-actions">
                    <button className="btn-save" onClick={() => handleUpdate(phase.id)}>
                      <FaCheck /> 保存
                    </button>
                    <button className="btn-cancel" onClick={handleCancelEdit}>
                      <FaTimes /> キャンセル
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="phase-header">
                    <div className="phase-order-controls">
                      <button
                        className="order-btn"
                        onClick={() => handleMoveUp(phase)}
                        disabled={index === 0}
                        title="上へ移動"
                      >
                        <FaChevronUp />
                      </button>
                      <span className="phase-order">{phase.order_in_project}</span>
                      <button
                        className="order-btn"
                        onClick={() => handleMoveDown(phase)}
                        disabled={index === sortedPhases.length - 1}
                        title="下へ移動"
                      >
                        <FaChevronDown />
                      </button>
                    </div>
                    <div className="phase-info">
                      <h4 className="phase-name">{phase.name}</h4>
                      {phase.description && (
                        <p className="phase-description">{phase.description}</p>
                      )}
                    </div>
                    <div className="phase-stats">
                      <span className="stat">
                        全体: <strong>{phase.total_tasks}</strong>
                      </span>
                      <span className="stat in-progress">
                        進行中: <strong>{phase.in_progress_tasks}</strong>
                      </span>
                      <span className="stat completed">
                        完了: <strong>{phase.completed_tasks}</strong>
                      </span>
                    </div>
                    <div className="phase-actions">
                      <button
                        className="btn-icon"
                        onClick={() => handleStartEdit(phase)}
                        title="編集"
                      >
                        <FaEdit />
                      </button>
                      <button
                        className="btn-icon btn-danger"
                        onClick={() => handleDelete(phase.id)}
                        title="削除"
                      >
                        <FaTrash />
                      </button>
                    </div>
                  </div>
                </>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {sortedPhases.length === 0 && !isAdding && (
        <div className="empty-state">
          <p>フェーズがまだありません</p>
          <button className="btn-primary" onClick={() => setIsAdding(true)}>
            <FaPlus /> 最初のフェーズを追加
          </button>
        </div>
      )}
    </div>
  );
}
