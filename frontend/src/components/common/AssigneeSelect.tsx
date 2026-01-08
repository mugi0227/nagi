import { useState, useRef, useEffect } from 'react';
import { FaUser, FaCheck, FaTimes, FaChevronDown } from 'react-icons/fa';
import './AssigneeSelect.css';

interface MemberOption {
  id: string;
  label: string;
}

interface AssigneeSelectProps {
  taskId: string;
  selectedIds: string[];
  options: MemberOption[];
  onChange: (taskId: string, memberIds: string[]) => void;
  placeholder?: string;
  compact?: boolean;
}

export function AssigneeSelect({
  taskId,
  selectedIds,
  options,
  onChange,
  placeholder = '担当者を選択',
  compact = false,
}: AssigneeSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(!isOpen);
  };

  const handleSelect = (memberId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newSelection = selectedIds.includes(memberId)
      ? selectedIds.filter(id => id !== memberId)
      : [...selectedIds, memberId];
    onChange(taskId, newSelection);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(taskId, []);
  };

  const selectedMembers = options.filter(opt => selectedIds.includes(opt.id));

  return (
    <div
      ref={containerRef}
      className={`assignee-select-container ${compact ? 'compact' : ''} ${isOpen ? 'open' : ''}`}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        role="button"
        tabIndex={0}
        className={`assignee-select-trigger ${isOpen ? 'open' : ''} ${selectedIds.length > 0 ? 'has-selection' : ''}`}
        onClick={handleToggle}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleToggle(e as unknown as React.MouseEvent); }}
      >
        <FaUser className="trigger-icon" />
        {selectedMembers.length === 0 ? (
          <span className="placeholder">{placeholder}</span>
        ) : (
          <div className="selected-preview">
            {selectedMembers.slice(0, 2).map(member => (
              <span key={member.id} className="selected-chip">
                {member.label}
              </span>
            ))}
            {selectedMembers.length > 2 && (
              <span className="more-count">+{selectedMembers.length - 2}</span>
            )}
          </div>
        )}
        <div className="trigger-actions">
          {selectedIds.length > 0 && (
            <span
              role="button"
              tabIndex={0}
              className="clear-btn"
              onClick={handleClear}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleClear(e as unknown as React.MouseEvent); }}
              title="クリア"
            >
              <FaTimes />
            </span>
          )}
          <FaChevronDown className={`chevron ${isOpen ? 'rotated' : ''}`} />
        </div>
      </div>

      {isOpen && (
        <div className="assignee-dropdown">
          <div className="dropdown-header">
            <span className="dropdown-title">担当者を選択</span>
            <span className="selection-count">{selectedIds.length}人選択中</span>
          </div>
          <div className="dropdown-options">
            {options.length === 0 ? (
              <div className="no-options">メンバーがいません</div>
            ) : (
              options.map(option => {
                const isSelected = selectedIds.includes(option.id);
                const isInvitation = option.id.startsWith('inv:');
                return (
                  <button
                    key={option.id}
                    type="button"
                    className={`option-item ${isSelected ? 'selected' : ''} ${isInvitation ? 'invitation' : ''}`}
                    onClick={(e) => handleSelect(option.id, e)}
                  >
                    <div className="option-checkbox">
                      {isSelected && <FaCheck />}
                    </div>
                    <span className="option-label">{option.label}</span>
                    {isInvitation && <span className="invitation-badge">招待中</span>}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
