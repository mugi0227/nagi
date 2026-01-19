import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { projectsApi } from '../api/projects';
import { getAuthToken } from '../api/auth';
import { motion } from 'framer-motion';
import './InvitationAcceptPage.css';

type AcceptStatus = 'idle' | 'loading' | 'success' | 'error';

export function InvitationAcceptPage() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [tokenInput, setTokenInput] = useState(searchParams.get('token') ?? '');
  const [status, setStatus] = useState<AcceptStatus>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const { token } = getAuthToken();

  useEffect(() => {
    const tokenParam = searchParams.get('token');
    if (tokenParam) {
      setTokenInput(tokenParam);
    }
  }, [searchParams]);

  useEffect(() => {
    const tokenParam = searchParams.get('token');
    if (!token || !tokenParam || status !== 'idle') return;
    handleAccept(tokenParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleAccept = async (tokenValue: string) => {
    if (!token) {
      navigate('/login', { state: { from: location } });
      return;
    }
    if (!tokenValue) return;
    setStatus('loading');
    setMessage(null);
    try {
      const invitation = await projectsApi.acceptInvitation(tokenValue.trim());
      setStatus('success');
      setProjectId(invitation.project_id);
      setMessage('招待を承諾しました。');
    } catch (err) {
      console.error('Failed to accept invitation:', err);
      setStatus('error');
      setMessage('招待の承諾に失敗しました。トークンやログイン状態を確認してください。');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleAccept(tokenInput.trim());
  };

  return (
    <div className="invite-accept-page">
      <motion.div
        className="invite-accept-card"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      >
        <p className="invite-kicker">Project Invitation</p>
        <h1 className="invite-title">招待の承諾</h1>
        <p className="invite-subtitle">
          招待リンクのトークンを入力して承諾します。ログインが必要です。
        </p>

        {!token && (
          <button
            type="button"
            className="invite-login-btn"
            onClick={() => navigate('/login', { state: { from: location } })}
          >
            ログインへ進む
          </button>
        )}

        <form className="invite-form" onSubmit={handleSubmit}>
          <label className="invite-label" htmlFor="invite-token">
            招待トークン
          </label>
          <input
            id="invite-token"
            className="invite-input"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            placeholder="招待トークンを入力"
          />
          <button
            type="submit"
            className="invite-accept-btn"
            disabled={!tokenInput.trim() || status === 'loading'}
          >
            承諾する
          </button>
        </form>

        {status !== 'idle' && message && (
          <div className={`invite-status status-${status}`}>
            {message}
          </div>
        )}

        {status === 'success' && projectId && (
          <button
            type="button"
            className="invite-link-btn"
            onClick={() => navigate(`/projects/${projectId}/v2`)}
          >
            プロジェクトを開く
          </button>
        )}
      </motion.div>
    </div>
  );
}
