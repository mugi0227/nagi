import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { DateTime } from 'luxon';
import {
  FaTrophy,
  FaCheckCircle,
  FaChartLine,
  FaLightbulb,
  FaClipboardList,
  FaSpinner,
} from 'react-icons/fa';
import { achievementsApi } from '../api/achievements';
import type { SharedAchievement } from '../api/types';
import './SharedAchievementPage.css';

function formatPeriod(start: string, end: string): string {
  const s = DateTime.fromISO(start);
  const e = DateTime.fromISO(end);
  return `${s.toFormat('yyyy/MM/dd')} - ${e.toFormat('MM/dd')}`;
}

export function SharedAchievementPage() {
  const { token } = useParams<{ token: string }>();
  const [achievement, setAchievement] = useState<SharedAchievement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    achievementsApi
      .getShared(token)
      .then(setAchievement)
      .catch((err) => {
        setError(err.message === 'Not found' ? 'not_found' : 'error');
      })
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="shared-achievement-page">
        <div className="shared-loading">
          <FaSpinner className="spinner" />
          <span>読み込み中...</span>
        </div>
      </div>
    );
  }

  if (error === 'not_found') {
    return (
      <div className="shared-achievement-page">
        <div className="shared-error">
          <FaTrophy className="shared-error-icon" />
          <h2>達成項目が見つかりません</h2>
          <p>このリンクは無効か、削除された可能性があります。</p>
        </div>
      </div>
    );
  }

  if (error || !achievement) {
    return (
      <div className="shared-achievement-page">
        <div className="shared-error">
          <h2>エラーが発生しました</h2>
          <p>時間をおいて再度お試しください。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="shared-achievement-page">
      <div className="shared-achievement-card">
        <div className="shared-header">
          <FaTrophy className="shared-header-icon" />
          <div>
            <h1 className="shared-title">達成項目</h1>
            <div className="shared-period">
              {achievement.period_label || formatPeriod(achievement.period_start, achievement.period_end)}
            </div>
          </div>
        </div>

        <div className="shared-summary">
          <p>{achievement.summary}</p>
        </div>

        {achievement.weekly_activities.length > 0 && (
          <div className="shared-section">
            <h3 className="shared-section-title">
              <FaClipboardList className="shared-section-icon" />
              今週やったこと
            </h3>
            <ul className="shared-list">
              {achievement.weekly_activities.map((activity, i) => (
                <li key={i}>
                  <FaCheckCircle className="shared-list-icon done" />
                  <span>{activity}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="shared-stats">
          <div className="shared-stat">
            <span className="shared-stat-value">{achievement.task_count}</span>
            <span className="shared-stat-label">完了タスク</span>
          </div>
        </div>

        {achievement.growth_points.length > 0 && (
          <div className="shared-section">
            <h3 className="shared-section-title">
              <FaChartLine className="shared-section-icon" />
              成長ポイント
            </h3>
            <ul className="shared-list">
              {achievement.growth_points.map((point, i) => (
                <li key={i}>
                  <FaChartLine className="shared-list-icon growth" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {achievement.next_suggestions.length > 0 && (
          <div className="shared-section">
            <h3 className="shared-section-title">
              <FaLightbulb className="shared-section-icon" />
              次への提案
            </h3>
            <ul className="shared-list">
              {achievement.next_suggestions.map((suggestion, i) => (
                <li key={i}>
                  <FaLightbulb className="shared-list-icon suggestion" />
                  <span>{suggestion}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="shared-footer">
          <span>nagi で生成</span>
        </div>
      </div>
    </div>
  );
}
