/**
 * Hardware Health Monitoring Dashboard (FR13)
 * Displays real-time status of all scanners with alerts and logs.
 * 
 * Design: Vigilant Glass (glassmorphism, dark theme)
 * Access: HR_MANAGER, SUPER_ADMIN only
 */
import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { hardwareMonitoringAPI, createDashboardSocket } from '../services/api';
import { TableSkeleton, EmptyStateStandard, ErrorStateStandard } from './components/DataStates';
import './HardwareMonitoring.css';

const isPlainObject = (value) => value && typeof value === 'object' && !Array.isArray(value);

const normalizeScanners = (payload) => {
  if (!Array.isArray(payload)) {
    return [];
  }

  return payload.filter(isPlainObject).map((scanner, index) => ({
    ...scanner,
    scanner_id: scanner.scanner_id || `unknown-${index}`,
    name: scanner.name || 'Unknown Scanner',
    door_name: scanner.door_name || 'Unknown Door',
    status: scanner.status || 'OFFLINE',
    heartbeat_interval_sec: Number.isFinite(Number(scanner.heartbeat_interval_sec)) ? Number(scanner.heartbeat_interval_sec) : 0,
    response_time_ms: Number.isFinite(Number(scanner.response_time_ms)) ? Number(scanner.response_time_ms) : null,
    error_count: Number.isFinite(Number(scanner.error_count)) ? Number(scanner.error_count) : 0,
    last_heartbeat: scanner.last_heartbeat || null,
  }));
};

const normalizeStats = (payload) => {
  if (!isPlainObject(payload)) {
    return null;
  }

  return {
    ...payload,
    total_scanners: Number.isFinite(Number(payload.total_scanners)) ? Number(payload.total_scanners) : 0,
    online: Number.isFinite(Number(payload.online)) ? Number(payload.online) : 0,
    offline: Number.isFinite(Number(payload.offline)) ? Number(payload.offline) : 0,
    degraded: Number.isFinite(Number(payload.degraded)) ? Number(payload.degraded) : 0,
    uptime_percentage: Number.isFinite(Number(payload.uptime_percentage)) ? Number(payload.uptime_percentage) : 0,
    average_response_time_ms: Number.isFinite(Number(payload.average_response_time_ms)) ? Number(payload.average_response_time_ms) : 0,
    error_count_today: Number.isFinite(Number(payload.error_count_today)) ? Number(payload.error_count_today) : 0,
  };
};

const normalizeLogs = (payload) => {
  if (!Array.isArray(payload)) {
    return [];
  }

  return payload.filter(isPlainObject).map((log, index) => ({
    ...log,
    log_id: log.log_id || `log-${index}`,
    status: log.status || 'UNKNOWN',
    checked_at: log.checked_at || null,
    response_time_ms: Number.isFinite(Number(log.response_time_ms)) ? Number(log.response_time_ms) : null,
    error_message: log.error_message || '',
  }));
};

