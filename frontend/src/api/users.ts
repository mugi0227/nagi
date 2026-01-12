import { api } from './client';

export interface UserProfile {
  id: string;
  email?: string | null;
  display_name?: string | null;
  username?: string | null;
}

export interface UpdateCredentialsRequest {
  current_password: string;
  username?: string;
  email?: string;
  new_password?: string;
}

export const usersApi = {
  getMe: () => api.get<UserProfile>('/users/me'),
  updateCredentials: (data: UpdateCredentialsRequest) =>
    api.patch<UserProfile>('/users/me/credentials', data),
};
