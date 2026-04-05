import { useState, useEffect } from 'react';
import { attendanceAPI } from '../services/api';

export default function AttendancePage() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [targetDate, setTargetDate] = useState(new Date().toISOString().split('T')[0]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchRecords = async () => {
    try {
      setLoading(true);
      const res = await attendanceAPI.list({ start_date: targetDate, end_date: targetDate });
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
  }, [targetDate]);

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

  const handleExportCSV = () => {
    if (records.length === 0) return;
    
    // Convert to CSV
    const headers = ['Employee ID', 'Name', 'Date', 'First Entry', 'Last Exit', 'Active Target (min)', 'Late Duration (min)', 'Overtime (min)', 'Status'];
    const csvRows = [headers.join(',')];
    
    records.forEach(rec => {
      const firstEntryTime = rec.first_entry ? new Date(rec.first_entry).toLocaleTimeString() : 'N/A';
      const lastExitTime = rec.last_exit ? new Date(rec.last_exit).toLocaleTimeString() : 'N/A';
      
      const values = [
        rec.employee_id,
        `"${rec.employee_name}"`, // Quote strings that might contain spaces
        rec.date,
        firstEntryTime,
        lastExitTime,
        rec.total_active_time_min,
        rec.late_duration_min,
        rec.overtime_duration_min,
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

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Attendance Reports</h1>
          <p className="page-subtitle">View daily attendance, process raw events, and export records.</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <input 
            type="date"
            className="form-input"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
          />
          <button className="btn btn-ghost" onClick={handleProcessEntry} disabled={loading}>
            Process EOD
          </button>
          <button className="btn btn-primary" onClick={handleExportCSV} disabled={records.length === 0}>
            Export CSV
          </button>
        </div>
      </div>

      {error && <div style={{ color: 'var(--danger)', marginBottom: '1rem', padding: '1rem', backgroundColor: '#311014', borderRadius: '0.5rem' }}>{error}</div>}
      {success && <div style={{ color: 'var(--success)', marginBottom: '1rem', padding: '1rem', backgroundColor: '#0B2317', borderRadius: '0.5rem' }}>{success}</div>}

      <div className="card">
        {loading ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>Loading...</div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>First Entry</th>
                  <th>Last Exit</th>
                  <th>Active Time</th>
                  <th>Late</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {records.length === 0 ? (
                  <tr>
                    <td colSpan="6" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
                      No attendance records found for this date. Run "Process EOD" to compute records from raw scan events.
                    </td>
                  </tr>
                ) : (
                  records.map(rec => (
                    <tr key={rec.record_id}>
                      <td style={{ fontWeight: 600 }}>{rec.employee_name}</td>
                      <td style={{ color: 'var(--text-secondary)' }}>
                        {rec.first_entry ? new Date(rec.first_entry).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '-'}
                      </td>
                      <td style={{ color: 'var(--text-secondary)' }}>
                        {rec.last_exit ? new Date(rec.last_exit).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '-'}
                      </td>
                      <td>
                        {Math.floor(rec.total_active_time_min / 60)}h {rec.total_active_time_min % 60}m
                      </td>
                      <td>
                        {rec.is_late ? (
                           <span style={{ color: 'var(--danger)' }}>+{rec.late_duration_min} min</span>
                        ) : (
                           <span style={{ color: 'var(--success)' }}>On Time</span>
                        )}
                      </td>
                      <td>
                        <span className="status-badge active">{rec.status}</span>
                      </td>
                    </tr>
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
