/**
 * ProfilePage — Personal profile management for employees.
 * Allows viewing and editing personal details, changing password.
 */
import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { authAPI, attendanceAPI, leaveAPI, calendarAPI } from '../services/api';

const isPlainObject = (value) => value && typeof value === 'object' && !Array.isArray(value);

const normalizeCalendarSettings = (payload) => {
  if (!isPlainObject(payload)) {
    return null;
  }

  return {
    ...payload,
    provider: payload.provider || '',
    is_enabled: Boolean(payload.is_enabled),
    last_sync_at: payload.last_sync_at || null,
  };
};

export default function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [formData, setFormData] = useState({
    phone: '',
    profile_image_url: '',
    job_title: '',
  });
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [stats, setStats] = useState({
    presentDays: 0,
    lateDays: 0,
    leaveDays: 0,
    pendingRequests: 0,
  });
  const [calendarSettings, setCalendarSettings] = useState(null);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    if (user) {
      setFormData({
        phone: user.phone || '',
        profile_image_url: user.profile_image_url || '',
        job_title: user.job_title || '',
      });
      fetchStats();
      fetchCalendarSettings();
    }
  }, [user]);

  const fetchCalendarSettings = async () => {
    try {
      const res = await calendarAPI.getSettings();
      setCalendarSettings(normalizeCalendarSettings(res.data));
    } catch (err) {
      console.error('Failed to fetch calendar settings:', err);
      setCalendarSettings(null);
    }
  };

  const handleConnectGoogleCalendar = async () => {
    setCalendarLoading(true);
    try {
      const res = await calendarAPI.getConnectUrl();
      if (isPlainObject(res.data) && typeof res.data.auth_url === 'string' && res.data.auth_url.length > 0) {
        window.location.href = res.data.auth_url;
      } else {
        setMessage({ type: 'error', text: 'Calendar connect URL is unavailable' });
        setCalendarLoading(false);
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.detail || 'Failed to connect calendar' });
      setCalendarLoading(false);
    }
  };

  const handleDisconnectCalendar = async () => {
    setCalendarLoading(true);
    try {
      await calendarAPI.disconnect();
      await fetchCalendarSettings();
      setMessage({ type: 'success', text: 'Calendar disconnected' });
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to disconnect calendar' });
    } finally {
      setCalendarLoading(false);
    }
  };

  useEffect(() => {
    // Check if we came back from OAuth
    const params = new URLSearchParams(window.location.search);
    if (params.get('calendar_status') === 'success') {
      setMessage({ type: 'success', text: 'Google Calendar successfully connected!' });
      window.history.replaceState({}, document.title, window.location.pathname);
      fetchCalendarSettings();
    } else if (params.get('calendar_status') === 'error') {
      setMessage({ type: 'error', text: 'Failed to connect Google Calendar: ' + (params.get('detail') || 'Unknown error') });
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const fetchStats = async () => {
    try {
      // Fetch attendance stats for current month
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
      
      const [attendanceRes, leaveRes] = await Promise.all([
        attendanceAPI.list({ employee_id: user.employee_id, start_date: startOfMonth, end_date: endOfMonth }),
        leaveAPI.myRequests(),
      ]);
      
      const records = Array.isArray(attendanceRes.data) ? attendanceRes.data : [];
      const leaves = Array.isArray(leaveRes.data) ? leaveRes.data : [];
      
      setStats({
        presentDays: records.filter(r => r.status === 'PRESENT' || r.status === 'LATE').length,
        lateDays: records.filter(r => r.status === 'LATE').length,
        leaveDays: leaves.filter(l => l.status === 'APPROVED').reduce((sum, l) => {
          const start = new Date(l.start_date);
          const end = new Date(l.end_date);
          return sum + Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
        }, 0),
        pendingRequests: leaves.filter(l => l.status === 'PENDING').length,
      });
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  };

  const handleSaveProfile = async () => {
    setLoading(true);
    setMessage({ type: '', text: '' });
    try {
      await authAPI.updateProfile(formData);
      await refreshUser();
      setEditing(false);
      setMessage({ type: 'success', text: 'Profile updated successfully!' });
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.detail || 'Failed to update profile' });
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async () => {
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setMessage({ type: 'error', text: 'New passwords do not match' });
      return;
    }
    if (passwordData.newPassword.length < 6) {
      setMessage({ type: 'error', text: 'Password must be at least 6 characters' });
      return;
    }
    
    setLoading(true);
    setMessage({ type: '', text: '' });
    try {
      await authAPI.changePassword(passwordData.currentPassword, passwordData.newPassword);
      setShowPasswordModal(false);
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setMessage({ type: 'success', text: 'Password changed successfully!' });
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.detail || 'Failed to change password' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-container">
      {/* Page Header */}
      <header className="page-header-premium">
        <div className="page-header-content">
          <span className="page-header-chip">PERSONAL</span>
          <h1 className="page-title-premium">My Profile</h1>
          <p className="page-subtitle-premium">View and manage your personal information</p>
        </div>
      </header>

      {/* Message */}
      {message.text && (
        <div className={`alert-banner ${message.type === 'error' ? 'alert-banner--error' : 'alert-banner--success'}`}>
          <span className="material-symbols-outlined">
            {message.type === 'error' ? 'error' : 'check_circle'}
          </span>
          <span>{message.text}</span>
          <button className="alert-banner-dismiss" onClick={() => setMessage({ type: '', text: '' })}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
      )}

      <div className="profile-layout">
        {/* Profile Card */}
        <div className="profile-card glass-card">
          <div className="profile-avatar-section">
            <div className="profile-avatar-large">
              {user?.profile_image_url ? (
                <img src={user.profile_image_url} alt={user.full_name} />
              ) : (
                <span>{user?.full_name?.charAt(0)?.toUpperCase() || 'U'}</span>
              )}
            </div>
            <div className="profile-name-section">
              <h2 className="profile-name">{user?.full_name}</h2>
              <span className="profile-role-badge">{user?.role?.replace('_', ' ')}</span>
            </div>
          </div>

          <div className="profile-details">
            <div className="profile-detail-row">
              <span className="material-symbols-outlined">email</span>
              <span>{user?.email}</span>
            </div>
            <div className="profile-detail-row">
              <span className="material-symbols-outlined">work</span>
              {editing ? (
                <input
                  type="text"
                  className="profile-input"
                  value={formData.job_title}
                  onChange={(e) => setFormData({ ...formData, job_title: e.target.value })}
                  placeholder="e.g. DevOps Engineer, QA Lead"
                />
              ) : (
                <span>{user?.job_title || 'No job title set'}</span>
              )}
            </div>
            <div className="profile-detail-row">
              <span className="material-symbols-outlined">phone</span>
              {editing ? (
                <input
                  type="text"
                  className="profile-input"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="Enter phone number"
                />
              ) : (
                <span>{user?.phone || 'Not set'}</span>
              )}
            </div>
            <div className="profile-detail-row">
              <span className="material-symbols-outlined">corporate_fare</span>
              <span>{user?.department || 'No Department'}</span>
            </div>
            {user?.is_manager && (
              <div className="profile-detail-row">
                <span className="material-symbols-outlined">manage_accounts</span>
                <span>Manager of {user?.managed_department_name}</span>
              </div>
            )}
          </div>

          <div className="profile-actions">
            {editing ? (
              <>
                <button className="btn-secondary" onClick={() => setEditing(false)} disabled={loading}>
                  Cancel
                </button>
                <button className="btn-primary" onClick={handleSaveProfile} disabled={loading}>
                  {loading ? 'Saving...' : 'Save Changes'}
                </button>
              </>
            ) : (
              <>
                <button className="btn-secondary" onClick={() => setEditing(true)}>
                  <span className="material-symbols-outlined">edit</span>
                  Edit Profile
                </button>
                <button className="btn-secondary" onClick={() => setShowPasswordModal(true)}>
                  <span className="material-symbols-outlined">key</span>
                  Change Password
                </button>
              </>
            )}
          </div>
        </div>

        {/* Stats Cards */}
        <div className="profile-stats-grid">
          <div className="stat-card glass-card">
            <span className="material-symbols-outlined stat-icon" style={{ color: 'var(--success)' }}>
              event_available
            </span>
            <div className="stat-content">
              <span className="stat-value">{stats.presentDays}</span>
              <span className="stat-label">Days Present</span>
            </div>
          </div>
          
          <div className="stat-card glass-card">
            <span className="material-symbols-outlined stat-icon" style={{ color: 'var(--warning)' }}>
              schedule
            </span>
            <div className="stat-content">
              <span className="stat-value">{stats.lateDays}</span>
              <span className="stat-label">Late Arrivals</span>
            </div>
          </div>
          
          <div className="stat-card glass-card">
            <span className="material-symbols-outlined stat-icon" style={{ color: 'var(--accent)' }}>
              beach_access
            </span>
            <div className="stat-content">
              <span className="stat-value">{stats.leaveDays}</span>
              <span className="stat-label">Leave Days</span>
            </div>
          </div>
          
          <div className="stat-card glass-card">
            <span className="material-symbols-outlined stat-icon" style={{ color: 'var(--secondary)' }}>
              pending
            </span>
            <div className="stat-content">
              <span className="stat-value">{stats.pendingRequests}</span>
              <span className="stat-label">Pending Requests</span>
            </div>
          </div>
        </div>

        {/* Integrations Card */}
        <div className="profile-card glass-card integration-card" style={{ marginTop: '20px' }}>
          <div className="profile-card-header" style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
            <span className="material-symbols-outlined" style={{ color: 'var(--primary)' }}>calendar_month</span>
            <h3 style={{ margin: 0, fontSize: '1.2rem' }}>Calendar Integration</h3>
          </div>
          
          <div className="integration-content" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="integration-info">
              <h4 style={{ margin: '0 0 5px 0' }}>Google Calendar Sync</h4>
              <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem', maxWidth: '400px' }}>
                Automatically transition to "In Meeting" status based on your calendar events. You'll receive a 30-second warning before any transition.
              </p>
              
              {calendarSettings?.provider === 'GOOGLE' && calendarSettings?.is_enabled && (
                <div style={{ marginTop: '10px', fontSize: '0.85rem', color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>check_circle</span>
                  Connected and syncing
                  {calendarSettings.last_sync_at && ` (Last sync: ${new Date(calendarSettings.last_sync_at).toLocaleTimeString()})`}
                </div>
              )}
            </div>
            
            <div className="integration-actions">
              {calendarSettings?.provider === 'GOOGLE' && calendarSettings?.is_enabled ? (
                <button 
                  className="btn-secondary" 
                  onClick={handleDisconnectCalendar}
                  disabled={calendarLoading}
                >
                  {calendarLoading ? 'Disconnecting...' : 'Disconnect'}
                </button>
              ) : (
                <button 
                  className="btn-primary" 
                  onClick={handleConnectGoogleCalendar}
                  disabled={calendarLoading}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  <img src="https://www.gstatic.com/images/branding/product/1x/calendar_48dp.png" alt="Google Calendar" style={{ width: '18px', height: '18px' }} />
                  {calendarLoading ? 'Connecting...' : 'Connect Calendar'}
                </button>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* Password Change Modal */}
      {showPasswordModal && (
        <div className="modal-overlay" onClick={() => setShowPasswordModal(false)}>
          <div className="modal-content modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Change Password</h3>
              <button className="modal-close" onClick={() => setShowPasswordModal(false)}>
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Current Password</label>
                <input
                  type="password"
                  className="form-input"
                  value={passwordData.currentPassword}
                  onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>New Password</label>
                <input
                  type="password"
                  className="form-input"
                  value={passwordData.newPassword}
                  onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Confirm New Password</label>
                <input
                  type="password"
                  className="form-input"
                  value={passwordData.confirmPassword}
                  onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowPasswordModal(false)}>
                Cancel
              </button>
              <button className="btn-primary" onClick={handleChangePassword} disabled={loading}>
                {loading ? 'Changing...' : 'Change Password'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
