import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './Notifications.css'; // Shared CSS

export default function NotificationToast({ toast, onDismiss }) {
  const navigate = useNavigate();

  useEffect(() => {
    // Auto-dismiss after 6 seconds
    const timer = setTimeout(() => {
      onDismiss(toast.log_id);
    }, 6000);
    return () => clearTimeout(timer);
  }, [toast, onDismiss]);

  const priorityColors = {
    CRITICAL: 'var(--danger, #ff4c4c)',
    HIGH: 'var(--warning, #ff9f43)',
  };

  const borderColor = priorityColors[toast.priority] || 'var(--primary)';

  const handleView = () => {
    onDismiss(toast.log_id);
    navigate('/notifications');
  };

  return (
    <div className="notif-toast glass-card" style={{ borderLeft: `4px solid ${borderColor}` }}>
      <div className="notif-toast-header">
        <span className="notif-toast-title">{toast.title}</span>
        <button className="notif-toast-close" onClick={() => onDismiss(toast.log_id)}>
          <span className="material-symbols-outlined">close</span>
        </button>
      </div>
      <div className="notif-toast-body">
        {toast.body?.length > 80 ? toast.body.substring(0, 80) + '...' : toast.body}
      </div>
      <div className="notif-toast-footer">
        <button className="notif-toast-view-btn" onClick={handleView}>View</button>
      </div>
    </div>
  );
}
