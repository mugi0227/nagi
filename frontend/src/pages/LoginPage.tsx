import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getAuthToken, setAuthToken, clearAuthToken } from '../api/auth';
import { authApi } from '../api/authApi';
import { ApiError } from '../api/client';
import { getOidcConfig, startOidcLogin } from '../utils/oidc';
import { motion } from 'framer-motion';
import './LoginPage.css';

const getAuthErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof ApiError) {
    const data = error.data as { detail?: string } | null;
    if (data?.detail) {
      return data.detail;
    }
    return `${fallback} (${error.status})`;
  }
  return fallback;
};

export function LoginPage() {
  const [tokenInput, setTokenInput] = useState('');
  const [isEditingToken, setIsEditingToken] = useState(false);
  const [oidcError, setOidcError] = useState<string | null>(null);
  const [localMode, setLocalMode] = useState<'login' | 'register'>('login');
  const [localIdentifier, setLocalIdentifier] = useState('');
  const [localPassword, setLocalPassword] = useState('');
  const [registerUsername, setRegisterUsername] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [localLoading, setLocalLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { token, source } = getAuthToken();
  const authMode = (import.meta.env.VITE_AUTH_MODE as string | undefined)?.toLowerCase() || '';
  const allowDevLoginOverride = (import.meta.env.VITE_ALLOW_DEV_LOGIN as string | undefined) === 'true';
  const isLocalAuth = authMode === 'local';
  const canUseDevUser = authMode === 'mock'
    || allowDevLoginOverride
    || (import.meta.env.DEV && authMode !== 'oidc' && authMode !== 'local');
  const isAuthLocked = source === 'env' || source === 'mock';
  const allowTokenLogin = authMode !== 'oidc'
    && (!isLocalAuth || (import.meta.env.VITE_ALLOW_TOKEN_LOGIN as string | undefined) === 'true');
  const showTokenForm = allowTokenLogin && (!token || isEditingToken);
  const oidcConfig = getOidcConfig();
  const oidcEnabled = authMode === 'oidc';
  const oidcReady = oidcEnabled && !!oidcConfig;
  const showOidcButton = oidcEnabled && !token;

  const fromLocation = (location.state as { from?: Location })?.from;
  const from = fromLocation ? `${fromLocation.pathname}${fromLocation.search ?? ''}` : '/';

  const handleLogin = (value: string) => {
    if (!value) return;
    setAuthToken(value);
    setIsEditingToken(false);
    navigate(from, { replace: true });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleLogin(tokenInput.trim());
  };

  const handleLogout = () => {
    if (isAuthLocked) return;
    clearAuthToken();
    setTokenInput('');
  };

  const handleLocalLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!localIdentifier.trim() || !localPassword.trim()) return;
    setLocalError(null);
    setLocalLoading(true);
    try {
      const response = await authApi.login({
        identifier: localIdentifier.trim(),
        password: localPassword,
      });
      setAuthToken(response.access_token);
      navigate(from, { replace: true });
    } catch (error) {
      setLocalError(getAuthErrorMessage(error, 'ログインに失敗しました。'));
    } finally {
      setLocalLoading(false);
    }
  };

  const handleLocalRegister = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!registerUsername.trim() || !registerEmail.trim() || !registerPassword.trim()) return;
    setLocalError(null);
    setLocalLoading(true);
    try {
      const response = await authApi.register({
        username: registerUsername.trim(),
        email: registerEmail.trim(),
        password: registerPassword,
      });
      setAuthToken(response.access_token);
      navigate(from, { replace: true });
    } catch (error) {
      setLocalError(getAuthErrorMessage(error, '登録に失敗しました。'));
    } finally {
      setLocalLoading(false);
    }
  };

  const handleOidcLogin = async () => {
    if (!oidcConfig) {
      setOidcError('OIDC の設定が見つかりません。環境変数を確認してください。');
      return;
    }
    setOidcError(null);
    try {
      const authUrl = await startOidcLogin(from);
      window.location.assign(authUrl);
    } catch (error) {
      console.error('OIDC login failed:', error);
      setOidcError('OIDC のログイン開始に失敗しました。');
    }
  };

  return (
    <div className="login-page">
      <motion.div
        className="login-card"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="login-header">
          <p className="login-kicker">Secretary Partner AI</p>
          <h1 className="login-title">ログイン</h1>
          <p className="login-subtitle">
            {oidcEnabled
              ? 'OIDC でログインします。必要に応じてトークン入力も使えます。'
              : isLocalAuth
                ? 'メールアドレスまたはユーザー名とパスワードでログインします。'
                : 'JWT のトークンを入力するか、開発用の dev_user でログインできます。'}
          </p>
        </div>

        {token ? (
          <div className="login-status">
            <span className="status-label">ログイン中</span>
            <span className="status-value">source: {source}</span>
          </div>
        ) : null}

        {showOidcButton ? (
          <button
            type="button"
            className="login-primary"
            onClick={handleOidcLogin}
            disabled={!oidcReady}
          >
            OIDC でログイン
          </button>
        ) : null}

        {showTokenForm && (
          <form className="login-form" onSubmit={handleSubmit}>
            <label className="login-label" htmlFor="token-input">
              JWT / トークン
            </label>
            <textarea
              id="token-input"
              className="login-input"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="ここに JWT を貼り付け"
              rows={4}
            />
            <button type="submit" className="login-primary" disabled={!tokenInput.trim()}>
              トークンでログイン
            </button>
          </form>
        )}

        {!token && isLocalAuth ? (
          <>
            <div className="login-toggle">
              <button
                type="button"
                className={`login-tab ${localMode === 'login' ? 'active' : ''}`}
                onClick={() => {
                  setLocalMode('login');
                  setLocalError(null);
                }}
                disabled={localLoading}
              >
                ログイン
              </button>
              <button
                type="button"
                className={`login-tab ${localMode === 'register' ? 'active' : ''}`}
                onClick={() => {
                  setLocalMode('register');
                  setLocalError(null);
                }}
                disabled={localLoading}
              >
                新規登録
              </button>
            </div>
            {localMode === 'login' ? (
              <form className="login-form" onSubmit={handleLocalLogin}>
                <label className="login-label" htmlFor="local-identifier">
                  メールアドレス / ユーザー名
                </label>
                <input
                  id="local-identifier"
                  className="login-input"
                  type="text"
                  value={localIdentifier}
                  onChange={(event) => setLocalIdentifier(event.target.value)}
                  placeholder="user@example.com"
                  autoComplete="username"
                />
                <label className="login-label" htmlFor="local-password">
                  パスワード
                </label>
                <input
                  id="local-password"
                  className="login-input"
                  type="password"
                  value={localPassword}
                  onChange={(event) => setLocalPassword(event.target.value)}
                  placeholder="********"
                  autoComplete="current-password"
                />
                <button
                  type="submit"
                  className="login-primary"
                  disabled={!localIdentifier.trim() || !localPassword.trim() || localLoading}
                >
                  パスワードでログイン
                </button>
              </form>
            ) : (
              <form className="login-form" onSubmit={handleLocalRegister}>
                <label className="login-label" htmlFor="register-username">
                  ユーザー名
                </label>
                <input
                  id="register-username"
                  className="login-input"
                  type="text"
                  value={registerUsername}
                  onChange={(event) => setRegisterUsername(event.target.value)}
                  placeholder="your-name"
                  autoComplete="username"
                />
                <label className="login-label" htmlFor="register-email">
                  メールアドレス
                </label>
                <input
                  id="register-email"
                  className="login-input"
                  type="email"
                  value={registerEmail}
                  onChange={(event) => setRegisterEmail(event.target.value)}
                  placeholder="user@example.com"
                  autoComplete="email"
                />
                <label className="login-label" htmlFor="register-password">
                  パスワード
                </label>
                <input
                  id="register-password"
                  className="login-input"
                  type="password"
                  value={registerPassword}
                  onChange={(event) => setRegisterPassword(event.target.value)}
                  placeholder="********"
                  autoComplete="new-password"
                />
                <button
                  type="submit"
                  className="login-primary"
                  disabled={
                    !registerUsername.trim()
                    || !registerEmail.trim()
                    || !registerPassword.trim()
                    || localLoading
                  }
                >
                  アカウントを作成
                </button>
              </form>
            )}
            {localError ? <p className="login-note login-error">{localError}</p> : null}
          </>
        ) : null}

        {!token && canUseDevUser ? (
          <div className="login-divider">
            <span>または</span>
          </div>
        ) : null}

        <div className="login-actions">
          {!token && canUseDevUser ? (
            <button type="button" className="login-secondary" onClick={() => handleLogin('dev_user')}>
              開発用 dev_user でログイン
            </button>
          ) : null}
          {token ? (
            <button
              type="button"
              className="login-ghost"
              onClick={() => setIsEditingToken(true)}
              disabled={isEditingToken || isAuthLocked}
            >
              トークンを変更
            </button>
          ) : null}
          {token ? (
            <button type="button" className="login-ghost" onClick={() => navigate(from)}>
              アプリに戻る
            </button>
          ) : null}
          {token ? (
            <button
              type="button"
              className="login-ghost danger"
              onClick={handleLogout}
              disabled={isAuthLocked}
            >
              ログアウト
            </button>
          ) : null}
        </div>
        {oidcEnabled && !oidcReady && !token ? (
          <p className="login-note">
            OIDC の設定が未入力です。`VITE_OIDC_AUTH_URL` などを設定してください。
          </p>
        ) : null}
        {oidcError && !token ? (
          <p className="login-note">{oidcError}</p>
        ) : null}
        {token && isAuthLocked ? (
          <p className="login-note">
            環境設定のトークンが優先されているため、ログアウトは無効です。
          </p>
        ) : null}
      </motion.div>
    </div>
  );
}
