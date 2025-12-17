import { useState, useEffect } from 'react';
import { FaCog, FaMoon, FaSun, FaBell, FaUser } from 'react-icons/fa';
import { useTheme } from '../context/ThemeContext';
import './SettingsPage.css';

export function SettingsPage() {
  const { theme, toggleTheme } = useTheme();
  const [userName, setUserName] = useState('');
  const [quietHoursEnabled, setQuietHoursEnabled] = useState(false);
  const [quietHoursStart, setQuietHoursStart] = useState('22:00');
  const [quietHoursEnd, setQuietHoursEnd] = useState('07:00');

  // Load settings from localStorage
  useEffect(() => {
    const savedUserName = localStorage.getItem('userName') || 'Shuhei';
    const savedQuietHoursEnabled = localStorage.getItem('quietHoursEnabled') === 'true';
    const savedQuietHoursStart = localStorage.getItem('quietHoursStart') || '22:00';
    const savedQuietHoursEnd = localStorage.getItem('quietHoursEnd') || '07:00';

    setUserName(savedUserName);
    setQuietHoursEnabled(savedQuietHoursEnabled);
    setQuietHoursStart(savedQuietHoursStart);
    setQuietHoursEnd(savedQuietHoursEnd);
  }, []);

  const handleUserNameChange = (value: string) => {
    setUserName(value);
    localStorage.setItem('userName', value);
  };

  const handleQuietHoursToggle = () => {
    const newValue = !quietHoursEnabled;
    setQuietHoursEnabled(newValue);
    localStorage.setItem('quietHoursEnabled', String(newValue));
  };

  const handleQuietHoursStartChange = (value: string) => {
    setQuietHoursStart(value);
    localStorage.setItem('quietHoursStart', value);
  };

  const handleQuietHoursEndChange = (value: string) => {
    setQuietHoursEnd(value);
    localStorage.setItem('quietHoursEnd', value);
  };

  return (
    <div className="settings-page">
      <div className="page-header">
        <div className="header-left">
          <FaCog className="page-icon" />
          <h2 className="page-title">設定</h2>
        </div>
      </div>

      <div className="settings-content">
        {/* User Settings */}
        <div className="settings-section">
          <h3 className="section-title">
            <FaUser />
            ユーザー情報
          </h3>
          <div className="setting-item">
            <label htmlFor="userName" className="setting-label">
              ユーザー名
            </label>
            <input
              type="text"
              id="userName"
              value={userName}
              onChange={(e) => handleUserNameChange(e.target.value)}
              className="setting-input"
              placeholder="名前を入力"
            />
            <p className="setting-description">
              AgentCardなどで表示される名前を設定します
            </p>
          </div>
        </div>

        {/* Theme Settings */}
        <div className="settings-section">
          <h3 className="section-title">
            {theme === 'dark' ? <FaMoon /> : <FaSun />}
            テーマ
          </h3>
          <div className="setting-item">
            <div className="setting-row">
              <div className="setting-label-group">
                <span className="setting-label">ダークモード</span>
                <p className="setting-description">
                  画面の配色をダークテーマに切り替えます
                </p>
              </div>
              <button
                className={`toggle-btn ${theme === 'dark' ? 'active' : ''}`}
                onClick={toggleTheme}
              >
                <span className="toggle-slider"></span>
              </button>
            </div>
          </div>
        </div>

        {/* Notification Settings */}
        <div className="settings-section">
          <h3 className="section-title">
            <FaBell />
            通知設定
          </h3>
          <div className="setting-item">
            <div className="setting-row">
              <div className="setting-label-group">
                <span className="setting-label">Quiet Hours（静かな時間）</span>
                <p className="setting-description">
                  指定した時間帯は通知やリマインダーを無効化します
                </p>
              </div>
              <button
                className={`toggle-btn ${quietHoursEnabled ? 'active' : ''}`}
                onClick={handleQuietHoursToggle}
              >
                <span className="toggle-slider"></span>
              </button>
            </div>

            {quietHoursEnabled && (
              <div className="quiet-hours-config">
                <div className="time-input-group">
                  <label htmlFor="quietHoursStart">開始時刻</label>
                  <input
                    type="time"
                    id="quietHoursStart"
                    value={quietHoursStart}
                    onChange={(e) => handleQuietHoursStartChange(e.target.value)}
                    className="setting-input"
                  />
                </div>
                <span className="time-separator">〜</span>
                <div className="time-input-group">
                  <label htmlFor="quietHoursEnd">終了時刻</label>
                  <input
                    type="time"
                    id="quietHoursEnd"
                    value={quietHoursEnd}
                    onChange={(e) => handleQuietHoursEndChange(e.target.value)}
                    className="setting-input"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Future: Language Settings */}
        <div className="settings-section disabled">
          <h3 className="section-title">言語設定（将来対応予定）</h3>
          <div className="setting-item">
            <label className="setting-label">表示言語</label>
            <select className="setting-input" disabled>
              <option>日本語</option>
              <option>English</option>
            </select>
            <p className="setting-description">
              アプリの表示言語を変更します（現在は日本語のみ）
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
