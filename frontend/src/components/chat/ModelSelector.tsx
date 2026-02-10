import { useQuery } from '@tanstack/react-query';
import { modelsApi } from '../../api/models';
import './ModelSelector.css';

interface ModelSelectorProps {
  selectedModel?: string;
  onModelChange: (model?: string) => void;
}

export function ModelSelector({ selectedModel, onModelChange }: ModelSelectorProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['available-models'],
    queryFn: () => modelsApi.listModels(),
    staleTime: 5 * 60_000,
    retry: 1,
  });

  if (isLoading || !data || data.models.length <= 1) {
    return null;
  }

  const effectiveModel = selectedModel || data.default_model_id;

  return (
    <div className="model-selector-row">
      <select
        className="model-selector"
        value={effectiveModel}
        onChange={(e) => {
          const value = e.target.value;
          onModelChange(value === data.default_model_id ? undefined : value);
        }}
        title="AI model"
      >
        {data.models.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}{m.id === data.default_model_id ? ' (default)' : ''}
          </option>
        ))}
      </select>
    </div>
  );
}
