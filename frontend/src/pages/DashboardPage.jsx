/**
 * Dashboard Page — FR3: Live real-time occupancy view.
 * Design System: Vigilant Glass (Bento Grid + Glassmorphism)
 * Premium redesign for 1 Billion Tech pitch
 * 
 * Role-based views:
 * - EMPLOYEE: Personal dashboard with own status, quick links
 * - MANAGER: Team overview with department stats
 * - HR_MANAGER/SUPER_ADMIN: Full system occupancy view
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { eventsAPI, attendanceAPI, createDashboardSocket, leaveAPI, productivityAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useUIFeedback } from '../context/UIFeedbackContext';
import NotificationAnalytics from '../components/notifications/NotificationAnalytics';

const isPlainObject = (value) => value && typeof value === 'object' && !Array.isArray(value);

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeOccupancy = (payload) => {
  if (!isPlainObject(payload)) {
    return {
      total_inside: 0,
      total_capacity: 200,
      active_count: 0,
      away_count: 0,
      on_break_count: 0,
    };
  }

  return {
    ...payload,
    total_inside: toNumber(payload.total_inside, 0),
    total_capacity: toNumber(payload.total_capacity, 200),
    active_count: toNumber(payload.active_count, 0),
    away_count: toNumber(payload.away_count, 0),
    on_break_count: toNumber(payload.on_break_count, 0),
  };
};

export default function DashboardPage() {
  const navigate = useNavigate();
  const ui = useUIFeedback();
  const { user, isEmployee, isManager, isAdmin, isSuperAdmin } = useAuth();
  const [occupancy, setOccupancy] = useState(null);
  const [recentEvents, setRecentEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState('');
  
  // Status override state
  const [myStatus, setMyStatus] = useState(null);
  const [statusLoading, setStatusLoading] = useState(false);
  
  // Personal stats for employee view
  const [personalStats, setPersonalStats] = useState({
    presentToday: false,
    checkInTime: null,
    pendingLeaves: 0,
    pendingCorrections: 0,
  });
  
  // Pending transitions state
  const [pendingTransitions, setPendingTransitions] = useState([]);
  const [transitionLoading, setTransitionLoading] = useState(false);
  
  // Productivity Stats
  const [prodStats, setProdStats] = useState(null);

  const refreshOccupancy = useCallback(async () => {
    try {
      const res = await eventsAPI.occupancy();
      setOccupancy(normalizeOccupancy(res.data));
    } catch (err) {
      console.error('Failed to refresh occupancy:', err);
    }
  }, []);

  const fetchMyStatus = useCallback(async () => {
    if (!user?.employee_id) return;
    try {
      const res = await eventsAPI.employeeStates();
      const records = Array.isArray(res.data) ? res.data : [];
      const myRecord = records.find(e => e.employee_id === user.employee_id);
      if (myRecord) {
        setMyStatus(myRecord.current_status);
      }
    } catch (err) {
      console.error('Failed to fetch my status:', err);
    }
  }, [user?.employee_id]);

  const fetchPendingTransitions = useCallback(async () => {
    try {
      const res = await eventsAPI.getPendingTransitions();
      setPendingTransitions(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      // Endpoint may not exist or return empty - that's OK
      setPendingTransitions([]);
    }
  }, []);

  // Fetch initial data
  useEffect(() => {
    const fetchData = async () => {
      try {
        setPageError('');
        // All users fetch their own status
        await fetchMyStatus();
        
        // Admin/Manager fetch full occupancy data
        if (isAdmin || isSuperAdmin || isManager) {
          const [occRes, eventsRes] = await Promise.all([
            eventsAPI.occupancy(),
            eventsAPI.recent(20),
          ]);
          setOccupancy(normalizeOccupancy(occRes.data));
          setRecentEvents(Array.isArray(eventsRes.data) ? eventsRes.data : []);
          await fetchPendingTransitions();
        }
        
        // Fetch personal stats for employees
        if (isEmployee || isManager) {
          try {
            const leaveRes = await leaveAPI.myRequests();
            const leaveRequests = Array.isArray(leaveRes.data) ? leaveRes.data : [];
            const pendingLeaves = leaveRequests.filter(l => l.status === 'PENDING').length;
            setPersonalStats(prev => ({ ...prev, pendingLeaves }));
            
            const prodRes = await productivityAPI.getMyStats();
            setProdStats(isPlainObject(prodRes.data) ? prodRes.data : null);
          } catch (e) {
            // Endpoints may not be available
          }
        }
        
        if (isAdmin || isSuperAdmin || isManager) {
          try {
            const teamProdRes = await productivityAPI.getTeamStats();
            setProdStats(isPlainObject(teamProdRes.data) ? teamProdRes.data : null);
          } catch(e) {}
        }
      } catch (err) {
        console.error('Failed to fetch dashboard data:', err);
        const detail = err.response?.data?.detail || 'Failed to load dashboard data.';
        setPageError(detail);
        ui.error(detail);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [fetchMyStatus, fetchPendingTransitions, isAdmin, isSuperAdmin, isManager, isEmployee]);

  // WebSocket for real-time updates
  useEffect(() => {
    const ws = createDashboardSocket((data) => {
      if (data.type === 'SCAN_EVENT') {
        setRecentEvents((prev) => [{
          event_id: Date.now(),
          employee_name: data.employee_name,
          direction: data.direction,
          door_name: data.door,
          scan_timestamp: data.timestamp,
          is_valid: true,
        }, ...prev.slice(0, 49)]);
        refreshOccupancy();
        fetchMyStatus();
      }
      if (data.type === 'STATUS_CHANGE' || data.type === 'PENDING_TRANSITION') {
        fetchMyStatus();
        fetchPendingTransitions();
      }
    });
    return () => ws.close();
  }, [fetchMyStatus, fetchPendingTransitions, refreshOccupancy]);

  // Handle status override (toggle between ACTIVE and IN_MEETING)
  const handleStatusToggle = async () => {
    if (statusLoading || !myStatus || myStatus === 'OUTSIDE') return;
    
    const newStatus = myStatus === 'ACTIVE' ? 'IN_MEETING' : 'ACTIVE';
    setStatusLoading(true);
    try {
      await eventsAPI.statusOverride(newStatus);
      setMyStatus(newStatus);
      refreshOccupancy();
    } catch (err) {
      console.error('Status override failed:', err);
      ui.error(err.response?.data?.detail || 'Failed to update status');
    } finally {
      setStatusLoading(false);
    }
  };

  // Handle pending transition confirm/cancel
  const handleTransitionAction = async (transitionId, action) => {
    setTransitionLoading(true);
    try {
      if (action === 'confirm') {
        await eventsAPI.confirmTransition(transitionId);
      } else {
        await eventsAPI.cancelTransition(transitionId);
      }
      await fetchPendingTransitions();
      await fetchMyStatus();
      refreshOccupancy();
    } catch (err) {
      console.error('Transition action failed:', err);
    } finally {
      setTransitionLoading(false);
    }
  };

  const formatTime = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  const formatRelativeTime = (ts) => {
    if (!ts) return '';
    const diff = (Date.now() - new Date(ts).getTime()) / 1000;
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return formatTime(ts);
  };

  // Export full report as CSV
  const handleExportReport = async () => {
    try {
      const res = await attendanceAPI.list();
      const records = Array.isArray(res.data) ? res.data : [];
      
      if (records.length === 0) {
        ui.warning('No attendance records to export');
        return;
      }

      const headers = ['Date', 'Employee', 'First Entry', 'Last Exit', 'Active Time (min)', 'Late', 'Late Duration (min)', 'Status', 'Overtime (min)'];
      const csvContent = [
        headers.join(','),
        ...records.map(r => [
          r.date,
          `"${r.employee_name}"`,
          r.first_entry || '',
          r.last_exit || '',
          r.total_active_time_min || 0,
          r.is_late ? 'Yes' : 'No',
          r.late_duration_min || 0,
          r.status,
          r.overtime_duration_min || 0
        ].join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `eraots_full_report_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
    } catch (err) {
      console.error('Export failed:', err);
      ui.error('Failed to export report');
    }
  };

  if (loading) {
    return (
      <div className="dashboard-loading">
        <div className="dashboard-loading-spinner" />
        <span className="dashboard-loading-text">Initializing Dashboard</span>
      </div>
    );
  }

  const totalInside = occupancy?.total_inside ?? 0;
  const capacity = occupancy?.total_capacity ?? 200;
  const percentage = capacity > 0 ? Math.round((totalInside / capacity) * 100) : 0;
  const stats = [
    {
      label: 'Active In',
      value: occupancy?.active_count ?? 0,
      trend: '+6.2%',
      icon: 'door_open',
    },
    {
      label: 'Out Office',
      value: occupancy?.away_count ?? 0,
      trend: '-1.4%',
      icon: 'flight_takeoff',
    },
    {
      label: 'On Break',
      value: occupancy?.on_break_count ?? 0,
      trend: '+0.8%',
      icon: 'coffee',
    },
  ];

  const errorBanner = pageError ? (
    <div className="alert-banner alert-banner--error">
      <span className="material-symbols-outlined">error</span>
      <span>{pageError}</span>
    </div>
  ) : null;

  // Employee Personal Dashboard
  if (isEmployee && !isAdmin && !isSuperAdmin) {
    return (
      <div className="dashboard">
        {/* Page Header */}
        <div className="dashboard-header">
          <div className="dashboard-header-content">
            <h1 className="dashboard-title">Welcome, {user?.full_name?.split(' ')[0]}</h1>
            <p className="dashboard-subtitle">Your personal attendance dashboard</p>
          </div>
        </div>

        {errorBanner}

        {/* Personal Status Card */}
        <div className="dashboard-personal-grid">
          <div className="dashboard-card glass-card">
            <div className="dashboard-card-header">
              <span className="dashboard-card-title">My Status</span>
              <span className="material-symbols-outlined" style={{ color: 'var(--primary)' }}>person</span>
            </div>
            <div className="dashboard-status-display">
              <div className={`status-indicator status-indicator--${myStatus?.toLowerCase() || 'outside'}`}>
                <span className="material-symbols-outlined">
                  {myStatus === 'ACTIVE' ? 'check_circle' : 
                   myStatus === 'IN_MEETING' ? 'event' : 
                   myStatus === 'ON_BREAK' ? 'coffee' : 'logout'}
                </span>
                <span>{myStatus || 'Outside'}</span>
              </div>
              {myStatus && myStatus !== 'OUTSIDE' && (
                <button 
                  className="btn-secondary"
                  onClick={handleStatusToggle}
                  disabled={statusLoading}
                >
                  <span className="material-symbols-outlined">sync</span>
                  Toggle Status
                </button>
              )}
            </div>
          </div>

          <div className="dashboard-card glass-card">
            <div className="dashboard-card-header">
              <span className="dashboard-card-title">Quick Stats</span>
              <span className="material-symbols-outlined" style={{ color: 'var(--success)' }}>insights</span>
            </div>
            <div className="dashboard-quick-stats">
              <div className="quick-stat">
                <span className="quick-stat-value">{personalStats.pendingLeaves}</span>
                <span className="quick-stat-label">Pending Leave Requests</span>
              </div>
              <div className="quick-stat">
                <span className="quick-stat-value">{personalStats.pendingCorrections}</span>
                <span className="quick-stat-label">Pending Corrections</span>
              </div>
            </div>
          </div>

          {/* Productivity Stats (Phase 3) */}
          <div className="dashboard-card glass-card">
            <div className="dashboard-card-header">
              <span className="dashboard-card-title">Productivity (Today)</span>
              <span className="material-symbols-outlined" style={{ color: 'var(--primary)' }}>monitoring</span>
            </div>
            <div className="dashboard-quick-stats">
              <div className="quick-stat">
                <span className="quick-stat-value" style={{ color: prodStats?.efficiency_percentage >= 70 ? 'var(--success)' : 'inherit' }}>
                  {prodStats?.efficiency_percentage || 0}%
                </span>
                <span className="quick-stat-label">Efficiency Ratio</span>
              </div>
              <div className="quick-stat">
                <span className="quick-stat-value">{prodStats?.tickets_resolved_count || 0}</span>
                <span className="quick-stat-label">Jira Tickets Done</span>
              </div>
            </div>
            {prodStats?.status === 'No data yet for today' ? (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textAlign: 'center', marginTop: '10px' }}>No JIRA records yet today.</div>
            ) : null}
          </div>

          <div className="dashboard-card glass-card">
            <div className="dashboard-card-header">
              <span className="dashboard-card-title">Quick Actions</span>
              <span className="material-symbols-outlined" style={{ color: 'var(--accent)' }}>bolt</span>
            </div>
            <div className="dashboard-quick-actions">
              <button className="quick-action-btn" onClick={() => navigate('/my-attendance')}>
                <span className="material-symbols-outlined">event_available</span>
                View Attendance
              </button>
              <button className="quick-action-btn" onClick={() => navigate('/my-schedule')}>
                <span className="material-symbols-outlined">calendar_month</span>
                View Schedule
              </button>
              <button className="quick-action-btn" onClick={() => navigate('/corrections')}>
                <span className="material-symbols-outlined">edit_note</span>
                Request Correction
              </button>
              <button className="quick-action-btn" onClick={() => navigate('/my-profile')}>
                <span className="material-symbols-outlined">settings</span>
                My Profile
              </button>
            </div>
          </div>

          <div className="dashboard-card glass-card">
            <div className="dashboard-card-header">
              <span className="dashboard-card-title">My Info</span>
              <span className="material-symbols-outlined" style={{ color: 'var(--secondary)' }}>info</span>
            </div>
            <div className="dashboard-info-list">
              <div className="info-row">
                <span className="info-label">Department</span>
                <span className="info-value">{user?.department || 'Not assigned'}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Email</span>
                <span className="info-value">{user?.email}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Role</span>
                <span className="info-value">{user?.role?.replace('_', ' ')}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Manager/Admin Dashboard (full view)

  return (
    <div className="dashboard">
      {/* Pending Transitions Alert */}
      {pendingTransitions.length > 0 && (
        <div className="dashboard-alert">
          <div className="dashboard-alert-icon">
            <span className="material-symbols-outlined">event</span>
          </div>
          <div className="dashboard-alert-content">
            <span className="dashboard-alert-title">Meeting Transition Pending</span>
            <span className="dashboard-alert-text">
              {pendingTransitions[0]?.seconds_remaining > 0 
                ? `Auto-confirming in ${pendingTransitions[0].seconds_remaining}s`
                : 'Confirm or cancel your status change'}
            </span>
          </div>
          <div className="dashboard-alert-actions">
            <button 
              className="dashboard-alert-btn dashboard-alert-btn--cancel"
              onClick={() => handleTransitionAction(pendingTransitions[0].transition_id, 'cancel')}
              disabled={transitionLoading}
            >
              Cancel
            </button>
            <button 
              className="dashboard-alert-btn dashboard-alert-btn--confirm"
              onClick={() => handleTransitionAction(pendingTransitions[0].transition_id, 'confirm')}
              disabled={transitionLoading}
            >
              Confirm
            </button>
          </div>
        </div>
      )}

      {/* Page Header */}
      <div className="dashboard-header">
        <div className="dashboard-header-content">
          <h1 className="dashboard-title">Command Center</h1>
          <p className="dashboard-subtitle">Live occupancy telemetry with vigilant-glass intelligence.</p>
        </div>
        <div className="dashboard-header-right">
          {/* My Status Toggle */}
          {myStatus && myStatus !== 'OUTSIDE' && (
            <div className="dashboard-status-toggle">
              <span className="dashboard-status-label">My Status:</span>
              <button 
                className={`dashboard-status-btn ${myStatus === 'ACTIVE' ? 'dashboard-status-btn--active' : ''}`}
                onClick={handleStatusToggle}
                disabled={statusLoading || myStatus === 'IN_MEETING'}
              >
                Active
              </button>
              <button 
                className={`dashboard-status-btn ${myStatus === 'IN_MEETING' ? 'dashboard-status-btn--meeting' : ''}`}
                onClick={handleStatusToggle}
                disabled={statusLoading || myStatus === 'ACTIVE'}
              >
                In Meeting
              </button>
            </div>
          )}
          <div className="dashboard-live-badge">
            <span className="dashboard-live-dot" />
            <span className="dashboard-live-text">Live Updates</span>
          </div>
        </div>
      </div>

      {errorBanner}

      {/* Bento Grid Layout */}
      <div className="bento-grid">
        {/* Status Stats Row */}
        <div className="bento-stats-row">
          {stats.map((stat) => (
            <div className="bento-stat-card" key={stat.label}>
              <div className="bento-stat-top">
                <span className="material-symbols-outlined bento-stat-icon">{stat.icon}</span>
                <span className="bento-stat-trend">{stat.trend}</span>
              </div>
              <span className="bento-stat-label">{stat.label}</span>
              <span className="bento-stat-value">{stat.value}</span>
            </div>
          ))}
        </div>

        {/* Featured Card */}
        <div className="bento-featured-card">
          <div className="bento-featured-icon">
            <div className="bento-featured-ring">
              <svg viewBox="0 0 100 100">
                <circle 
                  cx="50" cy="50" r="45" 
                  fill="none" 
                  stroke="currentColor" 
                  strokeWidth="6" 
                  opacity="0.1"
                />
                <circle 
                  cx="50" cy="50" r="45" 
                  fill="none" 
                  stroke="var(--primary)" 
                  strokeWidth="6" 
                  strokeLinecap="round"
                  strokeDasharray={`${percentage * 2.83} 283`}
                  transform="rotate(-90 50 50)"
                  style={{ transition: 'stroke-dasharray 0.5s ease' }}
                />
              </svg>
              <span className="bento-featured-ring-value">{percentage}%</span>
            </div>
          </div>
          <div className="bento-featured-content">
            <span className="bento-featured-label">Total Occupancy</span>
            <h3 className="bento-featured-title">{totalInside} Personnel</h3>
            <p className="bento-featured-subtitle">of {capacity} total capacity</p>
          </div>
          <div className="bento-featured-action">
            <span className="material-symbols-outlined">chevron_right</span>
          </div>
        </div>

        {/* Main Grid - Map and Events */}
        <div className="bento-main-grid">
          {/* Floor Occupancy Card */}
          <div className="bento-map-card">
            <div className="bento-map-header">
              <h3 className="bento-map-title">Floor Occupancy</h3>
              <span className="bento-map-subtitle">East Wing • Surveillance v2.1</span>
            </div>
            <div className="bento-map-visual">
              <div className="bento-map-dots">
                <div className="bento-map-dot bento-map-dot--active" style={{ top: '25%', left: '33%' }} />
                <div className="bento-map-dot bento-map-dot--active" style={{ top: '50%', left: '50%' }} />
                <div className="bento-map-dot bento-map-dot--active" style={{ top: '66%', right: '25%' }} />
                <div className="bento-map-dot bento-map-dot--inactive" style={{ top: '40%', left: '20%' }} />
              </div>
            </div>
            <div className="bento-map-footer">
              <span className="bento-map-zone">Lobby <b>{Math.floor(totalInside * 0.06)}</b></span>
              <span className="bento-map-zone">Cafe <b>{Math.floor(totalInside * 0.19)}</b></span>
              <span className="bento-map-zone">Desks <b>{Math.floor(totalInside * 0.75)}</b></span>
            </div>
          </div>

          {/* Live Events Card */}
          <div className="bento-events-card">
            <div className="bento-events-header">
              <h3 className="bento-events-title">Live Events</h3>
              <span className="bento-events-badge">Feed Active</span>
            </div>
            <div className="bento-events-list">
              {recentEvents.length === 0 ? (
                <div className="bento-events-empty">
                  <span className="material-symbols-outlined">sensors_off</span>
                  <span>No scan events yet</span>
                  <span className="bento-events-empty-hint">Start the simulator to see live data</span>
                </div>
              ) : (
                recentEvents.slice(0, 6).map((event, idx) => (
                  <div key={event.event_id || idx} className="bento-event-item">
                    <div className="bento-event-avatar">
                      {event.employee_name?.charAt(0)?.toUpperCase() || '?'}
                    </div>
                    <div className="bento-event-content">
                      <span className="bento-event-name">{event.employee_name || 'Unknown'}</span>
                      <span className="bento-event-action">
                          {(event.direction === 'IN' ? 'Clocked In' : 'Clocked Out')}
                          {' • '}
                          {event.door_name || 'Door Unknown'}
                          {' • '}
                          {formatRelativeTime(event.scan_timestamp)}
                      </span>
                    </div>
                    <div className={`bento-event-dot ${event.direction === 'IN' ? 'bento-event-dot--in' : 'bento-event-dot--out'}`} />
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Productivity Stats Card (Jira Phase 3) */}
        <div className="bento-events-card" style={{ gridColumn: 'span 12', marginTop: '1rem' }}>
          <div className="bento-events-header">
            <h3 className="bento-events-title">Team Productivity</h3>
            <span className="bento-events-badge">JIRA Sync Active</span>
          </div>
          <div style={{ padding: '0 20px 20px 20px', display: 'flex', gap: '40px', alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Avg Efficiency:</span>
              <span style={{ fontSize: '1.4rem', fontWeight: 600, color: prodStats?.avg_efficiency_percentage >= 70 ? 'var(--success)' : 'var(--warning)' }}>
                  {prodStats?.avg_efficiency_percentage || 0}%
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Tickets Resolved Today:</span>
              <span style={{ fontSize: '1.4rem', fontWeight: 600 }}>
                  {prodStats?.total_tickets_resolved || 0}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Tracked Employees:</span>
              <span style={{ fontSize: '1.4rem', fontWeight: 600 }}>
                  {prodStats?.tracked_employees || 0}
              </span>
            </div>
          </div>
        </div>

        {/* Notification Analytics Widget */}
        <NotificationAnalytics />

        {/* Team Engagement Bar */}
        <div className="bento-engagement-card">
          <div className="bento-engagement-avatars">
            <div className="bento-engagement-avatar">JD</div>
            <div className="bento-engagement-avatar">MK</div>
            <div className="bento-engagement-avatar bento-engagement-avatar--count">+{Math.max(0, totalInside - 2)}</div>
          </div>
          <div className="bento-engagement-content">
            <span className="bento-engagement-title">Team Engagement: {percentage >= 70 ? 'OPTIMAL' : percentage >= 40 ? 'MODERATE' : 'LOW'}</span>
            <span className="bento-engagement-subtitle">{totalInside} personnel active on floor</span>
          </div>
          <div className="bento-engagement-actions">
            <button className="bento-btn bento-btn--ghost" onClick={() => navigate('/analytics')}>
              <span className="material-symbols-outlined" style={{ fontSize: '18px', marginRight: '6px' }}>monitoring</span>
              View Analytics
            </button>
            <button className="bento-btn bento-btn--primary" onClick={handleExportReport}>
              <span className="material-symbols-outlined" style={{ fontSize: '18px', marginRight: '6px' }}>download</span>
              Export Report
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
