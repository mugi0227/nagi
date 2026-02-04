import { useEffect, useState, useCallback } from 'react';
import { issuesApi } from '../api/issues';
import type { Issue, IssueCategory, IssueStatus, IssueComment, IssueStatusUpdate } from '../api/types';
import { useTimezone } from '../hooks/useTimezone';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { formatDate as formatDateValue } from '../utils/dateTime';
import { IssueChatWindow } from '../components/issues/IssueChatWindow';
import { IssueCommentSection } from '../components/issues/IssueCommentSection';
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

const ALL_STATUSES: IssueStatus[] = [
  'OPEN', 'UNDER_REVIEW', 'PLANNED', 'IN_PROGRESS', 'COMPLETED', 'WONT_FIX',
];

const formatDate = (value: string, timezone: string) => {
  return formatDateValue(
    value,
    { year: 'numeric', month: 'numeric', day: 'numeric' },
    timezone
  );
};

const formatDateTime = (value: string, timezone: string) => {
  return formatDateValue(
    value,
    { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' },
    timezone
  );
};

type SortBy = 'created_at' | 'like_count';

export function IssuesPage() {
  const timezone = useTimezone();
  const { data: currentUser } = useCurrentUser();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortBy>('created_at');
  const [categoryFilter, setCategoryFilter] = useState<IssueCategory | ''>('');
  const [statusFilter, setStatusFilter] = useState<IssueStatus | ''>('');
  const [showChatWindow, setShowChatWindow] = useState(false);

  // Expanded issue state
  const [expandedIssueId, setExpandedIssueId] = useState<string | null>(null);
  const [comments, setComments] = useState<IssueComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);

  // Status change state (developer only)
  const [editingStatus, setEditingStatus] = useState<string | null>(null);
  const [newStatus, setNewStatus] = useState<IssueStatus>('OPEN');
  const [adminResponse, setAdminResponse] = useState('');
  const [submittingStatus, setSubmittingStatus] = useState(false);

  const isDeveloper = currentUser?.is_developer ?? false;

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

  const loadComments = useCallback(async (issueId: string) => {
    setCommentsLoading(true);
    try {
      const result = await issuesApi.listComments(issueId);
      setComments(result.comments);
    } catch (err) {
      console.error('Failed to load comments:', err);
    } finally {
      setCommentsLoading(false);
    }
  }, []);

  const handleLike = async (e: React.MouseEvent, issue: Issue) => {
    e.stopPropagation();
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

  const handleCardClick = (issue: Issue) => {
    if (expandedIssueId === issue.id) {
      setExpandedIssueId(null);
      setComments([]);
      setNewComment('');
      setEditingStatus(null);
    } else {
      setExpandedIssueId(issue.id);
      setNewComment('');
      setEditingStatus(null);
      loadComments(issue.id);
    }
  };

  const handleSubmitComment = async (issueId: string) => {
    if (!newComment.trim()) return;
    setSubmittingComment(true);
    try {
      const comment = await issuesApi.createComment(issueId, { content: newComment.trim() });
      setComments((prev) => [...prev, comment]);
      setNewComment('');
    } catch (err) {
      console.error('Failed to create comment:', err);
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleDeleteComment = async (issueId: string, commentId: string) => {
    try {
      await issuesApi.deleteComment(issueId, commentId);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    } catch (err) {
      console.error('Failed to delete comment:', err);
    }
  };

  const handleStartStatusEdit = (e: React.MouseEvent, issue: Issue) => {
    e.stopPropagation();
    setEditingStatus(issue.id);
    setNewStatus(issue.status);
    setAdminResponse(issue.admin_response || '');
  };

  const handleCancelStatusEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingStatus(null);
  };

  const handleSubmitStatus = async (e: React.MouseEvent, issueId: string) => {
    e.stopPropagation();
    setSubmittingStatus(true);
    try {
      const update: IssueStatusUpdate = {
        status: newStatus,
        admin_response: adminResponse || undefined,
      };
      const updated = await issuesApi.updateStatus(issueId, update);
      setIssues((prev) =>
        prev.map((i) => (i.id === issueId ? updated : i))
      );
      setEditingStatus(null);
    } catch (err) {
      console.error('Failed to update status:', err);
    } finally {
      setSubmittingStatus(false);
    }
  };

  const handleChatClose = () => {
    setShowChatWindow(false);
    loadIssues();
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
        <div className="header-actions">
          <button
            className="submit-button"
            onClick={() => setShowChatWindow(true)}
          >
            要望を伝える
          </button>
        </div>
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
            {issues.map((issue) => {
              const isExpanded = expandedIssueId === issue.id;
              const isEditingThisStatus = editingStatus === issue.id;

              return (
                <div
                  key={issue.id}
                  className={`issue-card ${isExpanded ? 'expanded' : ''}`}
                  onClick={() => handleCardClick(issue)}
                >
                  <div className="issue-header">
                    <span className="issue-category">
                      {CATEGORY_ICONS[issue.category]} {CATEGORY_LABELS[issue.category]}
                    </span>
                    <div className="issue-header-right">
                      {isDeveloper && !isEditingThisStatus && (
                        <button
                          className="status-edit-button"
                          onClick={(e) => handleStartStatusEdit(e, issue)}
                          title="ステータスを変更"
                        >
                          &#9998;
                        </button>
                      )}
                      <span
                        className="issue-status"
                        style={{ backgroundColor: STATUS_COLORS[issue.status] }}
                      >
                        {STATUS_LABELS[issue.status]}
                      </span>
                    </div>
                  </div>

                  {isEditingThisStatus && isDeveloper && (
                    <div className="status-edit-panel" onClick={(e) => e.stopPropagation()}>
                      <div className="status-edit-row">
                        <label className="status-edit-label">ステータス</label>
                        <select
                          className="status-edit-select"
                          value={newStatus}
                          onChange={(e) => setNewStatus(e.target.value as IssueStatus)}
                        >
                          {ALL_STATUSES.map((s) => (
                            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                          ))}
                        </select>
                      </div>
                      <div className="status-edit-row">
                        <label className="status-edit-label">開発者からの回答</label>
                        <textarea
                          className="status-edit-textarea"
                          value={adminResponse}
                          onChange={(e) => setAdminResponse(e.target.value)}
                          placeholder="回答を入力（任意）"
                          rows={3}
                        />
                      </div>
                      <div className="status-edit-actions">
                        <button
                          className="status-edit-cancel"
                          onClick={handleCancelStatusEdit}
                        >
                          キャンセル
                        </button>
                        <button
                          className="status-edit-save"
                          onClick={(e) => handleSubmitStatus(e, issue.id)}
                          disabled={submittingStatus}
                        >
                          {submittingStatus ? '保存中...' : '保存'}
                        </button>
                      </div>
                    </div>
                  )}

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
                      onClick={(e) => handleLike(e, issue)}
                    >
                      ❤️ {issue.like_count}
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="issue-comments-section" onClick={(e) => e.stopPropagation()}>
                      <div className="comments-header">
                        <span className="comments-title">コメント</span>
                        <span className="comments-count">{comments.length}</span>
                      </div>

                      {commentsLoading ? (
                        <div className="comments-loading">読み込み中...</div>
                      ) : comments.length === 0 ? (
                        <div className="comments-empty">まだコメントはありません</div>
                      ) : (
                        <div className="comments-list">
                          {comments.map((comment) => (
                            <div key={comment.id} className="comment-item">
                              <div className="comment-header">
                                <span className="comment-author">
                                  {comment.display_name || '匿名'}
                                </span>
                                <span className="comment-date">
                                  {formatDateTime(comment.created_at, timezone)}
                                </span>
                                {currentUser && comment.user_id === currentUser.id && (
                                  <button
                                    className="comment-delete-button"
                                    onClick={() => handleDeleteComment(issue.id, comment.id)}
                                    title="削除"
                                  >
                                    &times;
                                  </button>
                                )}
                              </div>
                              <p className="comment-content">{comment.content}</p>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="comment-form">
                        <textarea
                          className="comment-input"
                          value={newComment}
                          onChange={(e) => setNewComment(e.target.value)}
                          placeholder="コメントを入力..."
                          rows={2}
                        />
                        <button
                          className="comment-submit-button"
                          onClick={() => handleSubmitComment(issue.id)}
                          disabled={submittingComment || !newComment.trim()}
                        >
                          {submittingComment ? '送信中...' : '送信'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {showChatWindow && (
        <IssueChatWindow onClose={handleChatClose} />
      )}
    </div>
  );
}
