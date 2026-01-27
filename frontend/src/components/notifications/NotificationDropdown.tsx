import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaBell, FaCheckDouble, FaTrophy, FaUsers, FaListCheck, FaEnvelope, FaFlag } from 'react-icons/fa6';
import { motion, AnimatePresence } from 'framer-motion';
import { useNotifications, useUnreadNotificationCount } from '../../hooks/useNotifications';
import type { Notification, NotificationType } from '../../api/types';
import { formatDate } from '../../utils/dateTime';
import { useTimezone } from '../../hooks/useTimezone';
import './NotificationDropdown.css';

function getNotificationIcon(type: NotificationType) {
  switch (type) {
    case 'achievement_personal':
      return <FaTrophy className="notification-icon achievement" />;
    case 'achievement_project':
      return <FaUsers className="notification-icon project-achievement" />;
    case 'task_assigned':
      return <FaListCheck className="notification-icon task" />;
    case 'project_invited':
      return <FaEnvelope className="notification-icon invite" />;
    case 'milestone_reached':
      return <FaFlag className="notification-icon milestone" />;
    default:
      return <FaBell className="notification-icon default" />;
  }
}

function getNavigationPath(notification: Notification): string | null {
  const { link_type, link_id, project_id } = notification;

  switch (link_type) {
    case 'achievement':
      return '/achievement';
    case 'project_achievement':
      return project_id ? `/projects/${project_id}/v2?tab=achievements` : null;
    case 'task':
      return link_id ? `/tasks?task=${link_id}` : '/tasks';
    case 'project':
      return link_id ? `/projects/${link_id}` : '/projects';
    default:
      return null;
  }
}

interface NotificationItemProps {
  notification: Notification;
  onRead: (id: string) => void;
  onClick: () => void;
}

function NotificationItem({ notification, onRead, onClick }: NotificationItemProps) {
  const timezone = useTimezone();

  const handleClick = () => {
    if (!notification.is_read) {
      onRead(notification.id);
    }
    onClick();
  };

  return (
    <div
      className={`notification-item ${notification.is_read ? 'read' : 'unread'}`}
      onClick={handleClick}
    >
      <div className="notification-icon-wrapper">
        {getNotificationIcon(notification.type)}
      </div>
      <div className="notification-content">
        <div className="notification-title">{notification.title}</div>
        <div className="notification-message">{notification.message}</div>
        <div className="notification-meta">
          {notification.project_name && (
            <span className="notification-project">{notification.project_name}</span>
          )}
          <span className="notification-time">
            {formatDate(
              new Date(notification.created_at),
              { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' },
              timezone
            )}
          </span>
        </div>
      </div>
      {!notification.is_read && <div className="unread-indicator" />}
    </div>
  );
}

export function NotificationDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { count: unreadCount } = useUnreadNotificationCount();
  const {
    notifications,
    markAsRead,
    markAllAsRead,
    isMarkingAllAsRead,
  } = useNotifications();

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleNotificationClick = (notification: Notification) => {
    const path = getNavigationPath(notification);
    if (path) {
      navigate(path);
    }
    setIsOpen(false);
  };

  const handleMarkAllAsRead = (e: React.MouseEvent) => {
    e.stopPropagation();
    markAllAsRead();
  };

  return (
    <div className="notification-dropdown-container" ref={dropdownRef}>
      <button
        className="footer-btn notification-btn"
        title="通知"
        onClick={() => setIsOpen(!isOpen)}
      >
        <FaBell />
        {unreadCount > 0 && (
          <span className="notification-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="notification-dropdown"
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.15 }}
          >
            <div className="notification-header">
              <h3>通知</h3>
              {unreadCount > 0 && (
                <button
                  className="mark-all-read-btn"
                  onClick={handleMarkAllAsRead}
                  disabled={isMarkingAllAsRead}
                  title="すべて既読にする"
                >
                  <FaCheckDouble />
                  <span>すべて既読</span>
                </button>
              )}
            </div>

            <div className="notification-list">
              {notifications.length === 0 ? (
                <div className="notification-empty">
                  <FaBell className="empty-icon" />
                  <span>通知はありません</span>
                </div>
              ) : (
                notifications.map((notification) => (
                  <NotificationItem
                    key={notification.id}
                    notification={notification}
                    onRead={markAsRead}
                    onClick={() => handleNotificationClick(notification)}
                  />
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
