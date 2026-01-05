import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { setAuthToken } from '../api/auth';
import { clearOidcSession, exchangeCodeForToken, getStoredOidcState, getStoredRedirect, getStoredVerifier } from '../utils/oidc';
import './LoginPage.css';

type Status = 'loading' | 'error';

export function OidcCallbackPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>('loading');
  const [message, setMessage] = useState('OIDC トークンを確認しています...');

  useEffect(() => {
    const run = async () => {
      const params = new URLSearchParams(location.search);
      const error = params.get('error');
      const errorDescription = params.get('error_description');
      const code = params.get('code');
      const state = params.get('state');

      if (error) {
        setStatus('error');
        setMessage(errorDescription || 'OIDC ログインに失敗しました。');
        return;
      }

      const storedState = getStoredOidcState();
      const verifier = getStoredVerifier();
      if (!code || !state || !storedState || state !== storedState || !verifier) {
        setStatus('error');
        setMessage('認証状態の検証に失敗しました。もう一度ログインしてください。');
        return;
      }

      try {
        const tokenResponse = await exchangeCodeForToken(code, verifier);
        const idToken = tokenResponse.id_token || tokenResponse.access_token;
        if (!idToken) {
          throw new Error('token missing');
        }
        const tokenKey = tokenResponse.id_token ? 'id_token' : 'access_token';
        setAuthToken(idToken, tokenKey);
        const redirectTo = getStoredRedirect() || '/';
        clearOidcSession();
        navigate(redirectTo, { replace: true });
      } catch (err) {
        console.error('OIDC callback failed:', err);
        setStatus('error');
        setMessage('トークン取得に失敗しました。もう一度ログインしてください。');
      }
    };

    run();
  }, [location.search, navigate]);

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <p className="login-kicker">Secretary Partner AI</p>
          <h1 className="login-title">ログイン処理中</h1>
          <p className="login-subtitle">{message}</p>
        </div>
        {status === 'error' ? (
          <button type="button" className="login-primary" onClick={() => navigate('/login')}>
            ログイン画面へ戻る
          </button>
        ) : null}
      </div>
    </div>
  );
}
