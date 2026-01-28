import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useState } from 'react';
import { FaEdit, FaTimes } from 'react-icons/fa';
import './EditableSegment.css';

interface Option {
  value: string;
  label: string;
  icon?: React.ReactNode;
}

interface EditableSegmentProps {
  value: string;
  options: Option[];
  onSave: (newValue: string) => Promise<void>;
  className?: string;
  disabled?: boolean;
  renderValue?: (value: string, option?: Option) => React.ReactNode;
}

export function EditableSegment({
  value,
  options,
  onSave,
  className = '',
  disabled = false,
  renderValue,
}: EditableSegmentProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const currentOption = options.find(o => o.value === value);

  const handleSelect = useCallback(async (newValue: string) => {
    if (newValue === value || isSaving) return;
    setIsSaving(true);
    try {
      await onSave(newValue);
      setIsEditing(false);
    } catch (error) {
      console.error('Failed to save:', error);
    } finally {
      setIsSaving(false);
    }
  }, [value, onSave, isSaving]);

  const handleStartEdit = useCallback(() => {
    if (disabled) return;
    setIsEditing(true);
  }, [disabled]);

  const handleCancel = useCallback(() => {
    setIsEditing(false);
  }, []);

  return (
    <div className={`editable-segment ${className} ${isEditing ? 'editing' : ''} ${disabled ? 'disabled' : ''}`}>
      <AnimatePresence mode="wait">
        {isEditing ? (
          <motion.div
            key="edit"
            className="segment-edit-mode"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <div className="segment-options">
              {options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`segment-option ${option.value === value ? 'selected' : ''}`}
                  onClick={() => handleSelect(option.value)}
                  disabled={isSaving}
                >
                  {option.icon}
                  {option.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="segment-cancel-btn"
              onClick={handleCancel}
              disabled={isSaving}
              title="閉じる"
            >
              <FaTimes />
            </button>
          </motion.div>
        ) : (
          <motion.div
            key="view"
            className="segment-view-mode"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={handleStartEdit}
          >
            <div className="segment-value">
              {renderValue ? renderValue(value, currentOption) : (
                <>
                  {currentOption?.icon}
                  {currentOption?.label || value}
                </>
              )}
            </div>
            {!disabled && (
              <button
                type="button"
                className="segment-edit-btn"
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
