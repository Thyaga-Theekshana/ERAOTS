import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { hardwareAPI } from '../services/api';

export default function HardwarePage() {
  const { user } = useAuth();
  const [scanners, setScanners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [logsModalOpen, setLogsModalOpen] = useState(false);
  const [selectedScannerId, setSelectedScannerId] = useState(null);
  const [scannerLogs, setScannerLogs] = useState([]);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    loadScannerHealth();
    
    // Refresh every 30 seconds
    const interval = setInterval(loadScannerHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadScannerHealth = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await hardwareAPI.getHealth();
      setScanners(response.data);
    } catch (err) {
      setError(err.message || 'Failed to load scanner health');
      console.error('Failed to load scanner health:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRestart = async (scannerId) => {
    try {
      setActionLoading(true);
      await hardwareAPI.restart(scannerId);
      // Optimistically update
      setScanners(prev => prev.map(s => s.scanner_id === scannerId ? { ...s, status: 'DEGRADED' } : s));
      alert('Restart signal transmitted successfully');
    } catch (err) {
      alert('Failed to transmit restart signal: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleViewLogs = async (scannerId) => {
    try {
      setSelectedScannerId(scannerId);
      setLogsModalOpen(true);
      setScannerLogs([]); // clear old
      const res = await hardwareAPI.getHealthHistory(scannerId);
      setScannerLogs(res.data);
    } catch (err) {
      alert('Failed to fetch scanner logs: ' + err.message);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'ONLINE':
        return '#4CAF50'; // Green
      case 'DEGRADED':
        return '#FF9800'; // Orange
      case 'OFFLINE':
        return '#F44336'; // Red
      default:
        return '#9E9E9E'; // Gray
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'ONLINE':
        return 'check_circle';
      case 'DEGRADED':
        return 'warning';
      case 'OFFLINE':
        return 'error';
      default:
        return 'help';
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div className="page-header-content">
          <h1 className="page-title">
            <span className="material-symbols-outlined">devices</span>
            Hardware <span className="highlight">Monitoring</span>
          </h1>
          <p className="page-subtitle">Real-time scanner health and performance tracking</p>
        </div>
      </div>

      {error && (
        <div className="alert alert-error" style={{ marginBottom: '20px' }}>
          <span className="material-symbols-outlined">error</span>
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <div className="spinner"></div>
          <p>Loading scanner health...</p>
        </div>
      ) : (
        <div className="bento-grid">
          {/* Summary Cards */}
          <div className="card glass bento-span-2" style={{ gridColumn: 'span 2' }}>
            <div className="card-header">
              <h3>System Overview</h3>
            </div>
            <div className="card-content">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '32px', fontWeight: 'bold', color: 'var(--primary)' }}>
                    {scanners.length}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--on-surface-variant)' }}>Total Scanners</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#4CAF50' }}>
                    {scanners.filter(s => s.status === 'ONLINE').length}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--on-surface-variant)' }}>Online</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#FF9800' }}>
                    {scanners.filter(s => s.status === 'DEGRADED').length}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--on-surface-variant)' }}>Degraded</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#F44336' }}>
                    {scanners.filter(s => s.status === 'OFFLINE').length}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--on-surface-variant)' }}>Offline</div>
                </div>
              </div>
            </div>
          </div>

          {/* Scanner Cards */}
          {scanners.map((scanner) => (
            <div key={scanner.scanner_id} className="card glass">
              <div className="card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span
                    className="material-symbols-outlined"
                    style={{ color: getStatusColor(scanner.status) }}
                  >
                    {getStatusIcon(scanner.status)}
                  </span>
                  <div>
                    <h4 style={{ margin: '0 0 4px 0' }}>{scanner.name}</h4>
                    <p style={{ margin: 0, fontSize: '12px', color: 'var(--on-surface-variant)' }}>
                      {scanner.door_name}
                    </p>
                  </div>
                </div>
              </div>

              <div className="card-content">
                {/* Status Badge */}
                <div style={{ marginBottom: '15px' }}>
                  <span
                    style={{
                      display: 'inline-block',
                      padding: '4px 12px',
                      borderRadius: '20px',
                      backgroundColor: getStatusColor(scanner.status),
                      color: 'white',
                      fontSize: '12px',
                      fontWeight: 'bold',
                    }}
                  >
                    {scanner.status}
                  </span>
                </div>

                {/* Metrics */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', fontSize: '13px' }}>
                  <div>
                    <div style={{ color: 'var(--on-surface-variant)', marginBottom: '4px' }}>Uptime</div>
                    <div style={{ fontSize: '18px', fontWeight: 'bold' }}>
                      {scanner.uptime_percentage.toFixed(1)}%
                    </div>
                  </div>

                  <div>
                    <div style={{ color: 'var(--on-surface-variant)', marginBottom: '4px' }}>Error Rate</div>
                    <div
                      style={{
                        fontSize: '18px',
                        fontWeight: 'bold',
                        color: scanner.error_rate_pct > 5 ? '#FF9800' : '#4CAF50',
                      }}
                    >
                      {scanner.error_rate_pct.toFixed(1)}%
                    </div>
                  </div>
                </div>

                {/* Last Heartbeat */}
                {scanner.last_heartbeat && (
                  <div style={{ marginTop: '12px', fontSize: '12px', color: 'var(--on-surface-variant)' }}>
                    Last heartbeat:{' '}
                    {new Date(scanner.last_heartbeat).toLocaleTimeString()}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="card-footer" style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn-secondary btn-sm" onClick={() => handleViewLogs(scanner.scanner_id)}>View Logs</button>
                {scanner.status !== 'ONLINE' && (
                  <button className="btn-primary btn-sm" onClick={() => handleRestart(scanner.scanner_id)} disabled={actionLoading}>
                    {actionLoading ? 'Restarting...' : 'Restart'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Logs Modal — uses design-system hw-modal classes */}
      {logsModalOpen && (
        <div className="hw-modal-overlay" onClick={() => setLogsModalOpen(false)}>
          <div className="hw-modal" onClick={e => e.stopPropagation()}>
            <div className="hw-modal-header">
              <span className="hw-modal-title">Scanner Health History</span>
              <button className="btn-icon" onClick={() => setLogsModalOpen(false)}>
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="hw-modal-body">
              {scannerLogs.length === 0 ? (
                <p className="hw-logs-empty">No logs available for this scanner.</p>
              ) : (
                <table className="hw-logs-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Status</th>
                      <th>Response</th>
                      <th>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scannerLogs.map(log => (
                      <tr key={log.log_id}>
                        <td>{new Date(log.checked_at).toLocaleString()}</td>
                        <td style={{ color: getStatusColor(log.status) }}>{log.status}</td>
                        <td>{log.response_time_ms ? `${log.response_time_ms}ms` : '—'}</td>
                        <td>{log.error_message || 'OK'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}