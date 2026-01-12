export type AuthTokenSource = 'env' | 'storage' | 'mock' | 'none';

export function getAuthToken(): { token: string | null; source: AuthTokenSource } {
  const envToken = import.meta.env.VITE_AUTH_TOKEN as string | undefined;
  if (envToken) {
    return { token: envToken, source: 'env' };
  }

  const storageToken =
    localStorage.getItem('auth_token') ||
    localStorage.getItem('id_token') ||
    localStorage.getItem('access_token');
  if (storageToken) {
    return { token: storageToken, source: 'storage' };
  }

  const authMode = (import.meta.env.VITE_AUTH_MODE as string | undefined) || '';
  if (authMode.toLowerCase() === 'mock') {
    return { token: 'dev_user', source: 'mock' };
  }

  return { token: null, source: 'none' };
}

export function setAuthToken(token: string, key: 'auth_token' | 'id_token' | 'access_token' = 'auth_token') {
  localStorage.setItem(key, token);
  window.dispatchEvent(new Event('auth-changed'));
}

export function clearAuthToken() {
  localStorage.removeItem('auth_token');
  localStorage.removeItem('id_token');
  localStorage.removeItem('access_token');
  window.dispatchEvent(new Event('auth-changed'));
}
