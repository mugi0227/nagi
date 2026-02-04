import { useState, useCallback, useEffect } from 'react';
import { FaComment, FaTrash } from 'react-icons/fa6';
import { issuesApi } from '../../api/issues';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import { useTimezone } from '../../hooks/useTimezone';
import { formatDate } from '../../utils/dateTime';
import type { IssueComment } from '../../api/types';
import './IssueCommentSection.css';

interface Props {
  issueId: string;
}

export function IssueCommentSection({ issueId }: Props) {
  const timezone = useTimezone();
  const { data: currentUser } = useCurrentUser();
  const [comments, setComments] = useState<IssueComment[]>([]);
  const [total, setTotal] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadComments = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await issuesApi.listComments(issueId);
      setComments(response.comments);
      setTotal(response.total);
    } catch (err) {
      console.error('Failed to load comments:', err);
    } finally {
      setIsLoading(false);
    }
  }, [issueId]);

  // Load comment count on mount, full list when expanded
  useEffect(() => {
    if (isExpanded) {
      loadComments();
    }
  }, [isExpanded, loadComments]);

  // Always load count
  useEffect(() => {
    issuesApi.listComments(issueId, { limit: 0 })
      .then((res) => setTotal(res.total))
      .catch(() => {});
  }, [issueId]);

  const handleSubmit = async () => {
    if (!newComment.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const comment = await issuesApi.createComment(issueId, {
        content: newComment.trim(),
      });
      setComments((prev) => [...prev, comment]);
      setTotal((prev) => prev + 1);
      setNewComment('');
    } catch (err) {
      console.error('Failed to create comment:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (commentId: string) => {
    try {
      await issuesApi.deleteComment(issueId, commentId);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
      setTotal((prev) => prev - 1);
    } catch (err) {
      console.error('Failed to delete comment:', err);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="comment-section">
      <button
        className="comment-toggle"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <FaComment className="comment-toggle-icon" />
        <span>
          {total > 0 ? `${total} ` : ''}
          {total > 0 ? 'comments' : 'comment'}
        </span>
      </button>

      {isExpanded && (
        <div className="comment-body">
          {isLoading ? (
            <div className="comment-loading">loading...</div>
          ) : (
            <>
              {comments.length > 0 && (
                <div className="comment-list">
                  {comments.map((comment) => (
                    <div key={comment.id} className="comment-item">
                      <div className="comment-item-header">
                        <span className="comment-author">
                          {comment.display_name || 'anonymous'}
                        </span>
                        <span className="comment-time">
                          {formatDate(
                            new Date(comment.created_at),
                            { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' },
                            timezone,
                          )}
                        </span>
                        {currentUser && comment.user_id === currentUser.id && (
                          <button
                            className="comment-delete-btn"
                            onClick={() => handleDelete(comment.id)}
                            title="delete"
                          >
                            <FaTrash />
                          </button>
                        )}
                      </div>
                      <div className="comment-text">{comment.content}</div>
                    </div>
                  ))}
                </div>
              )}
              <div className="comment-input-row">
                <textarea
                  className="comment-input"
                  placeholder="write a comment..."
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={1}
                />
                <button
                  className="comment-submit-btn"
                  onClick={handleSubmit}
                  disabled={!newComment.trim() || isSubmitting}
                >
                  {isSubmitting ? '...' : 'post'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
