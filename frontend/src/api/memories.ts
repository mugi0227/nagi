import { api } from './client';
import type { Memory, MemoryCreate, MemorySearchResult, MemoryScope, MemoryType, MemoryUpdate } from './types';

interface ListMemoriesParams extends Record<string, string | number | undefined> {
  scope?: MemoryScope;
  memory_type?: MemoryType;
  project_id?: string;
  limit?: number;
  offset?: number;
}

interface SearchMemoriesParams extends Record<string, string | number | undefined> {
  query: string;
  scope?: MemoryScope;
  project_id?: string;
  limit?: number;
}

const buildQuery = (params: Record<string, string | number | undefined>): string => {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === '') {
      return;
    }
    searchParams.set(key, String(value));
  });
  const query = searchParams.toString();
  return query ? `?${query}` : '';
};

export const memoriesApi = {
  list: (params: ListMemoriesParams = {}) =>
    api.get<Memory[]>(`/memories${buildQuery(params)}`),
  search: (params: SearchMemoriesParams) =>
    api.get<MemorySearchResult[]>(`/memories/search${buildQuery(params)}`),
  create: (data: MemoryCreate) => api.post<Memory>('/memories', data),
  update: (memoryId: string, data: MemoryUpdate) =>
    api.patch<Memory>(`/memories/${memoryId}`, data),
  delete: (memoryId: string) => api.delete<void>(`/memories/${memoryId}`),
};
