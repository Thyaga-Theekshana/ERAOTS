import React, { useState, useEffect } from 'react';
import { notificationsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useUIFeedback } from '../context/UIFeedbackContext';
import { TableSkeleton, ErrorStateStandard } from '../components/DataStates';
import '../components/notifications/Notifications.css';

const DEFAULT_TYPES = [
  { id: 'LATE_ARRIVAL', label: 'Late Arrival', desc: 'Notified when you arrive late' },
  { id: 'EARLY_EXIT', label: 'Early Exit', desc: 'You leave before required hours' },
  { id: 'FREQUENT_LATENESS', label: 'Frequent Lateness', desc: 'Late 3+ times in 5 days' },
  { id: 'LONG_BREAK', label: 'Long Break', desc: 'Break exceeds your threshold' },
  { id: 'MISSED_EXIT', label: 'Missed Exit Scan', desc: 'Reminder to scan out' },
  { id: 'MEETING_REMINDER', label: 'Meeting Reminder', desc: 'Upcoming meeting reminders' },
  { id: 'ANNOUNCEMENT', label: 'Announcements', desc: 'Company-wide announcements' }
];

const ADMIN_TYPES = [
  { id: 'ABSENT', label: 'Absent', desc: 'Employee has no scan today' },
  { id: 'OVER_CAPACITY', label: 'Over Capacity', desc: 'Office reached capacity' },
  { id: 'DEVICE_OFFLINE', label: 'Device Offline', desc: 'Scanner goes offline' },
  { id: 'UNAUTHORIZED', label: 'Unauthorized Access', desc: 'Unknown fingerprint scan' }
];

