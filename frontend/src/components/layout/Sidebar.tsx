import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { FaChartPie, FaListCheck, FaFolderOpen, FaTrophy, FaGear, FaMoon, FaSun, FaRightFromBracket, FaRightToBracket, FaBookOpen, FaComments, FaChevronLeft, FaChevronRight } from 'react-icons/fa6';
import { useTheme } from '../../context/ThemeContext';
import { clearAuthToken, getAuthToken } from '../../api/auth';
import { SettingsModal } from '../settings/SettingsModal';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import { projectsApi } from '../../api/projects';
import { NotificationDropdown } from '../notifications/NotificationDropdown';
import { resolveDisplayName } from '../../utils/displayName';
import nagiIcon from '../../assets/nagi_icon.png';
import './Sidebar.css';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const { token, source } = getAuthToken();
  const { data: currentUser } = useCurrentUser();
  const [showSettings, setShowSettings] = useState(false);
  const [totalUnassigned, setTotalUnassigned] = useState(0);
  const isAuthLocked = source === 'env' || source === 'mock';
  const displayName = currentUser
    ? resolveDisplayName({
        firstName: currentUser.first_name,
        lastName: currentUser.last_name,
        displayName: currentUser.display_name,
        userId: currentUser.id,
      })
    : (token ? 'User' : 'Guest');
  const avatarLabel = displayName ? displayName[0]?.toUpperCase() : '?';

  useEffect(() => {
    if (!token) return;
    projectsApi.getAll().then((projects) => {
      const total = projects.reduce((sum, p) => sum + (p.unassigned_tasks || 0), 0);
      setTotalUnassigned(total);
    }).catch(() => {
      // Ignore errors
    });
  }, [token, location.pathname]);

  const navItems = [
    { path: '/', label: 'ダッシュボード', icon: FaChartPie },
    { path: '/tasks', label: 'タスク', icon: FaListCheck },
    { path: '/projects', label: 'プロジェクト', icon: FaFolderOpen },
    { path: '/memories', label: 'メモリー', icon: FaBookOpen },
    { path: '/achievement', label: '達成項目', icon: FaTrophy },
    { path: '/issues', label: '要望', icon: FaComments },
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
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <img
            src={nagiIcon}
            alt="Nagi AI"
            className="logo-icon-img"
          />
          {!collapsed && <span className="logo-text">タスク管理AI 凪</span>}
        </div>
        <button
          className="sidebar-toggle-btn"
          onClick={onToggle}
          title={collapsed ? 'サイドバーを展開' : 'サイドバーを折りたたむ'}
        >
          {collapsed ? <FaChevronRight /> : <FaChevronLeft />}
        </button>
      </div>

      <nav className="sidebar-nav">
        {navItems.map(item => (
          <Link
            key={item.path}
            to={item.path}
            className={`nav-link ${location.pathname === item.path ? 'active' : ''}`}
            title={collapsed ? item.label : undefined}
          >
            <item.icon className="nav-icon" />
            {!collapsed && <span className="nav-label">{item.label}</span>}
            {item.path === '/projects' && totalUnassigned > 0 && (
              <span className={`nav-badge unassigned-badge ${collapsed ? 'collapsed-badge' : ''}`} title="未割り当てタスク">
                {totalUnassigned}
              </span>
            )}
          </Link>
        ))}
      </nav>

      <div className={`sidebar-footer ${collapsed ? 'collapsed' : ''}`}>
        {!collapsed && (
          <div className="user-profile">
            <div className="user-avatar">{avatarLabel}</div>
            <div className="user-info">
              <span className="user-name">{displayName}</span>
              <span className="user-status">{token ? 'Signed in' : 'Guest'}</span>
            </div>
          </div>
        )}
        <div className={`footer-actions ${collapsed ? 'collapsed' : ''}`}>
          <NotificationDropdown />
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
