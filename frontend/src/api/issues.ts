import { api, getBaseUrl, getAuthHeaders } from './client';
import type {
  Issue,
  IssueCreate,
  IssueUpdate,
  IssueStatusUpdate,
  IssueListResponse,
  IssueCategory,
  IssueStatus,
  IssueChatChunk,
} from './types';

interface ListIssuesParams extends Record<string, string | number | undefined> {
  category?: IssueCategory;
  status?: IssueStatus;
  sort_by?: 'created_at' | 'like_count';
  sort_order?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

interface SearchIssuesParams extends Record<string, string | number | undefined> {
  query: string;
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

export const issuesApi = {
  // Issue CRUD
  list: (params: ListIssuesParams = {}) =>
    api.get<IssueListResponse>(`/issues${buildQuery(params)}`),

  search: (params: SearchIssuesParams) =>
    api.get<Issue[]>(`/issues/search${buildQuery(params)}`),

  get: (issueId: string) => api.get<Issue>(`/issues/${issueId}`),

  create: (data: IssueCreate) => api.post<Issue>('/issues', data),

  update: (issueId: string, data: IssueUpdate) =>
    api.patch<Issue>(`/issues/${issueId}`, data),

  updateStatus: (issueId: string, data: IssueStatusUpdate) =>
    api.patch<Issue>(`/issues/${issueId}/status`, data),

  delete: (issueId: string) => api.delete<void>(`/issues/${issueId}`),

  // Like
  like: (issueId: string) => api.post<Issue>(`/issues/${issueId}/like`, {}),

  unlike: (issueId: string) => api.delete<Issue>(`/issues/${issueId}/like`),

  // Chat Stream
  chatStream: async function* (
    message: string,
    sessionId?: string
  ): AsyncGenerator<IssueChatChunk> {
    const baseUrl = getBaseUrl();
    const headers = getAuthHeaders();

    const response = await fetch(`${baseUrl}/issues/chat/stream`, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message, session_id: sessionId }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Parse SSE events
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const jsonStr = line.slice(6);
          if (jsonStr) {
            try {
              const chunk = JSON.parse(jsonStr) as IssueChatChunk;
              yield chunk;
            } catch {
              console.error('Failed to parse chunk:', jsonStr);
            }
          }
        }
      }
    }
  },
};
