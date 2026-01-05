const STORAGE_KEYS = {
  verifier: 'oidc_pkce_verifier',
  state: 'oidc_state',
  redirect: 'oidc_redirect',
};

export type OidcConfig = {
  authUrl: string;
  tokenUrl: string;
  clientId: string;
  redirectUri: string;
  scopes: string;
};

const getEnv = (key: string) => import.meta.env[key] as string | undefined;

export function getOidcConfig(): OidcConfig | null {
  const domain = getEnv('VITE_OIDC_DOMAIN');
  const authUrl = getEnv('VITE_OIDC_AUTH_URL') || (domain ? `${domain}/oauth2/authorize` : undefined);
  const tokenUrl = getEnv('VITE_OIDC_TOKEN_URL') || (domain ? `${domain}/oauth2/token` : undefined);
  const clientId = getEnv('VITE_OIDC_CLIENT_ID');
  const redirectUri = getEnv('VITE_OIDC_REDIRECT_URI') || `${window.location.origin}/auth/callback`;
  const scopes = getEnv('VITE_OIDC_SCOPES') || 'openid profile email';

  if (!authUrl || !tokenUrl || !clientId) {
    return null;
  }

  return { authUrl, tokenUrl, clientId, redirectUri, scopes };
}

const createRandomString = (length: number) => {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
};

const base64UrlEncode = (input: ArrayBuffer) => {
  const bytes = new Uint8Array(input);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const createCodeChallenge = async (verifier: string) => {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(digest);
};

export const getStoredOidcState = () => sessionStorage.getItem(STORAGE_KEYS.state);

export const getStoredVerifier = () => sessionStorage.getItem(STORAGE_KEYS.verifier);

export const getStoredRedirect = () => sessionStorage.getItem(STORAGE_KEYS.redirect);

export const clearOidcSession = () => {
  sessionStorage.removeItem(STORAGE_KEYS.state);
  sessionStorage.removeItem(STORAGE_KEYS.verifier);
  sessionStorage.removeItem(STORAGE_KEYS.redirect);
};

export const startOidcLogin = async (redirectPath: string) => {
  const config = getOidcConfig();
  if (!config) {
    throw new Error('OIDC config missing');
  }

  const state = createRandomString(16);
  const verifier = createRandomString(32);
  const challenge = await createCodeChallenge(verifier);

  sessionStorage.setItem(STORAGE_KEYS.state, state);
  sessionStorage.setItem(STORAGE_KEYS.verifier, verifier);
  sessionStorage.setItem(STORAGE_KEYS.redirect, redirectPath);

  const url = new URL(config.authUrl);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', config.redirectUri);
  url.searchParams.set('scope', config.scopes);
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');

  return url.toString();
};

export const exchangeCodeForToken = async (code: string, verifier: string) => {
  const config = getOidcConfig();
  if (!config) {
    throw new Error('OIDC config missing');
  }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: config.clientId,
    code,
    redirect_uri: config.redirectUri,
    code_verifier: verifier,
  });

  const response = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || 'Failed to exchange code');
  }

  return response.json() as Promise<{
    id_token?: string;
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    token_type?: string;
  }>;
};
