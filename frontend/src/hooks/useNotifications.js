import { useState, useEffect, useCallback } from 'react';
import { notificationsAPI, createDashboardSocket } from '../services/api';

export function useNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [toasts, setToasts] = useState([]);

  const fetchItems = useCallback(async () => {
    try {
      // Get recent 10 notifications for the dropdown
      const res = await notificationsAPI.list({ limit: 10 });
      setNotifications(res.data.items || []);
      
      const countRes = await notificationsAPI.getUnreadCount();
      setUnreadCount(countRes.data.count || 0);
    } catch (err) {
      console.error("Failed to fetch notifications", err);
    }
  }, []);

  useEffect(() => {
    fetchItems();

    // The websocket provides real-time notification drops
    const ws = createDashboardSocket((data) => {
      if (data.type === 'NOTIFICATION') {
        // Build object matching backend NotificationLog structure
        const newNotif = {
          log_id: Date.now().toString(), // local fallback ID
          triggered_by: data.alert_type,
          title: data.title,
          body: data.body,
          priority: data.priority,
          sent_at: data.timestamp,
          read_at: null,
          isNew: true
        };

        setNotifications(prev => [newNotif, ...prev].slice(0, 10));
        setUnreadCount(prev => prev + 1);

        // Show toast if HIGH or CRITICAL
        if (data.priority === 'HIGH' || data.priority === 'CRITICAL') {
          setToasts(prev => [...prev, newNotif]);
        }
      }
    });

    return () => ws.close();
  }, [fetchItems]);

  // Remove toast manually
  const removeToast = (toastId) => {
    setToasts(prev => prev.filter(t => t.log_id !== toastId));
  };

  const markAsRead = async (id) => {
    try {
      await notificationsAPI.markRead(id);
      setNotifications(prev => prev.map(n => n.log_id === id ? { ...n, read_at: new Date().toISOString() } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error("Failed to mark as read", err);
    }
  };

  const markAllAsRead = async () => {
    try {
      await notificationsAPI.markAllRead();
      setNotifications(prev => prev.map(n => ({ ...n, read_at: new Date().toISOString() })));
      setUnreadCount(0);
    } catch (err) {
      console.error("Failed to mark all as read", err);
    }
  };

  return {
    notifications,
    unreadCount,
    toasts,
    removeToast,
    markAsRead,
    markAllAsRead,
    refetch: fetchItems
  };
}
