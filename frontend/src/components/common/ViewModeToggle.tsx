import { FaGrip, FaList } from 'react-icons/fa6';
import './ViewModeToggle.css';

export type ViewMode = 'normal' | 'compact';

const STORAGE_KEY = 'kanbanViewMode';

export function getStoredViewMode(): ViewMode {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'compact' ? 'compact' : 'normal';
}

export function setStoredViewMode(mode: ViewMode) {
  localStorage.setItem(STORAGE_KEY, mode);
}

interface ViewModeToggleProps {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
}

export function ViewModeToggle({ value, onChange }: ViewModeToggleProps) {
  return (
    <div className="view-mode-toggle">
      <button
        className={`view-mode-btn ${value === 'normal' ? 'active' : ''}`}
        onClick={() => onChange('normal')}
        title="通常表示"
      >
        <FaGrip />
      </button>
      <button
        className={`view-mode-btn ${value === 'compact' ? 'active' : ''}`}
        onClick={() => onChange('compact')}
        title="コンパクト表示"
      >
        <FaList />
      </button>
    </div>
  );
}
