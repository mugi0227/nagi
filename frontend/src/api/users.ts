import { api } from './client';

export interface UserProfile {
  id: string;
  email?: string | null;
  display_name?: string | null;
  username?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  timezone?: string;
  is_developer?: boolean;
  enable_weekly_meeting_reminder?: boolean;
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
  first_name?: string;
  last_name?: string;
  new_password?: string;
  timezone?: string;
  enable_weekly_meeting_reminder?: boolean;
}

export const usersApi = {
  getMe: () => api.get<UserProfile>('/users/me'),
  updateCredentials: (data: UpdateCredentialsRequest) =>
    api.patch<UserProfile>('/users/me/credentials', data),
  search: (query: string, limit = 10) =>
    api.get<UserSearchResult[]>(`/users/search?q=${encodeURIComponent(query)}&limit=${limit}`),
};
