import { useState } from 'react';
import { FaTimes, FaMoon, FaSun, FaBell, FaUser, FaClock, FaCog } from 'react-icons/fa';
import { motion } from 'framer-motion';
import { useTheme } from '../../context/ThemeContext';
import { DEFAULT_DAILY_BUFFER_HOURS, DEFAULT_DAILY_CAPACITY_HOURS } from '../../utils/capacitySettings';
import './SettingsModal.css';

const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

const CAPACITY_TEMPLATES = [
  {
    id: 'weekdays',
    label: '平日8時間0時間',
    hours: [0, 8, 8, 8, 8, 8, 0],
  },
  {
    id: 'everyday',
    label: '全曜日8時間',
    hours: [8, 8, 8, 8, 8, 8, 8],
  },
  {
    id: 'light',
    label: '平日6時間0時間',
    hours: [0, 6, 6, 6, 6, 6, 0],
  },
];

const parseStoredNumber = (value: string | null, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const loadWeeklyCapacity = (fallback: number) => {
  const savedWeeklyCapacityHours = localStorage.getItem('weeklyCapacityHours');
  if (!savedWeeklyCapacityHours) {
    return Array(7).fill(fallback);
  }
  try {
    const parsed = JSON.parse(savedWeeklyCapacityHours);
    if (Array.isArray(parsed) && parsed.length === 7) {
      return parsed.map((value: unknown) => {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric : fallback;
      });
    }
  } catch {
    return Array(7).fill(fallback);
  }
  return Array(7).fill(fallback);
};

interface SettingsModalProps {
  onClose: () => void;
}

export function SettingsModal({ onClose }: SettingsModalProps) {
  const { theme, toggleTheme } = useTheme();
  const [userName, setUserName] = useState(() => localStorage.getItem('userName') || 'Shuhei');
  const [dailyCapacityHours, setDailyCapacityHours] = useState(() =>
    parseStoredNumber(localStorage.getItem('dailyCapacityHours'), DEFAULT_DAILY_CAPACITY_HOURS)
  );
  const [dailyBufferHours, setDailyBufferHours] = useState(() =>
    parseStoredNumber(localStorage.getItem('dailyBufferHours'), DEFAULT_DAILY_BUFFER_HOURS)
  );
  const [weeklyCapacityHours, setWeeklyCapacityHours] = useState(() => {
    const baseHours = parseStoredNumber(
      localStorage.getItem('dailyCapacityHours'),
      DEFAULT_DAILY_CAPACITY_HOURS
    );
    return loadWeeklyCapacity(baseHours);
  });
  const [capacityTemplateId, setCapacityTemplateId] = useState(
    () => localStorage.getItem('capacityTemplateId') || 'custom'
  );
  const [quietHoursEnabled, setQuietHoursEnabled] = useState(
    () => localStorage.getItem('quietHoursEnabled') === 'true'
  );
  const [quietHoursStart, setQuietHoursStart] = useState(
    () => localStorage.getItem('quietHoursStart') || '22:00'
  );
  const [quietHoursEnd, setQuietHoursEnd] = useState(
    () => localStorage.getItem('quietHoursEnd') || '07:00'
  );
  const [aiProposalMode, setAiProposalMode] = useState(
    () => localStorage.getItem('aiProposalMode') === 'true'
  );

  const handleUserNameChange = (value: string) => {
    setUserName(value);
    localStorage.setItem('userName', value);
  };

  const handleDailyCapacityChange = (value: string) => {
    const hours = parseFloat(value);
    if (!isNaN(hours) && hours > 0 && hours <= 24) {
      setDailyCapacityHours(hours);
      localStorage.setItem('dailyCapacityHours', String(hours));
      const updatedWeekly = Array(7).fill(hours);
      setWeeklyCapacityHours(updatedWeekly);
      localStorage.setItem('weeklyCapacityHours', JSON.stringify(updatedWeekly));
      localStorage.setItem('capacityTemplateId', 'custom');
      setCapacityTemplateId('custom');
      window.dispatchEvent(new Event('capacity-settings-updated'));
    }
  };

  const handleDailyBufferChange = (value: string) => {
    const hours = parseFloat(value);
    if (!isNaN(hours) && hours >= 0 && hours <= 24) {
      setDailyBufferHours(hours);
      localStorage.setItem('dailyBufferHours', String(hours));
      window.dispatchEvent(new Event('capacity-settings-updated'));
    }
  };

  const handleWeeklyCapacityChange = (dayIndex: number, value: string) => {
    const hours = parseFloat(value);
    if (!isNaN(hours) && hours >= 0 && hours <= 24) {
      const updated = [...weeklyCapacityHours];
      updated[dayIndex] = hours;
      setWeeklyCapacityHours(updated);
      localStorage.setItem('weeklyCapacityHours', JSON.stringify(updated));
      localStorage.setItem('capacityTemplateId', 'custom');
      setCapacityTemplateId('custom');
      window.dispatchEvent(new Event('capacity-settings-updated'));
    }
  };

  const handleCapacityTemplateChange = (templateId: string) => {
    setCapacityTemplateId(templateId);
    localStorage.setItem('capacityTemplateId', templateId);
    const template = CAPACITY_TEMPLATES.find(item => item.id === templateId);
    if (!template) {
      return;
    }
    setWeeklyCapacityHours(template.hours);
    localStorage.setItem('weeklyCapacityHours', JSON.stringify(template.hours));
    const baseHours = template.hours[1] ?? template.hours[0] ?? DEFAULT_DAILY_CAPACITY_HOURS;
    setDailyCapacityHours(baseHours);
    localStorage.setItem('dailyCapacityHours', String(baseHours));
    window.dispatchEvent(new Event('capacity-settings-updated'));
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

  const handleAiProposalModeChange = (checked: boolean) => {
    setAiProposalMode(checked);
    localStorage.setItem('aiProposalMode', String(checked));
  };

  return (
    <div className="settings-modal-overlay" onClick={onClose}>
      <motion.div
        className="settings-modal"
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
      >
        <div className="settings-modal-header">
          <div className="header-left">
            <FaCog className="header-icon" />
            <h2>設定</h2>
          </div>
          <button className="close-btn" onClick={onClose}>
            <FaTimes />
          </button>
        </div>

        <div className="settings-modal-content">
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

          {/* Daily Capacity Settings */}
          <div className="settings-section">
            <h3 className="section-title">
              <FaClock />
              稼働時間
            </h3>
            <div className="setting-item">
              <label htmlFor="dailyCapacityHours" className="setting-label">
                1日の稼働時間（全曜日一括）
              </label>
              <input
                type="number"
                id="dailyCapacityHours"
                value={dailyCapacityHours}
                onChange={(e) => handleDailyCapacityChange(e.target.value)}
                className="setting-input capacity-input"
                placeholder="8"
                min="1"
                max="24"
                step="0.5"
              />
              <p className="setting-description">
                まとめて入力すると全曜日に反映されます（デフォルト: 8時間）
              </p>
            </div>
            <div className="setting-item">
              <label htmlFor="dailyBufferHours" className="setting-label">
                バッファ時間（時間）
              </label>
              <input
                type="number"
                id="dailyBufferHours"
                value={dailyBufferHours}
                onChange={(e) => handleDailyBufferChange(e.target.value)}
                className="setting-input capacity-input"
                placeholder="1"
                min="0"
                max="24"
                step="0.5"
              />
              <p className="setting-description">
                稼働時間から差し引いて計算します（例: 8時間 - 1時間 = 7時間）
              </p>
            </div>
            <div className="setting-item">
              <label htmlFor="capacityTemplate" className="setting-label">
                稼働時間テンプレート
              </label>
              <select
                id="capacityTemplate"
                value={capacityTemplateId}
                onChange={(e) => handleCapacityTemplateChange(e.target.value)}
                className="setting-select"
              >
                <option value="custom">カスタム</option>
                {CAPACITY_TEMPLATES.map(template => (
                  <option key={template.id} value={template.id}>
                    {template.label}
                  </option>
                ))}
              </select>
              <p className="setting-description">
                用途に合わせた稼働時間をまとめて設定できます
              </p>
            </div>
            <div className="setting-item">
              <span className="setting-label">曜日別の稼働時間</span>
              <div className="weekday-grid">
                {WEEKDAY_LABELS.map((label, index) => (
                  <div
                    key={label}
                    className={`weekday-item ${index === 0 ? 'sun' : ''} ${index === 6 ? 'sat' : ''}`}
                  >
                    <span className="weekday-label">{label}</span>
                    <input
                      type="number"
                      value={weeklyCapacityHours[index] ?? 0}
                      onChange={(e) => handleWeeklyCapacityChange(index, e.target.value)}
                      className="setting-input capacity-input weekday-input"
                      min="0"
                      max="24"
                      step="0.5"
                    />
                  </div>
                ))}
              </div>
              <p className="setting-description">
                0時間にすると、その曜日はスケジュール対象外になります
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

          {/* AI Proposal Mode Settings */}
          <div className="settings-section">
            <h3 className="section-title">
              <FaBell />
              AI提案モード
            </h3>
            <div className="setting-item">
              <div className="setting-row">
                <div className="setting-label-group">
                  <span className="setting-label">AI提案を承諾してから作成</span>
                  <p className="setting-description">
                    ONにすると、AIがタスク/プロジェクトを作成する前に確認を求めます。<br />
                    OFFの場合は、AIが自動的に作成します（従来の動作）。
                  </p>
                </div>
                <button
                  className={`toggle-btn ${aiProposalMode ? 'active' : ''}`}
                  onClick={() => handleAiProposalModeChange(!aiProposalMode)}
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
      </motion.div>
    </div>
  );
}
