import { api } from './client';
import type { AvailableModelsResponse } from './types';

export const modelsApi = {
  listModels: () => api.get<AvailableModelsResponse>('/models'),
};