export default function HardwareMonitoringPage() {
  const { user } = useAuth();
  const [scanners, setScanners] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedScanner, setSelectedScanner] = useState(null);
  const [logs, setLogs] = useState([]);
  const [showLogs, setShowLogs] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [pageError, setPageError] = useState('');

  // Fetch initial data
  useEffect(() => {
    fetchData();
  }, []);

  // Connect to WebSocket for real-time updates
  useEffect(() => {
    const handleWsMessage = (message) => {
      if (message.type === 'HARDWARE_ALERT') {
        handleHardwareAlert(message);
      }
    };

    const ws = createDashboardSocket(handleWsMessage);
    
    const checkConnection = setInterval(() => {
      setWsConnected(ws.readyState === WebSocket.OPEN);
    }, 1000);

    return () => {
      clearInterval(checkConnection);
      ws.close();
    };
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      setPageError('');
      const [scannersRes, statsRes] = await Promise.all([
        hardwareMonitoringAPI.getAll(),
        hardwareMonitoringAPI.getStats(),
      ]);
      setScanners(normalizeScanners(scannersRes.data));
      setStats(normalizeStats(statsRes.data));
    } catch (err) {
      console.error('Failed to fetch hardware data:', err);
      const detail = err.response?.data?.detail || 'Failed to load hardware monitoring data.';
      setPageError(detail);
      setScanners([]);
      setStats(null);
    } finally {
      setLoading(false);
    }
  };

  const handleHardwareAlert = (alert) => {
    if (alert.alert_type === 'SCANNER_OFFLINE' && alert.offline_scanners) {
      // Update scanner statuses
      setScanners((prev) =>
        prev.map((scanner) => {
          const offline = alert.offline_scanners.find(
            (s) => s.scanner_id === scanner.scanner_id.toString()
          );
          return offline ? { ...scanner, status: 'OFFLINE' } : scanner;
        })
      );
    } else if (alert.alert_type === 'SCANNER_RECOVERED') {
      setScanners((prev) =>
        prev.map((scanner) =>
          scanner.scanner_id === alert.scanner_id
            ? { ...scanner, status: 'ONLINE' }
            : scanner
        )
      );
    }
  };

  const fetchLogs = async (scannerId) => {
    try {
      const res = await hardwareMonitoringAPI.getLogs(scannerId);
      setLogs(normalizeLogs(res.data));
    } catch (err) {
      console.error('Failed to fetch logs:', err);
      setLogs([]);
    }
  };

  const handleViewLogs = async (scanner) => {
    setSelectedScanner(scanner);
    await fetchLogs(scanner.scanner_id);
    setShowLogs(true);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'ONLINE':
        return '#10B981';
      case 'DEGRADED':
        return '#F59E0B';
      case 'OFFLINE':
        return '#EF4444';
      default:
        return '#6B7280';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'ONLINE':
        return '🟢';
      case 'DEGRADED':
        return '🟡';
      case 'OFFLINE':
        return '🔴';
      default:
        return '⚪';
    }
  };

  if (loading) {
    return (
      <div className="page-container">
        <TableSkeleton rows={6} columns={4} label="Loading hardware monitoring data..." />
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div className="page-header-content">
          <h1 className="page-title">
            🖥️ Hardware <span className="highlight">Health</span>
          </h1>
          <p className="page-subtitle">Real-time scanner monitoring and analytics</p>
        </div>
      </div>

      {pageError && <ErrorStateStandard message={pageError} onRetry={fetchData} />}

      {/* Statistics Bar */}
      <div className="hardware-stats-bar">
        <div className="stat-item">
          <span className="stat-label">Total Scanners</span>
          <span className="stat-value">{stats?.total_scanners || 0}</span>
        </div>
        <div className="stat-item stat-online">
          <span className="stat-label">Online</span>
          <span className="stat-value">{stats?.online || 0}</span>
        </div>
        <div className="stat-item stat-offline">
          <span className="stat-label">Offline</span>
          <span className="stat-value">{stats?.offline || 0}</span>
        </div>
        <div className="stat-item stat-degraded">
          <span className="stat-label">Degraded</span>
          <span className="stat-value">{stats?.degraded || 0}</span>
        </div>
        <div className={`ws-status ${wsConnected ? 'connected' : 'disconnected'}`}>
          {wsConnected ? '🔗 Live' : '🔌 Offline'}
        </div>
      </div>

      {/* Scanners Grid */}
      <div className="hardware-grid">
        {scanners.length === 0 ? (
          <EmptyStateStandard
            icon="devices"
            title="No scanners found"
            message="Scanner health data will appear once hardware nodes are active."
          />
        ) : (
          scanners.map((scanner) => (
            <div key={scanner.scanner_id} className="hardware-card glass">
              <div className="card-header">
                <h3 className="card-title">{scanner.name}</h3>
                <span
                  className="status-badge"
                  style={{ backgroundColor: getStatusColor(scanner.status) }}
                >
                  {getStatusIcon(scanner.status)} {scanner.status}
                </span>
              </div>

              <div className="card-content">
                <p>
                  <strong>Door:</strong> {scanner.door_name}
                </p>
                <p>
                  <strong>Last Heartbeat:</strong>{' '}
                  {scanner.last_heartbeat
                    ? new Date(scanner.last_heartbeat).toLocaleString()
                    : 'Never'}
                </p>
                <p>
                  <strong>Interval:</strong> {scanner.heartbeat_interval_sec}s
                </p>
                {scanner.response_time_ms && (
                  <p>
                    <strong>Response Time:</strong> {scanner.response_time_ms}ms
                  </p>
                )}
                {scanner.error_count > 0 && (
                  <p className="error-count">
                    <strong>Errors (Today):</strong> {scanner.error_count}
                  </p>
                )}
              </div>

              <div className="card-actions">
                <button
                  className="btn-secondary"
                  onClick={() => handleViewLogs(scanner)}
                >
                  📊 View Logs
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Logs Modal */}
      {showLogs && selectedScanner && (
        <div className="modal-overlay" onClick={() => setShowLogs(false)}>
          <div className="modal glass" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{selectedScanner.name} - Health Logs</h2>
              <button className="modal-close" onClick={() => setShowLogs(false)}>
                ✕
              </button>
            </div>

            <div className="modal-body">
              {logs.length === 0 ? (
                <p>No logs available</p>
              ) : (
                <table className="logs-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Status</th>
                      <th>Response (ms)</th>
                      <th>Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => (
                      <tr key={log.log_id}>
                        <td>{new Date(log.checked_at).toLocaleString()}</td>
                        <td>
                          <span style={{ color: getStatusColor(log.status) }}>
                            {getStatusIcon(log.status)} {log.status}
                          </span>
                        </td>
                        <td>{log.response_time_ms || '-'}</td>
                        <td>{log.error_message || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="modal-footer">
              <button className="btn-primary" onClick={() => setShowLogs(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Performance Summary */}
      {stats && (
        <div className="performance-summary glass">
          <h3>Performance Summary</h3>
          <div className="summary-grid">
            <div className="summary-item">
              <span className="summary-label">Uptime</span>
              <span className="summary-value">{stats.uptime_percentage.toFixed(1)}%</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Avg Response Time</span>
              <span className="summary-value">{stats.average_response_time_ms.toFixed(0)}ms</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Errors (Today)</span>
              <span className="summary-value">{stats.error_count_today}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
