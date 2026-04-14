import { useState, useEffect } from 'react';
import { attendanceAPI, eventsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';

/**
 * Time-breakdown bar for a single attendance record.
 * Shows the proportion of building time spent ACTIVE vs IN_MEETING vs ON_BREAK.
 */
function TimeBreakdownBar({ record }) {
  const building = record.total_time_in_building_min || 0;
  if (building === 0) return null;

  const active  = record.total_active_time_min   || 0;
  const meeting = record.total_meeting_time_min   || 0;
  const breakT  = record.total_break_duration_min || 0;
  const other   = Math.max(0, building - active - meeting - breakT);

  const pct = (val) => `${Math.round((val / building) * 100)}%`;

  return (
    <div style={{ width: '100%' }}>
      {/* Stacked bar */}
      <div style={{
        display: 'flex',
        height: '8px',
        borderRadius: '4px',
        overflow: 'hidden',
        background: 'var(--color-surface-elevated, #1e1e2e)',
        gap: '1px',
      }}>
        {active > 0 && (
          <div
            title={`Active (desk): ${toHours(active)}`}
            style={{ width: pct(active), background: '#22c55e', transition: 'width 0.3s' }}
          />
        )}
        {meeting > 0 && (
          <div
            title={`In Meeting: ${toHours(meeting)}`}
            style={{ width: pct(meeting), background: '#3b82f6', transition: 'width 0.3s' }}
          />
        )}
        {breakT > 0 && (
          <div
            title={`Break: ${toHours(breakT)}`}
            style={{ width: pct(breakT), background: '#f59e0b', transition: 'width 0.3s' }}
          />
        )}
        {other > 0 && (
          <div
            title={`Untracked: ${toHours(other)}`}
            style={{ width: pct(other), background: 'var(--color-border, #3a3a4e)', transition: 'width 0.3s' }}
          />
        )}
      </div>
      {/* Legend */}
      <div style={{ display: 'flex', gap: '8px', marginTop: '4px', fontSize: '10px', color: 'var(--color-text-muted, #888)', flexWrap: 'wrap' }}>
        {active > 0   && <span style={{ color: '#22c55e' }}>● Active {toHours(active)}</span>}
        {meeting > 0  && <span style={{ color: '#3b82f6' }}>● Meeting {toHours(meeting)}</span>}
        {breakT > 0   && <span style={{ color: '#f59e0b' }}>● Break {toHours(breakT)}</span>}
        {other > 0    && <span>● Untracked {toHours(other)}</span>}
      </div>
    </div>
  );
}

function toHours(minutes) {
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
}

export default function AttendancePage({ departmentScoped = false }) {
  const { user } = useAuth();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [targetDate, setTargetDate] = useState(new Date().toISOString().split('T')[0]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Status timeline drill-down state
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [timeline, setTimeline] = useState(null);
  const [timelineLoading, setTimelineLoading] = useState(false);

  const fetchRecords = async () => {
    try {
      setLoading(true);
      const params = { start_date: targetDate, end_date: targetDate };
      
      // If department scoped (manager view), filter by department
      if (departmentScoped && user?.managed_department_id) {
        params.department_id = user.managed_department_id;
      }
      
      const res = await attendanceAPI.list(params);
      setRecords(res.data);
    } catch (err) {
      console.error("Failed to fetch records", err);
      setError("Failed to fetch attendance data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecords();
    setSelectedRecord(null);
    setTimeline(null);
  }, [targetDate, departmentScoped, user?.managed_department_id]);

  const handleProcessEntry = async () => {
    try {
      setLoading(true);
      setError('');
      setSuccess('');
      const res = await attendanceAPI.process(targetDate);
      setSuccess(`Processed successfully. Rebuilt ${res.data.processed_records} records.`);
      fetchRecords();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to process attendance');
      setLoading(false);
    }
  };

  const handleRowClick = async (rec) => {
    if (selectedRecord?.record_id === rec.record_id) {
      setSelectedRecord(null);
      setTimeline(null);
      return;
    }
    setSelectedRecord(rec);
    setTimeline(null);
    setTimelineLoading(true);
    try {
      const res = await eventsAPI.statusTimeline(rec.employee_id, targetDate);
      setTimeline(res.data);
    } catch (err) {
      console.error('Failed to fetch timeline', err);
      setTimeline(null);
    } finally {
      setTimelineLoading(false);
    }
  };

  const handleExportCSV = () => {
    if (records.length === 0) return;

    const headers = [
      'Employee ID', 'Name', 'Date', 'First Entry', 'Last Exit',
      'Building Time (min)', 'Active Time (min)', 'Meeting Time (min)',
      'Break Time (min)', 'Productive Time (min)',
      'Late Duration (min)', 'Overtime (min)', 'Status'
    ];
    const csvRows = [headers.join(',')];

    records.forEach(rec => {
      const firstEntryTime = rec.first_entry ? new Date(rec.first_entry).toLocaleTimeString() : 'N/A';
      const lastExitTime = rec.last_exit ? new Date(rec.last_exit).toLocaleTimeString() : 'N/A';

      const values = [
        rec.employee_id,
        `"${rec.employee_name}"`,
        rec.date,
        firstEntryTime,
        lastExitTime,
        rec.total_time_in_building_min || 0,
        rec.total_active_time_min || 0,
        rec.total_meeting_time_min || 0,
        rec.total_break_duration_min || 0,
        rec.total_productive_time_min || 0,
        rec.late_duration_min || 0,
        rec.overtime_duration_min || 0,
        rec.status
      ];
      csvRows.push(values.join(','));
    });

    const csvContent = "data:text/csv;charset=utf-8," + csvRows.join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `ERAOTS_Attendance_${targetDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const total = records.length;
  const onTime = records.filter((rec) => !rec.is_late).length;
  const late = records.filter((rec) => rec.is_late).length;
  const avgActiveMinutes = total > 0
    ? Math.round(records.reduce((sum, rec) => sum + (rec.total_active_time_min || 0), 0) / total)
    : 0;

  const STATUS_COLORS = {
    ACTIVE:     '#22c55e',
    IN_MEETING: '#3b82f6',
    ON_BREAK:   '#f59e0b',
    AWAY:       '#f97316',
    OUTSIDE:    '#6b7280',
  };

  const formatTime = (isoStr) => {
    if (!isoStr) return '—';
    return new Date(isoStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="page-container">
      {/* Page Header */}
      <header className="page-header-premium">
        <div className="page-header-content">
          <span className="page-header-chip">DAILY OPERATIONS</span>
          <h1 className="page-title-premium">Attendance</h1>
          <p className="page-subtitle-premium">Daily verification, end-of-day processing, and export control</p>
        </div>
      </header>

      {/* Stats Row */}
      <div className="stats-row">
        <div className="stat-card-mini">
          <span className="stat-card-mini-label">Records</span>
          <span className="stat-card-mini-value">{total}</span>
        </div>
        <div className="stat-card-mini">
          <span className="stat-card-mini-label">On Time</span>
          <span className="stat-card-mini-value">{onTime}</span>
        </div>
        <div className="stat-card-mini">
          <span className="stat-card-mini-label">Late</span>
          <span className="stat-card-mini-value">{late}</span>
        </div>
        <div className="stat-card-mini stat-card-mini--accent">
          <span className="stat-card-mini-label">Avg Active</span>
          <span className="stat-card-mini-value">{toHours(avgActiveMinutes)}</span>
        </div>
      </div>

      {/* Toolbar */}
      <div className="toolbar-card">
        <div className="toolbar-left">
          <label className="toolbar-label">Target Date</label>
          <input
            type="date"
            className="toolbar-date-input"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
          />
        </div>
        <div className="toolbar-actions">
          <button className="btn btn-ghost" onClick={handleProcessEntry} disabled={loading}>
            <span className="material-symbols-outlined">sync</span>
            Process EOD
          </button>
          <button className="btn btn-primary" onClick={handleExportCSV} disabled={records.length === 0}>
            <span className="material-symbols-outlined">download</span>
            Export CSV
          </button>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="alert alert--error">
          <span className="material-symbols-outlined">error</span>
          {error}
          <button className="alert-dismiss" onClick={() => setError('')}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
      )}
      {success && (
        <div className="alert alert--success">
          <span className="material-symbols-outlined">check_circle</span>
          {success}
          <button className="alert-dismiss" onClick={() => setSuccess('')}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
      )}

      {/* Table Card */}
      <div className="table-card-premium">
        <div className="table-card-header">
          <div className="table-card-title-group">
            <span className="material-symbols-outlined table-card-icon">schedule</span>
            <div>
              <h2 className="table-card-title">Attendance Records</h2>
              <p className="table-card-subtitle">{targetDate} • {total} entries • Click a row to view time breakdown</p>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="table-loading">
            <div className="loading-spinner"></div>
            <span>Loading attendance records...</span>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="premium-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>First Entry</th>
                  <th>Last Exit</th>
                  <th>Building Time</th>
                  <th>Time Breakdown</th>
                  <th>Productive</th>
                  <th>Punctuality</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {records.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="table-empty">
                      <span className="material-symbols-outlined">event_busy</span>
                      <p>No attendance records for this date</p>
                      <span className="table-empty-hint">Run "Process EOD" to compute records from scan events</span>
                    </td>
                  </tr>
                ) : (
                  records.map(rec => (
                    <>
                      <tr
                        key={rec.record_id}
                        onClick={() => handleRowClick(rec)}
                        style={{
                          cursor: 'pointer',
                          background: selectedRecord?.record_id === rec.record_id
                            ? 'var(--color-surface-elevated, rgba(255,255,255,0.05))'
                            : undefined,
                        }}
                      >
                        <td>
                          <span className="table-cell-name">{rec.employee_name}</span>
                        </td>
                        <td>
                          <span className="table-cell-time">{formatTime(rec.first_entry)}</span>
                        </td>
                        <td>
                          <span className="table-cell-time">{formatTime(rec.last_exit)}</span>
                        </td>
                        <td>
                          <span className="table-cell-metric">
                            {toHours(rec.total_time_in_building_min || 0)}
                          </span>
                        </td>
                        <td style={{ minWidth: '160px' }}>
                          <TimeBreakdownBar record={rec} />
                        </td>
                        <td>
                          <span className="table-cell-metric" style={{ color: '#22c55e' }}>
                            {toHours(rec.total_productive_time_min ?? rec.total_active_time_min ?? 0)}
                          </span>
                        </td>
                        <td>
                          {rec.is_late ? (
                            <span className="punctuality-chip punctuality-chip--late">
                              +{rec.late_duration_min}m late
                            </span>
                          ) : (
                            <span className="punctuality-chip punctuality-chip--ontime">
                              On Time
                            </span>
                          )}
                        </td>
                        <td>
                          <span className="status-chip status-chip--active">{rec.status}</span>
                        </td>
                      </tr>

                      {/* Expanded timeline row */}
                      {selectedRecord?.record_id === rec.record_id && (
                        <tr key={`${rec.record_id}-timeline`}>
                          <td colSpan="8" style={{ padding: '0 16px 16px', background: 'var(--color-surface-elevated, rgba(255,255,255,0.03))' }}>
                            {timelineLoading ? (
                              <div style={{ padding: '12px 0', color: 'var(--color-text-muted)', fontSize: '13px' }}>
                                Loading status timeline…
                              </div>
                            ) : timeline ? (
                              <div style={{ paddingTop: '12px' }}>
                                <div style={{ display: 'flex', gap: '24px', marginBottom: '12px', flexWrap: 'wrap' }}>
                                  <div>
                                    <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>IN BUILDING</span>
                                    <div style={{ fontSize: '20px', fontWeight: 700 }}>{toHours(timeline.total_building_min)}</div>
                                  </div>
                                  <div>
                                    <span style={{ fontSize: '11px', color: '#22c55e' }}>ACTIVE (DESK)</span>
                                    <div style={{ fontSize: '20px', fontWeight: 700, color: '#22c55e' }}>{toHours(timeline.total_active_min)}</div>
                                  </div>
                                  <div>
                                    <span style={{ fontSize: '11px', color: '#3b82f6' }}>IN MEETINGS</span>
                                    <div style={{ fontSize: '20px', fontWeight: 700, color: '#3b82f6' }}>{toHours(timeline.total_meeting_min)}</div>
                                  </div>
                                  <div>
                                    <span style={{ fontSize: '11px', color: '#f59e0b' }}>ON BREAK</span>
                                    <div style={{ fontSize: '20px', fontWeight: 700, color: '#f59e0b' }}>{toHours(timeline.total_break_min)}</div>
                                  </div>
                                  <div>
                                    <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>PRODUCTIVE</span>
                                    <div style={{ fontSize: '20px', fontWeight: 700 }}>{toHours(timeline.total_productive_min)}</div>
                                  </div>
                                </div>

                                {/* Timeline segments */}
                                {timeline.segments.length > 0 ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    {timeline.segments.map((seg, idx) => (
                                      <div
                                        key={idx}
                                        style={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: '12px',
                                          padding: '6px 10px',
                                          borderRadius: '6px',
                                          background: 'var(--color-surface, rgba(255,255,255,0.02))',
                                          fontSize: '12px',
                                        }}
                                      >
                                        <span style={{
                                          width: '10px',
                                          height: '10px',
                                          borderRadius: '50%',
                                          background: STATUS_COLORS[seg.status] || '#6b7280',
                                          flexShrink: 0,
                                        }} />
                                        <span style={{ width: '90px', color: STATUS_COLORS[seg.status] || '#6b7280', fontWeight: 600 }}>
                                          {seg.status.replace('_', ' ')}
                                        </span>
                                        <span style={{ color: 'var(--color-text-muted)', width: '120px' }}>
                                          {formatTime(seg.from)} → {formatTime(seg.to)}
                                        </span>
                                        <span style={{ fontWeight: 500 }}>{toHours(seg.duration_min)}</span>
                                        <span style={{ color: 'var(--color-text-muted)', fontSize: '10px', marginLeft: 'auto' }}>
                                          via {seg.source}
                                          {seg.is_ongoing ? ' · ongoing' : ''}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <p style={{ color: 'var(--color-text-muted)', fontSize: '13px', margin: 0 }}>
                                    No detailed status log for this day. Run "Process EOD" to recompute.
                                  </p>
                                )}
                              </div>
                            ) : (
                              <p style={{ color: 'var(--color-text-muted)', fontSize: '13px', padding: '12px 0', margin: 0 }}>
                                No timeline data available.
                              </p>
                            )}
                          </td>
                        </tr>
                      )}
                    </>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

