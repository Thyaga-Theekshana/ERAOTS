import React, { useState, useEffect } from 'react';
import { meetingsAPI, employeeAPI, departmentAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function MeetingAlerts() {
  const { isSuperAdmin, isAdmin } = useAuth();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [meetings, setMeetings] = useState([]);
  
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    title: '', description: '', scheduled_at: '',
    reminder_minutes: [], target_type: 'ALL', target_ids: []
  });
  
  const [departments, setDepartments] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isSuperAdmin && !isAdmin) {
      navigate('/');
      return;
    }
    fetchItems();
    fetchLookups();
  }, [isSuperAdmin, isAdmin, navigate]);

  const fetchItems = async () => {
    try {
      const res = await meetingsAPI.list();
      setMeetings(res.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchLookups = async () => {
    try {
      const [deptRes, empRes] = await Promise.all([
        departmentAPI.list(),
        employeeAPI.list() // assuming no pagination limits or handles appropriately
      ]);
      setDepartments(deptRes.data || []);
      setEmployees(empRes.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  const handleReminderToggle = (min) => {
    setFormData(p => {
      const arr = p.reminder_minutes.includes(min) 
        ? p.reminder_minutes.filter(m => m !== min) 
        : [...p.reminder_minutes, min];
      return { ...p, reminder_minutes: arr };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.title || !formData.scheduled_at) {
      alert("Title and Time are required.");
      return;
    }
    setSubmitting(true);
    try {
      await meetingsAPI.create({
        ...formData,
        scheduled_at: new Date(formData.scheduled_at).toISOString(),
        participant_ids: formData.target_type === 'ALL' ? [] : formData.target_ids
      });
      setShowModal(false);
      setFormData({
        title: '', description: '', scheduled_at: '',
        reminder_minutes: [], target_type: 'ALL', target_ids: []
      });
      fetchItems();
    } catch (err) {
      console.error(err);
      alert("Failed to create meeting alert.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to cancel this meeting alert?")) return;
    try {
      await meetingsAPI.delete(id);
      fetchItems();
    } catch (err) {
      console.error(err);
    }
  };

  const getStatus = (meeting) => {
    if (!meeting.is_active) return <span style={{ color: 'var(--danger)', fontWeight: 600 }}>Cancelled</span>;
    const isPast = new Date(meeting.scheduled_at) < new Date();
    if (isPast) return <span style={{ color: 'var(--text-muted)' }}>Past</span>;
    return <span style={{ color: 'var(--success)', fontWeight: 600 }}>Upcoming</span>;
  };

  return (
    <div className="page-wrapper" style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 className="header-title">Meeting Alerts</h1>
        <button className="btn-primary" onClick={() => setShowModal(true)}>
          <span className="material-symbols-outlined">add</span> Create Meeting Alert
        </button>
      </div>

      {loading ? (
        <div className="skeleton" style={{ height: '300px' }}></div>
      ) : (
        <div className="glass-card" style={{ overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead style={{ background: 'rgba(255,255,255,0.05)' }}>
              <tr>
                <th style={{ padding: '16px' }}>Title</th>
                <th style={{ padding: '16px' }}>Date & Time</th>
                <th style={{ padding: '16px' }}>Participants</th>
                <th style={{ padding: '16px' }}>Reminders</th>
                <th style={{ padding: '16px' }}>Status</th>
                <th style={{ padding: '16px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {meetings.length === 0 ? (
                <tr><td colSpan="6" style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>No meeting alerts found.</td></tr>
              ) : meetings.map(m => (
                <tr key={m.meeting_alert_id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ padding: '16px', fontWeight: 500 }}>{m.title}</td>
                  <td style={{ padding: '16px' }}>{new Date(m.scheduled_at).toLocaleString()}</td>
                  <td style={{ padding: '16px' }}>{m.target_type === 'ALL' ? 'All Employees' : `${m.participant_ids?.length || 0} selected`}</td>
                  <td style={{ padding: '16px', color: 'var(--text-secondary)' }}>
                    {m.reminder_minutes.map(rem => (
                      rem === 1440 ? '1d, ' :
                      rem === 60 ? '1h, ' :
                      `${rem}m, `
                    ))}
                  </td>
                  <td style={{ padding: '16px' }}>{getStatus(m)}</td>
                  <td style={{ padding: '16px' }}>
                    {m.is_active && new Date(m.scheduled_at) > new Date() && (
                      <button className="btn-secondary" style={{ padding: '4px 8px', fontSize: '0.8rem', color: 'var(--danger)' }} onClick={() => handleDelete(m.meeting_alert_id)}>Cancel</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Overlay */}
      {showModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div className="glass-card" style={{ width: '500px', maxHeight: '90vh', overflowY: 'auto', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h3>Create Meeting Alert</h3>
              <button className="btn-icon" onClick={() => setShowModal(false)}><span className="material-symbols-outlined">close</span></button>
            </div>
            
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <label>
                Title *
                <input type="text" className="form-input" style={{ width: '100%', marginTop: '8px' }} required value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} />
              </label>

              <label>
                Description
                <textarea className="form-input" style={{ width: '100%', marginTop: '8px', height: '80px', resize: 'vertical' }} value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} />
              </label>

              <label>
                Date & Time *
                <input type="datetime-local" className="form-input" style={{ width: '100%', marginTop: '8px' }} required value={formData.scheduled_at} onChange={e => setFormData({...formData, scheduled_at: e.target.value})} />
              </label>

              <div>
                <strong>Reminder Times</strong>
                <div style={{ display: 'flex', gap: '16px', marginTop: '8px', flexWrap: 'wrap' }}>
                  {[ {l: '10 mins before', v: 10}, {l: '30 mins before', v: 30}, {l: '1 hour before', v: 60}, {l: '1 day before', v: 1440} ].map(r => (
                    <label key={r.v} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <input type="checkbox" checked={formData.reminder_minutes.includes(r.v)} onChange={() => handleReminderToggle(r.v)} />
                      {r.l}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <strong>Notify Audience</strong>
                <div style={{ display: 'flex', gap: '16px', marginTop: '8px' }}>
                  {['ALL', 'DEPARTMENT', 'SELECTED'].map(t => (
                    <label key={t} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <input type="radio" name="audience" checked={formData.target_type === t} onChange={() => setFormData({...formData, target_type: t, target_ids: []})} />
                      {t === 'ALL' ? 'All Employees' : t === 'DEPARTMENT' ? 'By Department' : 'Select People'}
                    </label>
                  ))}
                </div>
              </div>

              {formData.target_type === 'DEPARTMENT' && (
                <div style={{ background: 'rgba(255,255,255,0.05)', padding: '12px', borderRadius: '8px', maxHeight: '150px', overflowY: 'auto' }}>
                  {departments.map(d => (
                    <label key={d.department_id} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                      <input type="checkbox" checked={formData.target_ids.includes(d.department_id)} onChange={(e) => {
                        const newIds = e.target.checked 
                          ? [...formData.target_ids, d.department_id] 
                          : formData.target_ids.filter(id => id !== d.department_id);
                        setFormData({...formData, target_ids: newIds});
                      }} />
                      {d.name}
                    </label>
                  ))}
                </div>
              )}

              {formData.target_type === 'SELECTED' && (
                <div style={{ background: 'rgba(255,255,255,0.05)', padding: '12px', borderRadius: '8px', maxHeight: '150px', overflowY: 'auto' }}>
                  {employees.map(e => (
                    <label key={e.employee_id} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                      <input type="checkbox" checked={formData.target_ids.includes(e.employee_id)} onChange={(ev) => {
                        const newIds = ev.target.checked 
                          ? [...formData.target_ids, e.employee_id] 
                          : formData.target_ids.filter(id => id !== e.employee_id);
                        setFormData({...formData, target_ids: newIds});
                      }} />
                      {e.first_name} {e.last_name} <span style={{ color: 'var(--text-muted)' }}>({e.department_name})</span>
                    </label>
                  ))}
                </div>
              )}

              <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={submitting}>{submitting ? 'Creating...' : 'Create Alert'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
