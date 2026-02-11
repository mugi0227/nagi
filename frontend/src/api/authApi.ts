import { api } from './client';

export interface AuthUser {
  id: string;
  email?: string;
  display_name?: string;
  username?: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: AuthUser;
}

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
  first_name?: string;
  last_name?: string;
  timezone?: string;
}

export interface LoginRequest {
  identifier: string;
  password: string;
}

export interface NativeLinkStartResponse {
  code: string;
  expires_at: string;
}

export interface NativeLinkExchangeRequest {
  code: string;
}

export const authApi = {
  login: (data: LoginRequest) => api.post<AuthResponse>('/auth/login', data),
  register: (data: RegisterRequest) => api.post<AuthResponse>('/auth/register', data),
  startNativeLink: () => api.post<NativeLinkStartResponse>('/auth/native-link/start', {}),
  exchangeNativeLink: (data: NativeLinkExchangeRequest) =>
    api.post<AuthResponse>('/auth/native-link/exchange', data),
};
