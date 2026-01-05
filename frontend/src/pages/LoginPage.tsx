import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getAuthToken, setAuthToken, clearAuthToken } from '../api/auth';
import { getOidcConfig, startOidcLogin } from '../utils/oidc';
import { motion } from 'framer-motion';
import './LoginPage.css';

export function LoginPage() {
  const [tokenInput, setTokenInput] = useState('');
  const [isEditingToken, setIsEditingToken] = useState(false);
  const [oidcError, setOidcError] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { token, source } = getAuthToken();
  const authMode = (import.meta.env.VITE_AUTH_MODE as string | undefined)?.toLowerCase() || '';
  const allowDevLoginOverride = (import.meta.env.VITE_ALLOW_DEV_LOGIN as string | undefined) === 'true';
  const canUseDevUser = authMode === 'mock' || (allowDevLoginOverride || (import.meta.env.DEV && authMode !== 'oidc'));
  const isAuthLocked = source === 'env' || source === 'mock';
  const allowTokenLogin = authMode !== 'oidc'
    || (import.meta.env.VITE_ALLOW_TOKEN_LOGIN as string | undefined) === 'true';
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
