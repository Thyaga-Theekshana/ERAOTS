import { useState, useEffect } from 'react';
import { notificationsAPI, emergencyAPI } from '../services/api';

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [respondingId, setRespondingId] = useState(null);
  const [respondedIds, setRespondedIds] = useState({});

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await notificationsAPI.list(50);
      setNotifications(res.data);
    } catch (err) {
      console.error("Failed to fetch notifications", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleMarkRead = async (id, currentStatus) => {
    if (currentStatus) return;
    try {
      await notificationsAPI.markRead(id);
      fetchData();
    } catch (err) {
      console.error("Failed to mark as read", err);
    }
  };

  const handleSafetyResponse = async (notifId, response) => {
    try {
      setRespondingId(notifId);
      await emergencyAPI.respondSafetyCheck(response);
      // Mark as responded locally
      setRespondedIds(prev => ({ ...prev, [notifId]: response === 'YES' ? 'SAFE' : 'IN_DANGER' }));
      // Mark notification as read
      await notificationsAPI.markRead(notifId);
      fetchData();
    } catch (err) {
      const detail = err.response?.data?.detail || "Failed to respond";
      alert(detail);
    } finally {
      setRespondingId(null);
    }
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const getNotificationIcon = (type) => {
    switch (type) {
      case 'SAFETY_CHECK': return 'health_and_safety';
      case 'alert': return 'warning';
      case 'success': return 'check_circle';
      case 'info': return 'info';
      default: return 'notifications';
    }
  };

  const isSafetyCheck = (notif) => {
    return notif.notification_type === 'SAFETY_CHECK';
  };

  return (
    <div className="page-container">
      {/* Page Header */}
      <header className="page-header-premium">
        <div className="page-header-content">
          <span className="page-header-chip">COMMUNICATIONS</span>
          <h1 className="page-title-premium">Notifications</h1>
          <p className="page-subtitle-premium">Your recent alerts and system messages</p>
        </div>
      </header>

      {/* Stats Row */}
      <div className="stats-row">
        <div className="stat-card-mini">
          <span className="stat-card-mini-label">Total</span>
          <span className="stat-card-mini-value">{notifications.length}</span>
        </div>
        <div className="stat-card-mini stat-card-mini--accent">
          <span className="stat-card-mini-label">Unread</span>
          <span className="stat-card-mini-value">{unreadCount}</span>
        </div>
      </div>

      {/* Notifications List */}
      <div className="notifications-card">
        {loading ? (
          <div className="table-loading">
            <div className="loading-spinner"></div>
            <span>Loading notifications...</span>
          </div>
        ) : notifications.length === 0 ? (
          <div className="notifications-empty">
            <span className="material-symbols-outlined">notifications_off</span>
            <p>No notifications yet</p>
            <span className="notifications-empty-hint">You're all caught up!</span>
          </div>
        ) : (
          <div className="notifications-list">
            {notifications.map(notif => {
              const isSafety = isSafetyCheck(notif);
              const respondedStatus = respondedIds[notif.notification_id];
              const alreadyResponded = respondedStatus || (isSafety && notif.is_read);

              if (isSafety) {
                return (
                  <div
                    key={notif.notification_id}
                    className={`safety-notification-card ${!notif.is_read && !respondedStatus ? 'safety-notification-card--active' : 'safety-notification-card--responded'}`}
                  >
                    <div className="safety-notification-header">
                      <div className="safety-notification-icon-wrap">
                        <span className="material-symbols-outlined safety-notification-icon">emergency</span>
                      </div>
                      <div className="safety-notification-info">
                        <h3 className="safety-notification-title">{notif.title}</h3>
                        <span className="safety-notification-time">
                          {new Date(notif.created_at).toLocaleString()}
                        </span>
                      </div>
                    </div>
                    <p className="safety-notification-message">{notif.message}</p>

                    {alreadyResponded ? (
                      <div className={`safety-notification-responded ${respondedStatus === 'SAFE' || notif.is_read ? 'safety-notification-responded--safe' : 'safety-notification-responded--danger'}`}>
                        <span className="material-symbols-outlined">
                          {respondedStatus === 'IN_DANGER' ? 'warning' : 'verified_user'}
                        </span>
                        <span>
                          {respondedStatus === 'IN_DANGER'
                            ? 'You reported that you need help. Stay calm, help is on the way.'
                            : 'You have been marked as SAFE. Thank you for responding.'}
                        </span>
                      </div>
                    ) : (
                      <div className="safety-notification-actions">
                        <button
                          className="btn safety-btn-safe"
                          onClick={() => handleSafetyResponse(notif.notification_id, 'YES')}
                          disabled={respondingId === notif.notification_id}
                        >
                          <span className="material-symbols-outlined">verified_user</span>
                          {respondingId === notif.notification_id ? 'Sending...' : "Yes, I'm Safe"}
                        </button>
                        <button
                          className="btn safety-btn-danger"
                          onClick={() => handleSafetyResponse(notif.notification_id, 'NO')}
                          disabled={respondingId === notif.notification_id}
                        >
                          <span className="material-symbols-outlined">warning</span>
                          {respondingId === notif.notification_id ? 'Sending...' : 'No, I Need Help'}
                        </button>
                      </div>
                    )}
                  </div>
                );
              }

              // Regular notification
              return (
                <div
                  key={notif.notification_id}
                  className={`notification-item ${!notif.is_read ? 'notification-item--unread' : ''}`}
                  onClick={() => handleMarkRead(notif.notification_id, notif.is_read)}
                >
                  <div className="notification-indicator">
                    <span className={`material-symbols-outlined notification-icon ${!notif.is_read ? 'notification-icon--unread' : ''}`}>
                      {getNotificationIcon(notif.type)}
                    </span>
                  </div>
                  <div className="notification-content">
                    <div className="notification-header">
                      <h3 className="notification-title">{notif.title}</h3>
                      <span className="notification-time">
                        {new Date(notif.created_at).toLocaleString()}
                      </span>
                    </div>
                    <p className="notification-message">{notif.message}</p>
                  </div>
                  {!notif.is_read && (
                    <div className="notification-unread-dot"></div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
