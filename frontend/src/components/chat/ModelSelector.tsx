import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { modelsApi } from '../../api/models';
import './ModelSelector.css';

interface ModelSelectorProps {
  selectedModel?: string;
  onModelChange: (model?: string) => void;
}

export function ModelSelector({ selectedModel, onModelChange }: ModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['available-models'],
    queryFn: () => modelsApi.listModels(),
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const close = useCallback(() => setIsOpen(false), []);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        close();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, close]);

  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [isOpen, close]);

  if (isLoading || !data || data.models.length <= 1) {
    return null;
  }

  const effectiveModel = selectedModel || data.default_model_id;
  const currentModel = data.models.find((m) => m.id === effectiveModel);

  const handleSelect = (modelId: string) => {
    onModelChange(modelId === data.default_model_id ? undefined : modelId);
    close();
  };

  return (
    <div className="model-selector-row">
      <span className="model-selector-label">Model</span>
      <div className="model-selector-dropdown" ref={dropdownRef}>
        <button
          type="button"
          className={`model-selector-trigger ${isOpen ? 'open' : ''}`}
          onClick={() => setIsOpen((prev) => !prev)}
          title="AI model"
        >
          <span className="model-selector-value">
            {currentModel?.name ?? effectiveModel}
          </span>
          <svg className="model-selector-chevron" width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        {isOpen && (
          <ul className="model-selector-menu">
            {data.models.map((m) => {
              const isActive = m.id === effectiveModel;
              const isDefault = m.id === data.default_model_id;
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    className={`model-selector-option ${isActive ? 'active' : ''}`}
                    onClick={() => handleSelect(m.id)}
                  >
                    <span className="model-option-name">{m.name}</span>
                    {isDefault && <span className="model-option-badge">default</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
