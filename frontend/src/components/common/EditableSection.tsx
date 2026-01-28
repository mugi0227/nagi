import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FaCheck, FaEdit, FaTimes } from 'react-icons/fa';
import './EditableSection.css';

interface EditableSectionProps {
  value: string | null | undefined;
  onSave: (newValue: string) => Promise<void>;
  placeholder?: string;
  className?: string;
  multiline?: boolean;
  markdown?: boolean;
  renderView?: (value: string) => React.ReactNode;
  disabled?: boolean;
  minRows?: number;
}

export function EditableSection({
  value,
  onSave,
  placeholder = '未設定',
  className = '',
  multiline = false,
  markdown = false,
  renderView,
  disabled = false,
  minRows = 3,
}: EditableSectionProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [pendingValue, setPendingValue] = useState(value || '');
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      // カーソルを末尾に
      if (inputRef.current instanceof HTMLTextAreaElement || inputRef.current instanceof HTMLInputElement) {
        const len = inputRef.current.value.length;
        inputRef.current.setSelectionRange(len, len);
      }
    }
  }, [isEditing]);

  const handleStartEdit = useCallback(() => {
    if (disabled) return;
    setPendingValue(value || '');
    setIsEditing(true);
  }, [value, disabled]);

  const handleSave = useCallback(async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      await onSave(pendingValue);
      setIsEditing(false);
    } catch (error) {
      console.error('Failed to save:', error);
    } finally {
      setIsSaving(false);
    }
  }, [pendingValue, onSave, isSaving]);

  const handleCancel = useCallback(() => {
    setIsEditing(false);
    setPendingValue(value || '');
  }, [value]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleCancel();
    } else if (e.key === 'Enter' && !multiline) {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Enter' && e.metaKey && multiline) {
      e.preventDefault();
      handleSave();
    }
  }, [handleCancel, handleSave, multiline]);

  const displayValue = value || '';
  const isEmpty = !displayValue.trim();

  return (
    <div className={`editable-section ${className} ${isEditing ? 'editing' : ''} ${disabled ? 'disabled' : ''}`}>
      <AnimatePresence mode="wait">
        {isEditing ? (
          <motion.div
            key="edit"
            className="editable-edit-mode"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            {multiline ? (
              <textarea
                ref={inputRef as React.RefObject<HTMLTextAreaElement>}
                value={pendingValue}
                onChange={(e) => setPendingValue(e.target.value)}
                onKeyDown={handleKeyDown}
                className="editable-textarea"
                rows={minRows}
                placeholder={placeholder}
                disabled={isSaving}
              />
            ) : (
              <input
                ref={inputRef as React.RefObject<HTMLInputElement>}
                type="text"
                value={pendingValue}
                onChange={(e) => setPendingValue(e.target.value)}
                onKeyDown={handleKeyDown}
                className="editable-input"
                placeholder={placeholder}
                disabled={isSaving}
              />
            )}
            <div className="editable-actions">
              <button
                type="button"
                className="editable-btn save"
                onClick={handleSave}
                disabled={isSaving}
                title="保存 (Enter)"
              >
                <FaCheck />
              </button>
              <button
                type="button"
                className="editable-btn cancel"
                onClick={handleCancel}
                disabled={isSaving}
                title="キャンセル (Esc)"
              >
                <FaTimes />
              </button>
            </div>
            {multiline && (
              <span className="editable-hint">Cmd+Enter で保存、Esc でキャンセル</span>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="view"
            className="editable-view-mode"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={handleStartEdit}
          >
            <div className={`editable-content ${isEmpty ? 'empty' : ''} ${markdown ? 'markdown-content' : ''}`}>
              {isEmpty ? (
                <span className="editable-placeholder">{placeholder}</span>
              ) : renderView ? (
                renderView(displayValue)
              ) : (
                displayValue
              )}
            </div>
            {!disabled && (
              <button
                type="button"
                className="editable-edit-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  handleStartEdit();
                }}
                title="編集"
              >
                <FaEdit />
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
