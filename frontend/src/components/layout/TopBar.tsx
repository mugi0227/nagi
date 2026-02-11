import { useLocation, useNavigate } from 'react-router-dom';
import { useTheme } from '../../context/ThemeContext';
import { FaMoon, FaSun, FaRightFromBracket, FaRightToBracket } from 'react-icons/fa6';
import { clearAuthToken, getAuthToken } from '../../api/auth';
import { useTimezone } from '../../hooks/useTimezone';
import { formatDate, nowInTimezone } from '../../utils/dateTime';
import { NotificationDropdown } from '../notifications/NotificationDropdown';
import './TopBar.css';

export function TopBar() {
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const timezone = useTimezone();
  const { token, source } = getAuthToken();
  const isAuthLocked = source === 'env' || source === 'mock';

  const formatDateLabel = () => {
    return formatDate(
      nowInTimezone(timezone).toJSDate(),
      { year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short' },
      timezone,
    );
  };

  const getPageTitle = () => {
    if (location.pathname === '/') return 'Dashboard';
    if (location.pathname === '/tasks') return 'Tasks';
    if (location.pathname === '/projects') return 'Projects';
    if (location.pathname === '/skills') return 'Skills';
    if (location.pathname === '/native-link') return 'Native Link';
    return 'Dashboard';
  };

  const handleLogout = () => {
    if (isAuthLocked) return;
    clearAuthToken();
    navigate('/login');
  };

  const handleLogin = () => {
    navigate('/login');
  };

  return (
    <header className="top-bar">
      <div className="page-info">
        <h1 id="page-title">{getPageTitle()}</h1>
        <span className="date-display">{formatDateLabel()}</span>
      </div>

      <div className="top-actions">
        <button
          className="icon-btn theme-toggle"
          id="theme-toggle"
          title={theme === 'light' ? 'ダークモードに切り替え' : 'ライトモードに切り替え'}
          onClick={toggleTheme}
        >
          {theme === 'light' ? <FaMoon /> : <FaSun />}
        </button>
        <NotificationDropdown />
        {token ? (
          <button
            className="icon-btn"
            title={isAuthLocked ? '環境トークン利用中のためログアウトできません' : 'ログアウト'}
            onClick={handleLogout}
            disabled={isAuthLocked}
          >
            <FaRightFromBracket />
          </button>
        ) : (
          <button className="icon-btn" title="ログイン" onClick={handleLogin}>
            <FaRightToBracket />
          </button>
        )}
      </div>
    </header>
  );
}
