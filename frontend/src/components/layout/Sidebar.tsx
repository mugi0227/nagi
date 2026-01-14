import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { FaBrain, FaChartPie, FaListCheck, FaFolderOpen, FaTrophy, FaGear, FaMoon, FaSun, FaRightFromBracket, FaRightToBracket, FaBookOpen, FaLightbulb } from 'react-icons/fa6';
import { useTheme } from '../../context/ThemeContext';
import { clearAuthToken, getAuthToken } from '../../api/auth';
import { SettingsModal } from '../settings/SettingsModal';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import nagiIcon from '../../assets/nagi_icon.png';
import './Sidebar.css';

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const { token, source } = getAuthToken();
  const { data: currentUser } = useCurrentUser();
  const [showSettings, setShowSettings] = useState(false);
  const isAuthLocked = source === 'env' || source === 'mock';
  const displayName = currentUser?.username
    || currentUser?.display_name
    || currentUser?.email
    || (token ? 'User' : 'Guest');
  const avatarLabel = displayName ? displayName[0]?.toUpperCase() : '?';

  const navItems = [
    { path: '/', label: 'Dashboard', icon: FaChartPie },
    { path: '/tasks', label: 'Tasks', icon: FaListCheck },
    { path: '/projects', label: 'Projects', icon: FaFolderOpen },
    { path: '/skills', label: 'Skills', icon: FaLightbulb },
    { path: '/memories', label: 'Memories', icon: FaBookOpen },
    { path: '/achievement', label: 'Achievement', icon: FaTrophy },
  ];

  const handleLogout = () => {
    if (isAuthLocked) return;
    clearAuthToken();
    navigate('/login');
  };

  const handleLogin = () => {
    navigate('/login');
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <img
          src={nagiIcon}
          alt="Nagi AI"
          className="logo-icon-img"
        />
        <span className="logo-text">凪 (Nagi AI)</span>
      </div>

      <nav className="sidebar-nav">
        {navItems.map(item => (
          <Link
            key={item.path}
            to={item.path}
            className={`nav-link ${location.pathname === item.path ? 'active' : ''}`}
          >
            <item.icon className="nav-icon" />
            <span className="nav-label">{item.label}</span>
          </Link>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="user-profile">
          <div className="user-avatar">{avatarLabel}</div>
          <div className="user-info">
            <span className="user-name">{displayName}</span>
            <span className="user-status">{token ? 'Signed in' : 'Guest'}</span>
          </div>
        </div>
        <div className="footer-actions">
          <button
            className="footer-btn theme-toggle-btn"
            onClick={toggleTheme}
            title={theme === 'light' ? 'ダークモードに切り替え' : 'ライトモードに切り替え'}
          >
            {theme === 'light' ? <FaMoon /> : <FaSun />}
          </button>
          <button
            className="footer-btn settings-btn"
            onClick={() => setShowSettings(true)}
            title="設定"
          >
            <FaGear />
          </button>
          {token ? (
            <button
              className="footer-btn logout-btn"
              onClick={handleLogout}
              title={isAuthLocked ? '環境トークン利用中のためログアウトできません' : 'ログアウト'}
              disabled={isAuthLocked}
            >
              <FaRightFromBracket />
            </button>
          ) : (
            <button
              className="footer-btn login-btn"
              onClick={handleLogin}
              title="ログイン"
            >
              <FaRightToBracket />
            </button>
          )}
        </div>
      </div>

      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)} />
      )}
    </aside>
  );
}
