import React, { useState, useEffect } from 'react';
import { announcementsAPI, employeeAPI, departmentAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useUIFeedback } from '../context/UIFeedbackContext';
import { TableSkeleton, EmptyStateStandard, ErrorStateStandard } from '../components/DataStates';
import '../components/notifications/Notifications.css';

const PRIORITY_COLORS = {
  CRITICAL: 'var(--danger, #ff4c4c)',
  HIGH: 'var(--warning, #ff9f43)',
  MEDIUM: 'var(--secondary, #ffd700)',
  LOW: 'var(--text-muted, #888)'
};

export default function Announcements() {
  const { isSuperAdmin, isAdmin } = useAuth();
  const ui = useUIFeedback();
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Form State
  const [formData, setFormData] = useState({
    title: '', body: '', priority: 'LOW',
    target_type: 'ALL', target_ids: [],
    sendTiming: 'NOW', scheduled_at: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [departments, setDepartments] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [pageError, setPageError] = useState('');

  const fetchItems = async () => {
    try {
      setPageError('');
      const res = await announcementsAPI.list();
      setAnnouncements(res.data || []);
    } catch (err) {
      console.error(err);
      const detail = err.response?.data?.detail || 'Failed to load announcements.';
      setPageError(detail);
      ui.error(detail);
      setAnnouncements([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
    const interval = setInterval(fetchItems, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (isSuperAdmin || isAdmin) {
      departmentAPI.list().then(r => setDepartments(r.data || []));
      employeeAPI.list().then(r => setEmployees(r.data || []));
    }
  }, [isSuperAdmin, isAdmin]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.title || !formData.body) return;
    setSubmitting(true);
    
    try {
      const payload = {
        title: formData.title,
        body: formData.body,
        priority: formData.priority,
        target_type: formData.target_type,
        target_ids: formData.target_type === 'ALL' ? [] : formData.target_ids,
        scheduled_at: formData.sendTiming === 'LATER' ? new Date(formData.scheduled_at).toISOString() : null
      };

      await announcementsAPI.create(payload);
      setFormData({
        title: '', body: '', priority: 'LOW',
        target_type: 'ALL', target_ids: [],
        sendTiming: 'NOW', scheduled_at: ''
      });
      fetchItems();
      ui.success('Announcement created!');
    } catch (err) {
      console.error(err);
      ui.error('Failed to create announcement.');
    } finally {
      setSubmitting(false);
    }
  };

  // Sort logic: CRITICAL first, then by date descending
  const sortedAnnouncements = [...announcements].sort((a, b) => {
    if (a.priority === 'CRITICAL' && b.priority !== 'CRITICAL') return -1;
    if (b.priority === 'CRITICAL' && a.priority !== 'CRITICAL') return 1;
    return new Date(b.created_at) - new Date(a.created_at);
  });

  const formatRelativeTime = (ts) => {
    if (!ts) return '';
    const diff = (Date.now() - new Date(ts).getTime()) / 1000;
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  return (
    <div className="page-wrapper" style={{ padding: '24px', maxWidth: '800px', margin: '0 auto' }}>
      <h1 className="header-title" style={{ marginBottom: '24px' }}>Announcements</h1>

      {pageError && <ErrorStateStandard message={pageError} onRetry={fetchItems} />}

      {/* ADMIN CREATION FORM */}
      {(isSuperAdmin || isAdmin) && (
        <div className="glass-card" style={{ padding: '24px', marginBottom: '32px' }}>
          <h3 style={{ marginBottom: '16px' }}>Create Announcement</h3>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            
            <div style={{ display: 'flex', gap: '16px' }}>
              <label style={{ flex: 2 }}>
                Title *
                <input type="text" className="form-input" style={{ width: '100%', marginTop: '8px' }} required value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} />
              </label>
              
              <label style={{ flex: 1 }}>
                Priority
                <select className="form-input" style={{ width: '100%', marginTop: '8px' }} value={formData.priority} onChange={e => setFormData({...formData, priority: e.target.value})}>
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="CRITICAL">Critical</option>
                </select>
              </label>
            </div>

            <label>
              Message Body *
              <textarea className="form-input" style={{ width: '100%', marginTop: '8px', height: '100px', resize: 'vertical' }} required value={formData.body} onChange={e => setFormData({...formData, body: e.target.value})} />
            </label>

            <div style={{ display: 'flex', gap: '32px' }}>
              <div style={{ flex: 1 }}>
                <strong>Notify Audience</strong>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                  {['ALL', 'DEPARTMENT', 'SELECTED'].map(t => (
                    <label key={t} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input type="radio" checked={formData.target_type === t} onChange={() => setFormData({...formData, target_type: t, target_ids: []})} />
                      {t === 'ALL' ? 'All Employees' : t === 'DEPARTMENT' ? 'By Department' : 'Select People'}
                    </label>
                  ))}
                  
                  {formData.target_type === 'DEPARTMENT' && (
                    <div style={{ marginLeft: '24px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {departments.map(d => (
                        <label key={d.department_id} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem' }}>
                          <input type="checkbox" checked={formData.target_ids.includes(d.department_id)} onChange={(e) => {
                            setFormData(f => ({...f, target_ids: e.target.checked ? [...f.target_ids, d.department_id] : f.target_ids.filter(id => id !== d.department_id)}));
                          }} />
                          {d.name}
                        </label>
                      ))}
                    </div>
                  )}

                  {formData.target_type === 'SELECTED' && (
                    <div style={{ marginLeft: '24px', display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '100px', overflowY: 'auto' }}>
                      {employees.map(e => (
                        <label key={e.employee_id} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem' }}>
                          <input type="checkbox" checked={formData.target_ids.includes(e.employee_id)} onChange={(ev) => {
                            setFormData(f => ({...f, target_ids: ev.target.checked ? [...f.target_ids, e.employee_id] : f.target_ids.filter(id => id !== e.employee_id)}));
                          }} />
                          {e.first_name} {e.last_name}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div style={{ flex: 1 }}>
                <strong>Send Timing</strong>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input type="radio" checked={formData.sendTiming === 'NOW'} onChange={() => setFormData({...formData, sendTiming: 'NOW'})} />
                    Send Now
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input type="radio" checked={formData.sendTiming === 'LATER'} onChange={() => setFormData({...formData, sendTiming: 'LATER'})} />
                    Schedule for Later
                  </label>
                  
                  {formData.sendTiming === 'LATER' && (
                    <input type="datetime-local" className="form-input" style={{ marginLeft: '24px', width: 'calc(100% - 24px)' }} required value={formData.scheduled_at} onChange={e => setFormData({...formData, scheduled_at: e.target.value})} />
                  )}
                </div>
              </div>
            </div>

            <div style={{ textAlign: 'right', marginTop: '8px' }}>
              <button type="submit" className="btn-primary" disabled={submitting}>{submitting ? 'Sending...' : 'Publish Announcement'}</button>
            </div>
          </form>
        </div>
      )}

      {/* FEED (ALL ROLES) */}
      <h3 style={{ marginBottom: '16px' }}>Recent Announcements</h3>
      {loading ? (
        <TableSkeleton rows={6} columns={3} label="Loading announcements..." />
      ) : sortedAnnouncements.length === 0 ? (
        <EmptyStateStandard
          icon="campaign"
          title="No announcements"
          message="There are no announcements to display right now."
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {sortedAnnouncements.map(ann => (
            <div key={ann.announcement_alert_id} className="glass-card" style={{ padding: '20px', borderLeft: `6px solid ${PRIORITY_COLORS[ann.priority] || PRIORITY_COLORS.LOW}` }}>
              
              {ann.priority === 'CRITICAL' && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'var(--danger)', color: 'white', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', marginBottom: '12px' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>push_pin</span> PINNED
                </div>
              )}

              <h4 style={{ fontSize: '1.1rem', marginBottom: '8px' }}>{ann.title}</h4>
              <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '16px', whiteSpace: 'pre-wrap' }}>{ann.body}</p>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                <span>Posted by {ann.creator?.full_name || 'Admin'}</span>
                
                <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                  {(isSuperAdmin || isAdmin) && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>visibility</span>
                      {ann.target_type === 'ALL' ? 'All Employees' : `${ann.target_ids.length} selected`}
                    </span>
                  )}
                  <span>{formatRelativeTime(ann.created_at)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