export default function NotificationSettings() {
  const { isSuperAdmin, isAdmin } = useAuth();
  const ui = useUIFeedback();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pageError, setPageError] = useState('');
  const [prefs, setPrefs] = useState({
    enabled_types: [],
    enabled_channels: [],
    late_threshold_minutes: 0,
    break_threshold_minutes: 30,
    ai_tracking_enabled: true,
    suppress_on_leave: true,
    suppress_on_holiday: true
  });
  
  const hasAdminFields = isSuperAdmin || isAdmin;
  const availableTypes = hasAdminFields ? [...DEFAULT_TYPES, ...ADMIN_TYPES] : DEFAULT_TYPES;

  const fetchPreferences = async () => {
    try {
      setLoading(true);
      setPageError('');
      const res = await notificationsAPI.getPreferences();
      setPrefs({
        enabled_types: res.data.enabled_types || [],
        enabled_channels: res.data.enabled_channels || [],
        late_threshold_minutes: res.data.late_threshold_minutes || 0,
        break_threshold_minutes: res.data.break_threshold_minutes || 30,
        ai_tracking_enabled: res.data.ai_tracking_enabled ?? true,
        suppress_on_leave: res.data.suppress_on_leave ?? true,
        suppress_on_holiday: res.data.suppress_on_holiday ?? true
      });
    } catch (err) {
      console.error(err);
      const detail = err.response?.data?.detail || 'Failed to load notification settings.';
      setPageError(detail);
      ui.error(detail);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPreferences();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await notificationsAPI.updatePreferences(prefs);
      ui.success('Preferences saved successfully!');
    } catch (err) {
      console.error(err);
      ui.error('Failed to save preferences.');
    } finally {
      setSaving(false);
    }
  };

  const toggleChannel = (channel) => {
    setPrefs(p => {
      const arr = p.enabled_channels.includes(channel) 
        ? p.enabled_channels.filter(c => c !== channel)
        : [...p.enabled_channels, channel];
      return { ...p, enabled_channels: arr };
    });
  };

  const toggleType = (typeId) => {
    setPrefs(p => {
      const arr = p.enabled_types.includes(typeId) 
        ? p.enabled_types.filter(t => t !== typeId)
        : [...p.enabled_types, typeId];
      return { ...p, enabled_types: arr };
    });
  };

  if (loading) {
    return (
      <div className="page-wrapper" style={{ padding: '24px', maxWidth: '900px', margin: '0 auto' }}>
        <TableSkeleton rows={10} columns={3} label="Loading notification settings..." />
      </div>
    );
  }

  return (
    <div className="page-wrapper" style={{ padding: '24px', maxWidth: '900px', margin: '0 auto' }}>
      <h1 className="header-title" style={{ marginBottom: '8px' }}>Notification Settings</h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '32px' }}>Configure how and when you want to be alerted.</p>

      {pageError && <ErrorStateStandard message={pageError} onRetry={fetchPreferences} retryLabel="Retry" />}
      
      {/* SECTION 1: CHANNELS */}
      <section className="glass-card" style={{ padding: '24px', marginBottom: '24px' }}>
        <h3 style={{ marginBottom: '16px' }}>Delivery Channels</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
          
          <div 
            className={`glass-card ${prefs.enabled_channels.includes('in_app') ? 'active-border' : ''}`}
            style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px', cursor: 'pointer', border: prefs.enabled_channels.includes('in_app') ? '2px solid var(--primary)' : '1px solid rgba(255,255,255,0.1)' }}
            onClick={() => toggleChannel('in_app')}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="material-symbols-outlined" style={{ color: 'var(--primary)', fontSize: '28px' }}>notifications</span>
              <input type="checkbox" checked={prefs.enabled_channels.includes('in_app')} readOnly />
            </div>
            <strong style={{ marginTop: '8px' }}>In-App Alerts</strong>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Recommended — always instant</span>
          </div>

          <div 
            className={`glass-card ${prefs.enabled_channels.includes('email') ? 'active-border' : ''}`}
            style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px', cursor: 'pointer', border: prefs.enabled_channels.includes('email') ? '2px solid var(--primary)' : '1px solid rgba(255,255,255,0.1)' }}
            onClick={() => toggleChannel('email')}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="material-symbols-outlined" style={{ color: 'var(--secondary)', fontSize: '28px' }}>mail</span>
              <input type="checkbox" checked={prefs.enabled_channels.includes('email')} readOnly />
            </div>
            <strong style={{ marginTop: '8px' }}>Email Summary</strong>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Daily digests and summaries</span>
          </div>

          <div 
            className={`glass-card ${prefs.enabled_channels.includes('whatsapp') ? 'active-border' : ''}`}
            style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px', cursor: 'pointer', border: prefs.enabled_channels.includes('whatsapp') ? '2px solid var(--primary)' : '1px solid rgba(255,255,255,0.1)' }}
            onClick={() => toggleChannel('whatsapp')}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="material-symbols-outlined" style={{ color: 'var(--success)', fontSize: '28px' }}>chat</span>
              <input type="checkbox" checked={prefs.enabled_channels.includes('whatsapp')} readOnly />
            </div>
            <strong style={{ marginTop: '8px' }}>WhatsApp</strong>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>High priority & critical alerts only</span>
          </div>

        </div>
      </section>

      {/* SECTION 2: ALERT TYPES */}
      <section className="glass-card" style={{ padding: '24px', marginBottom: '24px' }}>
        <h3 style={{ marginBottom: '16px' }}>Alert Subscriptions</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
              <th style={{ padding: '12px 8px' }}>Alert Type</th>
              <th style={{ padding: '12px 8px' }}>Description</th>
              <th style={{ padding: '12px 8px', textAlign: 'right' }}>Enabled</th>
            </tr>
          </thead>
          <tbody>
            {availableTypes.map(type => (
              <tr key={type.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <td style={{ padding: '16px 8px', fontWeight: 500 }}>{type.label}</td>
                <td style={{ padding: '16px 8px', color: 'var(--text-secondary)' }}>{type.desc}</td>
                <td style={{ padding: '16px 8px', textAlign: 'right' }}>
                  <input type="checkbox" className="toggle-switch" checked={prefs.enabled_types.includes(type.id)} onChange={() => toggleType(type.id)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
        {/* SECTION 3: THRESHOLDS */}
        <section className="glass-card" style={{ padding: '24px', flex: 1, minWidth: '300px' }}>
          <h3 style={{ marginBottom: '16px' }}>Threshold Tuning</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <strong>Mark late after X minutes past grace period</strong>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>0 = alert as soon as grace period ends</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <input type="range" min="0" max="60" value={prefs.late_threshold_minutes} onChange={e => setPrefs({...prefs, late_threshold_minutes: parseInt(e.target.value)})} style={{ flex: 1 }} />
                <span style={{ width: '40px', fontWeight: 'bold' }}>{prefs.late_threshold_minutes}m</span>
              </div>
            </label>
            
            <label style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <strong>Long break alert after X minutes</strong>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <input type="range" min="15" max="120" value={prefs.break_threshold_minutes} onChange={e => setPrefs({...prefs, break_threshold_minutes: parseInt(e.target.value)})} style={{ flex: 1 }} />
                <span style={{ width: '40px', fontWeight: 'bold' }}>{prefs.break_threshold_minutes}m</span>
              </div>
            </label>
          </div>
        </section>

        {/* SECTION 4: SMART SUPPRESSION */}
        <section className="glass-card" style={{ padding: '24px', flex: 1, minWidth: '300px' }}>
          <h3 style={{ marginBottom: '16px' }}>Smart Suppression</h3>
          <div style={{ background: 'rgba(255,255,255,0.05)', padding: '12px', borderRadius: '8px', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '20px' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '16px', verticalAlign: 'text-bottom', marginRight: '6px' }}>info</span>
            These settings prevent unnecessary alerts when you're not expected to be in the office.
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
              <span style={{ fontWeight: 500 }}>Don't alert me on approved leave</span>
              <input type="checkbox" checked={prefs.suppress_on_leave} onChange={e => setPrefs({...prefs, suppress_on_leave: e.target.checked})} />
            </label>
            
            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
              <span style={{ fontWeight: 500 }}>Don't alert me on company holidays</span>
              <input type="checkbox" checked={prefs.suppress_on_holiday} onChange={e => setPrefs({...prefs, suppress_on_holiday: e.target.checked})} />
            </label>
          </div>
        </section>
      </div>

      <div style={{ marginTop: '32px', textAlign: 'right' }}>
        <button className="btn-primary" onClick={handleSave} disabled={saving} style={{ padding: '12px 32px', fontSize: '1rem' }}>
          {saving ? 'Saving...' : 'Save Preferences'}
        </button>
      </div>
    </div>
  );
}
