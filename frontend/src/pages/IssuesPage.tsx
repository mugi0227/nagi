import { useEffect, useState, useCallback } from 'react';
import { issuesApi } from '../api/issues';
import type { Issue, IssueCategory, IssueStatus } from '../api/types';
import { useTimezone } from '../hooks/useTimezone';
import { formatDate as formatDateValue } from '../utils/dateTime';
import { IssueChatWindow } from '../components/issues/IssueChatWindow';
import './IssuesPage.css';

const CATEGORY_LABELS: Record<IssueCategory, string> = {
  FEATURE_REQUEST: '機能要望',
  BUG_REPORT: 'バグ報告',
  IMPROVEMENT: '改善提案',
  QUESTION: '質問',
};

const STATUS_LABELS: Record<IssueStatus, string> = {
  OPEN: '投稿済み',
  UNDER_REVIEW: '検討中',
  PLANNED: '対応予定',
  IN_PROGRESS: '対応中',
  COMPLETED: '完了',
  WONT_FIX: '対応なし',
};

const STATUS_COLORS: Record<IssueStatus, string> = {
  OPEN: '#6b7280',
  UNDER_REVIEW: '#3b82f6',
  PLANNED: '#8b5cf6',
  IN_PROGRESS: '#f59e0b',
  COMPLETED: '#10b981',
  WONT_FIX: '#ef4444',
};

const CATEGORY_ICONS: Record<IssueCategory, string> = {
  FEATURE_REQUEST: '💡',
  BUG_REPORT: '🐛',
  IMPROVEMENT: '✨',
  QUESTION: '❓',
};

const formatDate = (value: string, timezone: string) => {
  return formatDateValue(
    value,
    { year: 'numeric', month: 'numeric', day: 'numeric' },
    timezone
  );
};

type SortBy = 'created_at' | 'like_count';

export function IssuesPage() {
  const timezone = useTimezone();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortBy>('created_at');
  const [categoryFilter, setCategoryFilter] = useState<IssueCategory | ''>('');
  const [statusFilter, setStatusFilter] = useState<IssueStatus | ''>('');
  const [showChatWindow, setShowChatWindow] = useState(false);

  const loadIssues = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await issuesApi.list({
        sort_by: sortBy,
        sort_order: 'desc',
        category: categoryFilter || undefined,
        status: statusFilter || undefined,
        limit: 50,
      });
      setIssues(response.items);
      setTotal(response.total);
    } catch (err) {
      console.error('Failed to load issues:', err);
      setError('要望の読み込みに失敗しました。');
    } finally {
      setIsLoading(false);
    }
  }, [sortBy, categoryFilter, statusFilter]);

  useEffect(() => {
    loadIssues();
  }, [loadIssues]);

  const handleLike = async (issue: Issue) => {
    try {
      let updated: Issue;
      if (issue.liked_by_me) {
        updated = await issuesApi.unlike(issue.id);
      } else {
        updated = await issuesApi.like(issue.id);
      }
      setIssues((prev) =>
        prev.map((i) => (i.id === issue.id ? updated : i))
      );
    } catch (err) {
      console.error('Failed to toggle like:', err);
    }
  };

  const handleChatClose = () => {
    setShowChatWindow(false);
    loadIssues(); // Reload to show newly created issues
  };

  if (error) {
    return (
      <div className="issues-page">
        <div className="error-state">{error}</div>
      </div>
    );
  }

  return (
    <div className="issues-page">
      <div className="page-header">
        <div className="header-content">
          <h2 className="page-title">みんなの要望</h2>
          <p className="page-description">
            アプリへの要望やバグ報告を投稿できます
          </p>
        </div>
        <button
          className="submit-button"
          onClick={() => setShowChatWindow(true)}
        >
          要望を伝える
        </button>
      </div>

      <div className="issues-filters">
        <div className="filter-tabs">
          <button
            className={`filter-tab ${sortBy === 'created_at' ? 'active' : ''}`}
            onClick={() => setSortBy('created_at')}
          >
            🆕 新着順
          </button>
          <button
            className={`filter-tab ${sortBy === 'like_count' ? 'active' : ''}`}
            onClick={() => setSortBy('like_count')}
          >
            🔥 人気順
          </button>
        </div>
        <div className="filter-selects">
          <select
            className="filter-select"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as IssueCategory | '')}
          >
            <option value="">すべてのカテゴリ</option>
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {CATEGORY_ICONS[value as IssueCategory]} {label}
              </option>
            ))}
          </select>
          <select
            className="filter-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as IssueStatus | '')}
          >
            <option value="">すべてのステータス</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="loading-state">読み込み中...</div>
      ) : issues.length === 0 ? (
        <div className="empty-state">
          <p className="empty-title">まだ要望がありません</p>
          <p className="empty-hint">「要望を伝える」から最初の要望を投稿してみましょう！</p>
        </div>
      ) : (
        <>
          <div className="issues-count">{total} 件の要望</div>
          <div className="issues-list">
            {issues.map((issue) => (
              <div key={issue.id} className="issue-card">
                <div className="issue-header">
                  <span className="issue-category">
                    {CATEGORY_ICONS[issue.category]} {CATEGORY_LABELS[issue.category]}
                  </span>
                  <span
                    className="issue-status"
                    style={{ backgroundColor: STATUS_COLORS[issue.status] }}
                  >
                    {STATUS_LABELS[issue.status]}
                  </span>
                </div>
                <h3 className="issue-title">{issue.title}</h3>
                <p className="issue-content">{issue.content}</p>
                {issue.admin_response && (
                  <div className="admin-response">
                    <span className="admin-label">開発者からの回答:</span>
                    <p>{issue.admin_response}</p>
                  </div>
                )}
                <div className="issue-footer">
                  <div className="issue-meta">
                    <span className="issue-author">
                      {issue.display_name || '匿名'}
                    </span>
                    <span className="issue-date">
                      {formatDate(issue.created_at, timezone)}
                    </span>
                  </div>
                  <button
                    className={`like-button ${issue.liked_by_me ? 'liked' : ''}`}
                    onClick={() => handleLike(issue)}
                  >
                    ❤️ {issue.like_count}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {showChatWindow && (
        <IssueChatWindow onClose={handleChatClose} />
      )}
    </div>
  );
}
