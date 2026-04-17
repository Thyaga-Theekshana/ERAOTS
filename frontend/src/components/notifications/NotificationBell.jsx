import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '../../hooks/useNotifications';
import NotificationToast from './NotificationToast';
import './Notifications.css';

const PRIORITY_COLORS = {
  CRITICAL: 'var(--danger, #ff4c4c)',
  HIGH: 'var(--warning, #ff9f43)',
  MEDIUM: 'var(--secondary, #ffd700)',
  LOW: 'var(--text-muted, #888)'
};

const TYPE_ICONS = {
  LATE_ARRIVAL: 'schedule',
  ABSENT: 'person_off',
  EARLY_EXIT: 'directions_run',
  LONG_BREAK: 'coffee',
  UNAUTHORIZED: 'gpp_bad',
  OVER_CAPACITY: 'groups',
  DEVICE_OFFLINE: 'router',
  MEETING_REMINDER: 'event',
  ANNOUNCEMENT: 'campaign',
  DEFAULT: 'notifications'
};

export default function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  const navigate = useNavigate();

  const {
    notifications,
    unreadCount,
    toasts,
    removeToast,
    markAsRead,
    markAllAsRead
  } = useNotifications();

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleNotifClick = async (notif) => {
    if (!notif.read_at) {
      await markAsRead(notif.log_id);
    }
    setIsOpen(false);
    navigate('/notifications');
  };

  const formatRelativeTime = (ts) => {
    if (!ts) return '';
    const diff = (Date.now() - new Date(ts).getTime()) / 1000;
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  return (
    <>
      <div className="notif-bell-container" ref={dropdownRef}>
        <div className="notif-bell-icon" onClick={() => setIsOpen(!isOpen)}>
          <span className="material-symbols-outlined">notifications</span>
          {unreadCount > 0 && (
            <span className="notif-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
          )}
        </div>

        {isOpen && (
          <div className="notif-dropdown glass-card">
            <div className="notif-dropdown-header">
              <span>Notifications</span>
            </div>
            
            <div className="notif-dropdown-body">
              {notifications.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  No recent notifications.
                </div>
              ) : (
                notifications.map((notif) => {
                  const isUnread = !notif.read_at;
                  const color = PRIORITY_COLORS[notif.priority] || PRIORITY_COLORS.LOW;
                  
                  return (
                    <div 
                      key={notif.log_id} 
                      className={`notif-dropdown-item ${isUnread ? 'unread' : ''}`}
                      style={{ borderColor: color }}
                      onClick={() => handleNotifClick(notif)}
                    >
                      <div className="notif-item-icon" style={{ color }}>
                        <span className="material-symbols-outlined">
                          {TYPE_ICONS[notif.triggered_by] || TYPE_ICONS.DEFAULT}
                        </span>
                      </div>
                      <div className="notif-dropdown-content">
                        <div className="notif-item-title" style={{ fontWeight: isUnread ? 700 : 500 }}>
                          {notif.title}
                        </div>
                        <div className="notif-item-body">
                          {notif.body?.length > 80 ? notif.body.substring(0, 80) + '...' : notif.body}
                        </div>
                        <div className="notif-item-time">
                          {formatRelativeTime(notif.sent_at)}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="notif-dropdown-footer">
              <button 
                onClick={() => {
                  markAllAsRead();
                  setIsOpen(false);
                }}
                disabled={unreadCount === 0}
                style={{ opacity: unreadCount === 0 ? 0.5 : 1 }}
              >
                Mark all as read
              </button>
              <button onClick={() => {
                setIsOpen(false);
                navigate('/notifications');
              }}>
                View all
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Global Toast Container */}
      <div className="notif-toast-container">
        {toasts.map(toast => (
          <NotificationToast key={toast.log_id} toast={toast} onDismiss={removeToast} />
        ))}
      </div>
    </>
  );
}
