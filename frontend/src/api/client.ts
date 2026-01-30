import { clearAuthToken, getAuthToken } from './auth';

/**
 * API Client - Fetch wrapper with error handling
 */

// Use relative path in development (proxied by Vite), absolute in production
const API_BASE = import.meta.env.VITE_API_URL || '/api';

/** Get the base URL for API calls (exported for streaming APIs) */
export function getBaseUrl(): string {
  return API_BASE;
}

/** Get auth headers for API calls (exported for streaming APIs) */
export function getAuthHeaders(): Record<string, string> {
  const { token } = getAuthToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public data?: unknown
  ) {
    super(`API Error: ${status} ${statusText}`);
    this.name = 'ApiError';
  }
}

export async function apiClient<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const { token } = getAuthToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers: {
      ...headers,
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const data = await response.json().catch(() => null);

    // Session expired: clear token and flag for login page message
    if (response.status === 401) {
      const { token: currentToken } = getAuthToken();
      if (currentToken) {
        sessionStorage.setItem('session_expired', '1');
        clearAuthToken();
      }
    }

    throw new ApiError(response.status, response.statusText, data);
  }

  // 204 No Content の場合は null を返す
  if (response.status === 204) {
    return null as T;
  }

  return response.json();
}

// Helper functions
export const api = {
  get: <T>(endpoint: string) => apiClient<T>(endpoint),

  post: <T>(endpoint: string, data: unknown) =>
    apiClient<T>(endpoint, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  put: <T>(endpoint: string, data: unknown) =>
    apiClient<T>(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  patch: <T>(endpoint: string, data: unknown) =>
    apiClient<T>(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  delete: <T>(endpoint: string) =>
    apiClient<T>(endpoint, { method: 'DELETE' }),
};
