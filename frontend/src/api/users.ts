import { api } from './client';

export interface UserProfile {
  id: string;
  email?: string | null;
  display_name?: string | null;
  username?: string | null;
  timezone?: string;
}

export interface UserSearchResult {
  id: string;
  display_name?: string | null;
  username?: string | null;
  email?: string | null;
}

export interface UpdateCredentialsRequest {
  current_password: string;
  username?: string;
  email?: string;
  new_password?: string;
  timezone?: string;
}

export const usersApi = {
  getMe: () => api.get<UserProfile>('/users/me'),
  updateCredentials: (data: UpdateCredentialsRequest) =>
    api.patch<UserProfile>('/users/me/credentials', data),
  search: (query: string, limit = 10) =>
    api.get<UserSearchResult[]>(`/users/search?q=${encodeURIComponent(query)}&limit=${limit}`),
};
