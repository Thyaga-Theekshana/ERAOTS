import { useState, useEffect } from 'react';
import { notificationsAPI, emergencyAPI } from '../services/api';
import { useUIFeedback } from '../context/UIFeedbackContext';
import { TableSkeleton, EmptyStateStandard, ErrorStateStandard } from '../components/DataStates';

export default function NotificationsPage() {
  const ui = useUIFeedback();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState('');
  const [respondingId, setRespondingId] = useState(null);
  const [respondedIds, setRespondedIds] = useState({});

  const fetchData = async () => {
    try {
      setLoading(true);
      setPageError('');
      const res = await notificationsAPI.list({ limit: 50 });
      // notifications_v2 returns { total, items } shape
      setNotifications(res.data?.items || res.data || []);
    } catch (err) {
      console.error("Failed to fetch notifications", err);
      const detail = err.response?.data?.detail || 'Failed to fetch notifications';
      setPageError(detail);
      ui.error(detail);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleMarkRead = async (id, readAt) => {
    if (readAt) return;  // already read
    try {
      await notificationsAPI.markRead(id);
      fetchData();
    } catch (err) {
      console.error("Failed to mark as read", err);
      ui.error(err.response?.data?.detail || 'Failed to mark notification as read');
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
      ui.error(detail);
    } finally {
      setRespondingId(null);
    }
  };

  // unread = read_at is null (NotificationLog schema)
  const unreadCount = notifications.filter(n => !n.read_at).length;

  const getNotificationIcon = (triggerType) => {
    switch (triggerType) {
      case 'SAFETY_CHECK': return 'health_and_safety';
      case 'LATE_ARRIVAL': return 'schedule';
      case 'ABSENT': return 'person_off';
      case 'EARLY_EXIT': return 'directions_run';
      case 'LONG_BREAK': return 'coffee';
      case 'UNAUTHORIZED': return 'gpp_bad';
      case 'DEVICE_OFFLINE': return 'router';
      case 'MEETING_REMINDER': return 'event';
      case 'ANNOUNCEMENT': return 'campaign';
      default: return 'notifications';
    }
  };

  // Safety check notifs use triggered_by field from NotificationLog
  const isSafetyCheck = (notif) => {
    return notif.triggered_by === 'SAFETY_CHECK';
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

      {pageError && <ErrorStateStandard message={pageError} onRetry={fetchData} />}

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
          <TableSkeleton rows={8} columns={3} label="Loading notifications..." />
        ) : notifications.length === 0 ? (
          <EmptyStateStandard
            icon="notifications_off"
            title="No notifications yet"
            message="You are all caught up."
          />
        ) : (
          <div className="notifications-list">
            {notifications.map(notif => {
              const isSafety = isSafetyCheck(notif);
              // Use log_id (NotificationLog) as unique key
              const notifId = notif.log_id || notif.notification_id;
              const respondedStatus = respondedIds[notifId];
              const alreadyResponded = respondedStatus || (isSafety && notif.read_at);

              if (isSafety) {
                return (
                  <div
                    key={notifId}
                    className={`safety-notification-card ${!notif.read_at && !respondedStatus ? 'safety-notification-card--active' : 'safety-notification-card--responded'}`}
                  >
                    <div className="safety-notification-header">
                      <div className="safety-notification-icon-wrap">
                        <span className="material-symbols-outlined safety-notification-icon">emergency</span>
                      </div>
                      <div className="safety-notification-info">
                        <h3 className="safety-notification-title">{notif.title}</h3>
                        <span className="safety-notification-time">
                          {new Date(notif.sent_at || notif.created_at).toLocaleString()}
                        </span>
                      </div>
                    </div>
                    <p className="safety-notification-message">{notif.body || notif.message}</p>

                    {alreadyResponded ? (
                      <div className={`safety-notification-responded ${respondedStatus === 'SAFE' || notif.read_at ? 'safety-notification-responded--safe' : 'safety-notification-responded--danger'}`}>
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
                          onClick={() => handleSafetyResponse(notifId, 'YES')}
                          disabled={respondingId === notifId}
                        >
                          <span className="material-symbols-outlined">verified_user</span>
                          {respondingId === notifId ? 'Sending...' : "Yes, I'm Safe"}
                        </button>
                        <button
                          className="btn safety-btn-danger"
                          onClick={() => handleSafetyResponse(notifId, 'NO')}
                          disabled={respondingId === notifId}
                        >
                          <span className="material-symbols-outlined">warning</span>
                          {respondingId === notifId ? 'Sending...' : 'No, I Need Help'}
                        </button>
                      </div>
                    )}
                  </div>
                );
              }

              // Regular notification
              return (
                <div
                  key={notifId}
                  className={`notification-item ${!notif.read_at ? 'notification-item--unread' : ''}`}
                  onClick={() => handleMarkRead(notifId, notif.read_at)}
                >
                  <div className="notification-indicator">
                    <span className={`material-symbols-outlined notification-icon ${!notif.read_at ? 'notification-icon--unread' : ''}`}>
                      {getNotificationIcon(notif.triggered_by)}
                    </span>
                  </div>
                  <div className="notification-content">
                    <div className="notification-header">
                      <h3 className="notification-title">{notif.title}</h3>
                      <span className="notification-time">
                        {new Date(notif.sent_at || notif.created_at).toLocaleString()}
                      </span>
                    </div>
                    <p className="notification-message">{notif.body || notif.message}</p>
                  </div>
                  {!notif.read_at && (
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
