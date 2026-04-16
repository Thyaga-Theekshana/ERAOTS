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
              <div className="card-footer" style={{ display: 'flex', gap: '8px' }}>
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

      {/* Logs Modal */}
      {logsModalOpen && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div className="glass bento-span-2 card" style={{ width: '600px', maxHeight: '80vh', overflowY: 'auto' }}>
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3>Scanner Health History (Logs)</h3>
              <button className="btn-ghost btn-sm" onClick={() => setLogsModalOpen(false)}>Close</button>
            </div>
            <div className="card-content">
              {scannerLogs.length === 0 ? <p>No logs found. Or loading...</p> : (
                <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      <th style={{ padding: '8px' }}>Time</th>
                      <th style={{ padding: '8px' }}>Status</th>
                      <th style={{ padding: '8px' }}>Response Time</th>
                      <th style={{ padding: '8px' }}>Error Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scannerLogs.map(log => (
                      <tr key={log.log_id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '8px' }}>{new Date(log.checked_at).toLocaleString()}</td>
                        <td style={{ padding: '8px', color: getStatusColor(log.status) }}>{log.status}</td>
                        <td style={{ padding: '8px' }}>{log.response_time_ms ? `${log.response_time_ms}ms` : '-'}</td>
                        <td style={{ padding: '8px' }}>{log.error_message || 'OK'}</td>
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