/**
 * MyAttendancePage — Personal attendance view for employees.
 * Shows own attendance records with calendar and list views.
 */
import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { attendanceAPI } from '../services/api';

export default function MyAttendancePage() {
  const { user } = useAuth();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('list'); // 'list' or 'calendar'
  const [dateRange, setDateRange] = useState(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return {
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0],
    };
  });
  const [stats, setStats] = useState({
    present: 0,
    late: 0,
    absent: 0,
    totalHours: 0,
  });

  useEffect(() => {
    fetchAttendance();
  }, [dateRange, user]);

  const fetchAttendance = async () => {
    if (!user?.employee_id) return;
    
    setLoading(true);
    try {
      const res = await attendanceAPI.list({
        employee_id: user.employee_id,
        start_date: dateRange.start,
        end_date: dateRange.end,
      });
      
      const data = res.data || [];
      setRecords(data);
      
      // Calculate stats
      setStats({
        present: data.filter(r => r.status === 'PRESENT' || r.status === 'HALF_DAY').length,
        late: data.filter(r => r.is_late).length,
        absent: data.filter(r => r.status === 'ABSENT').length,
        totalHours: data.reduce((sum, r) => sum + ((r.total_time_in_building_min || 0) / 60), 0).toFixed(1),
      });
    } catch (err) {
      console.error('Failed to fetch attendance:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatTime = (timeStr) => {
    if (!timeStr) return '—';
    return new Date(timeStr).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'PRESENT': return 'var(--success)';
      case 'LATE': return 'var(--warning)';
      case 'ABSENT': return 'var(--error)';
      default: return 'var(--secondary)';
    }
  };

  const handleMonthChange = (direction) => {
    const start = new Date(dateRange.start);
    start.setMonth(start.getMonth() + direction);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
    setDateRange({
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0],
    });
  };

  const getMonthLabel = () => {
    const date = new Date(dateRange.start);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  return (
    <div className="page-container">
      {/* Page Header */}
      <header className="page-header-premium">
        <div className="page-header-content">
          <span className="page-header-chip">PERSONAL</span>
          <h1 className="page-title-premium">My Attendance</h1>
          <p className="page-subtitle-premium">View your attendance history and statistics</p>
        </div>
        <div className="page-header-actions">
          <div className="btn-group">
            <button 
              className={`btn-toggle ${view === 'list' ? 'btn-toggle--active' : ''}`}
              onClick={() => setView('list')}
            >
              <span className="material-symbols-outlined">view_list</span>
            </button>
            <button 
              className={`btn-toggle ${view === 'calendar' ? 'btn-toggle--active' : ''}`}
              onClick={() => setView('calendar')}
            >
              <span className="material-symbols-outlined">calendar_month</span>
            </button>
          </div>
        </div>
      </header>

      {/* Stats Row */}
      <div className="stats-row">
        <div className="mini-stat-card">
          <span className="mini-stat-icon" style={{ color: 'var(--success)' }}>
            <span className="material-symbols-outlined">check_circle</span>
          </span>
          <div className="mini-stat-content">
            <span className="mini-stat-value">{stats.present}</span>
            <span className="mini-stat-label">Present</span>
          </div>
        </div>
        
        <div className="mini-stat-card">
          <span className="mini-stat-icon" style={{ color: 'var(--warning)' }}>
            <span className="material-symbols-outlined">schedule</span>
          </span>
          <div className="mini-stat-content">
            <span className="mini-stat-value">{stats.late}</span>
            <span className="mini-stat-label">Late</span>
          </div>
        </div>
        
        <div className="mini-stat-card">
          <span className="mini-stat-icon" style={{ color: 'var(--error)' }}>
            <span className="material-symbols-outlined">cancel</span>
          </span>
          <div className="mini-stat-content">
            <span className="mini-stat-value">{stats.absent}</span>
            <span className="mini-stat-label">Absent</span>
          </div>
        </div>
        
        <div className="mini-stat-card">
          <span className="mini-stat-icon" style={{ color: 'var(--accent)' }}>
            <span className="material-symbols-outlined">timer</span>
          </span>
          <div className="mini-stat-content">
            <span className="mini-stat-value">{stats.totalHours}h</span>
            <span className="mini-stat-label">Hours Worked</span>
          </div>
        </div>
      </div>

      {/* Month Navigation */}
      <div className="month-nav">
        <button className="month-nav-btn" onClick={() => handleMonthChange(-1)}>
          <span className="material-symbols-outlined">chevron_left</span>
        </button>
        <span className="month-nav-label">{getMonthLabel()}</span>
        <button className="month-nav-btn" onClick={() => handleMonthChange(1)}>
          <span className="material-symbols-outlined">chevron_right</span>
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="table-loading">
          <div className="loading-spinner"></div>
          <span>Loading attendance...</span>
        </div>
      ) : records.length === 0 ? (
        <div className="empty-state">
          <span className="material-symbols-outlined">event_busy</span>
          <p>No attendance records for this period</p>
        </div>
      ) : (
        <div className="attendance-list glass-card">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Check In</th>
                <th>Check Out</th>
                <th>Hours</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr key={record.record_id}>
                  <td>{formatDate(record.date)}</td>
                  <td>{formatTime(record.first_entry)}</td>
                  <td>{formatTime(record.last_exit)}</td>
                  <td>{record.total_time_in_building_min ? `${(record.total_time_in_building_min / 60).toFixed(1)}h` : '—'}</td>
                  <td>
                    {(() => {
                      const displayStatus = record.status === 'ABSENT'
                        ? 'ABSENT'
                        : (record.is_late ? 'LATE' : 'PRESENT');
                      return (
                    <span 
                      className="status-badge"
                      style={{ 
                        background: `${getStatusColor(displayStatus)}20`,
                        color: getStatusColor(displayStatus),
                      }}
                    >
                      {displayStatus}
                    </span>
                      );
                    })()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
