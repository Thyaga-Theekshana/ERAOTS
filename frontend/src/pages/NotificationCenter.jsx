import React, { useState, useEffect } from 'react';
import { notificationsAPI } from '../services/api';
import '../components/notifications/Notifications.css';

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

const ALL_TYPES = Object.keys(TYPE_ICONS).filter(t => t !== 'DEFAULT');

export default function NotificationCenter() {
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState([]);
  const [totalCount, setTotalCount] = useState(0);

  // Filters
  const [types, setTypes] = useState(ALL_TYPES);
  const [priority, setPriority] = useState('ALL');
  const [status, setStatus] = useState('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Bulk actions
  const [selectedIds, setSelectedIds] = useState(new Set());

  // Pagination
  const [page, setPage] = useState(1);
  const LIMIT = 20;

  const fetchItems = async () => {
    setLoading(true);
    try {
      // Mock converting these to actual query params depending on backend support
      // Fallback is we do some client side filtering until the backend route is deeply wired
      const isReadParam = status === 'ALL' ? undefined : status === 'READ';
      
      const res = await notificationsAPI.list({
        limit: LIMIT,
        offset: (page - 1) * LIMIT,
        is_read: isReadParam
      });
      
      // Client-side mapping & rough filter for mock missing backend filtering rules
      let data = res.data.items || [];
      if (priority !== 'ALL') {
        data = data.filter(d => d.priority === priority);
      }
      if (types.length !== ALL_TYPES.length) {
        data = data.filter(d => types.includes(d.triggered_by));
      }

      setNotifications(data);
      setTotalCount(res.data.total || 0);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, [page]); // usually you'd trigger on filter apply, not instantly unless UX desires

  const handleApplyFilters = () => {
    setPage(1);
    fetchItems();
  };

  const handleClearFilters = () => {
    setTypes(ALL_TYPES);
    setPriority('ALL');
    setStatus('ALL');
    setDateFrom('');
    setDateTo('');
    setPage(1);
    // setTimeout to allow state to settle
    setTimeout(fetchItems, 50);
  };

  const handleTypeCheck = (type) => {
    setTypes(prev => prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]);
  };

  const handleMarkRead = async (id) => {
    try {
      await notificationsAPI.markRead(id);
      setNotifications(prev => prev.map(n => n.log_id === id ? { ...n, read_at: new Date().toISOString() } : n));
    } catch (error) {
      console.error(error);
    }
  };

  const handleBulkMarkRead = async () => {
    // If backend supports bulk ID read, call it. Otherwise markAllRead is a good fallback for demo.
    try {
      await notificationsAPI.markAllRead(); // marks everything unread as read (simplification)
      fetchItems();
      setSelectedIds(new Set());
    } catch (error) {
      console.error(error);
    }
  };

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedIds(new Set(notifications.map(n => n.log_id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelect = (id) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  return (
    <div className="page-wrapper" style={{ display: 'flex', gap: '24px', padding: '24px' }}>
      
      {/* LEFT SIDEBAR (Filters) */}
      <div className="glass-card" style={{ width: '280px', padding: '24px', flexShrink: 0, height: 'fit-content' }}>
        <h3 style={{ marginBottom: '20px' }}>Filters</h3>
        
        <div style={{ marginBottom: '20px' }}>
          <strong>Status</strong>
          <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {['ALL', 'UNREAD', 'READ'].map(val => (
              <label key={val} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input type="radio" name="status" checked={status === val} onChange={() => setStatus(val)} />
                {val.charAt(0) + val.slice(1).toLowerCase()}
              </label>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <strong>Priority</strong>
          <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map(val => (
              <label key={val} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input type="radio" name="priority" checked={priority === val} onChange={() => setPriority(val)} />
                {val.charAt(0) + val.slice(1).toLowerCase()}
              </label>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <strong>Alert Type</strong>
          <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '150px', overflowY: 'auto' }}>
            {ALL_TYPES.map(type => (
              <label key={type} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input type="checkbox" checked={types.includes(type)} onChange={() => handleTypeCheck(type)} />
                {type.replace('_', ' ')}
              </label>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <strong>Date Range</strong>
          <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <input type="date" className="filter-input" placeholder="From" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
            <input type="date" className="filter-input" placeholder="To" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          </div>
        </div>

        <button className="btn-primary" style={{ width: '100%', marginBottom: '10px' }} onClick={handleApplyFilters}>Apply Filters</button>
        <button className="btn-secondary" style={{ width: '100%' }} onClick={handleClearFilters}>Clear Filters</button>
      </div>

      {/* MAIN CONTENT */}
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h2>Notifications <span style={{ color: 'var(--text-muted)', fontSize: '1rem' }}>({totalCount})</span></h2>
          
          {selectedIds.size > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', background: 'var(--primary)', color: 'white', padding: '8px 16px', borderRadius: '8px' }}>
              <span>{selectedIds.size} selected</span>
              <button 
                onClick={handleBulkMarkRead} 
                style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: 'none', padding: '4px 12px', borderRadius: '4px', cursor: 'pointer' }}
              >
                Mark as read
              </button>
            </div>
          )}
        </div>

        {loading ? (
          <div className="skeleton" style={{ height: '200px', borderRadius: '12px' }}></div>
        ) : notifications.length === 0 ? (
          <div className="glass-card" style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.5 }}>notifications_paused</span>
            <p>No notifications match your filters.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ padding: '0 16px', display: 'flex', gap: '16px' }}>
               <input type="checkbox" onChange={handleSelectAll} checked={notifications.length > 0 && selectedIds.size === notifications.length} /> Select All
            </div>
            {notifications.map(notif => {
              const isUnread = !notif.read_at;
              const color = PRIORITY_COLORS[notif.priority];
              return (
                <div 
                  key={notif.log_id} 
                  className={`glass-card ${isUnread ? 'unread-bg' : ''}`}
                  style={{ 
                    display: 'flex', gap: '16px', padding: '16px', 
                    borderLeft: `4px solid ${color}`,
                    alignItems: 'center',
                    background: isUnread ? 'rgba(255,255,255,0.03)' : 'var(--bg-card)'
                  }}
                  onClick={() => {
                    if (isUnread) handleMarkRead(notif.log_id);
                  }}
                >
                  <input 
                    type="checkbox" 
                    checked={selectedIds.has(notif.log_id)} 
                    onChange={() => handleSelect(notif.log_id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  
                  <div style={{ color }}>
                    <span className="material-symbols-outlined">{TYPE_ICONS[notif.triggered_by] || TYPE_ICONS.DEFAULT}</span>
                  </div>

                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <div style={{ fontWeight: isUnread ? 700 : 500 }}>
                        {notif.title}
                        <span style={{ marginLeft: '12px', fontSize: '0.75rem', background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: '4px' }}>
                          {notif.priority}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {new Date(notif.sent_at).toLocaleString()}
                      </div>
                    </div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.5 }}>
                      {notif.body}
                    </div>
                    <div style={{ marginTop: '8px', display: 'flex', gap: '8px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
                        {notif.channel === 'in_app' ? 'notifications' : notif.channel === 'email' ? 'mail' : 'chat'}
                      </span>
                      Sent via {notif.channel}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Pagination Controls */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', marginTop: '20px' }}>
              <button className="btn-secondary" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Prev</button>
              <span style={{ display: 'flex', alignItems: 'center' }}>Page {page}</span>
              <button className="btn-secondary" disabled={notifications.length < LIMIT} onClick={() => setPage(p => p + 1)}>Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
