import { useState, useEffect } from 'react';
import { hardwareAPI } from '../services/api';
import { useUIFeedback } from '../context/UIFeedbackContext';
import { TableSkeleton, EmptyStateStandard, ErrorStateStandard } from '../components/DataStates';

export default function ScannersPage() {
  const ui = useUIFeedback();
  const [scanners, setScanners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newApiKey, setNewApiKey] = useState(null);
  const [pageError, setPageError] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    door_name: '',
    location_description: '',
    heartbeat_interval_sec: 60
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      setPageError('');
      const res = await hardwareAPI.list();
      setScanners(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("Failed to fetch scanners", err);
      const detail = err.response?.data?.detail || 'Failed to fetch scanners';
      setPageError(detail);
      ui.error(detail);
      setScanners([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const intv = setInterval(fetchData, 10000);
    return () => clearInterval(intv);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = { ...formData, heartbeat_interval_sec: parseInt(formData.heartbeat_interval_sec) };
      const res = await hardwareAPI.register(payload);
      setNewApiKey(res.data.api_key);
      setFormData({ name: '', door_name: '', location_description: '', heartbeat_interval_sec: 60 });
      fetchData();
    } catch (err) {
      ui.error(err.response?.data?.detail || 'Failed to register scanner');
    }
  };

  const onlineCount = scanners.filter(s => s.status === 'ONLINE').length;
  const offlineCount = scanners.filter(s => s.status !== 'ONLINE').length;

  return (
    <div className="page-container">
      {/* Page Header */}
      <header className="page-header-premium">
        <div className="page-header-content">
          <span className="page-header-chip">INFRASTRUCTURE</span>
          <h1 className="page-title-premium">Scanner Fleet</h1>
          <p className="page-subtitle-premium">Manage deployed biometric scanners and connection statuses</p>
        </div>
      </header>

      {pageError && <ErrorStateStandard message={pageError} onRetry={fetchData} />}

      {/* Stats Row */}
      <div className="stats-row">
        <div className="stat-card-mini">
          <span className="stat-card-mini-label">Total Nodes</span>
          <span className="stat-card-mini-value">{scanners.length}</span>
        </div>
        <div className="stat-card-mini">
          <span className="stat-card-mini-label">Online</span>
          <span className="stat-card-mini-value">{onlineCount}</span>
        </div>
        <div className="stat-card-mini stat-card-mini--accent">
          <span className="stat-card-mini-label">Offline</span>
          <span className="stat-card-mini-value">{offlineCount}</span>
        </div>
      </div>

      {/* Table Card */}
      <div className="table-card-premium">
        <div className="table-card-header">
          <div className="table-card-title-group">
            <span className="material-symbols-outlined table-card-icon">router</span>
            <div>
              <h2 className="table-card-title">Hardware Registry</h2>
              <p className="table-card-subtitle">{scanners.length} nodes registered</p>
            </div>
          </div>
          <div className="table-card-live">
            <span className="live-dot"></span>
            <span>Auto-refresh 10s</span>
          </div>
        </div>

        {loading && scanners.length === 0 ? (
          <TableSkeleton rows={6} columns={6} label="Loading scanner fleet..." />
        ) : scanners.length === 0 ? (
          <EmptyStateStandard
            icon="router"
            title="No scanners registered"
            message="Register a scanner to start ingesting scan events."
          />
        ) : (
          <div className="table-wrapper">
            <table className="premium-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Scanner Name</th>
                  <th>Assigned Door</th>
                  <th>Location</th>
                  <th>Last Heartbeat</th>
                  <th>UUID</th>
                </tr>
              </thead>
              <tbody>
                {scanners.map(s => {
                  const isOnline = s.status === 'ONLINE';
                  return (
                    <tr key={s.scanner_id}>
                      <td>
                        <div className="scanner-status">
                          <span className={`scanner-status-dot ${isOnline ? 'scanner-status-dot--online' : 'scanner-status-dot--offline'}`}></span>
                          <span className={`scanner-status-text ${isOnline ? 'scanner-status-text--online' : 'scanner-status-text--offline'}`}>
                            {s.status}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className="table-cell-name">{s.name}</span>
                      </td>
                      <td>
                        <span className="table-cell-primary">{s.door_name}</span>
                      </td>
                      <td>
                        <span className="table-cell-secondary">{s.location_description || '—'}</span>
                      </td>
                      <td>
                        <span className="table-cell-time">
                          {s.last_heartbeat ? new Date(s.last_heartbeat).toLocaleString() : 'Never'}
                        </span>
                      </td>
                      <td>
                        <code className="uuid-code">{s.scanner_id.split('-')[0]}...</code>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Floating Action Button */}
      <button className="fab" onClick={() => { setIsModalOpen(true); setNewApiKey(null); }} title="Register Scanner">
        <span className="material-symbols-outlined">add</span>
      </button>

      {/* Modal */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            {newApiKey ? (
              /* API Key Reveal */
              <div className="api-key-reveal">
                <div className="api-key-header">
                  <span className="material-symbols-outlined api-key-icon">key</span>
                  <h2 className="modal-title">Node Registered!</h2>
                </div>

                <div className="api-key-warning">
                  <span className="material-symbols-outlined">warning</span>
                  <div>
                    <strong>Critical: Copy this API Key</strong>
                    <p>This key authenticates the Raspberry Pi. It will never be shown again!</p>
                  </div>
                </div>

                <div className="api-key-display">
                  <code>{newApiKey}</code>
                </div>

                <button className="btn btn-primary btn-full" onClick={() => setIsModalOpen(false)}>
                  I have saved the key
                </button>
              </div>
            ) : (
              /* Registration Form */
              <>
                <div className="modal-header">
                  <div className="modal-header-content">
                    <span className="material-symbols-outlined modal-header-icon">add_circle</span>
                    <div>
                      <h2 className="modal-title">Register Scanner</h2>
                      <p className="modal-subtitle">Provision a new hardware node</p>
                    </div>
                  </div>
                  <button className="modal-close" onClick={() => setIsModalOpen(false)}>
                    <span className="material-symbols-outlined">close</span>
                  </button>
                </div>

                <form onSubmit={handleSubmit}>
                  <div className="form-group">
                    <label className="form-label">Identifier</label>
                    <input
                      type="text"
                      className="form-input"
                      required
                      autoFocus
                      placeholder="e.g. Node-Alpha-1"
                      value={formData.name}
                      onChange={e => setFormData({ ...formData, name: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Door Target</label>
                    <input
                      type="text"
                      className="form-input"
                      required
                      placeholder="e.g. Main Entrance"
                      value={formData.door_name}
                      onChange={e => setFormData({ ...formData, door_name: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Location Description</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. Block A, Ground Floor"
                      value={formData.location_description}
                      onChange={e => setFormData({ ...formData, location_description: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Heartbeat Interval (seconds)</label>
                    <input
                      type="number"
                      className="form-input"
                      min="30"
                      max="300"
                      required
                      value={formData.heartbeat_interval_sec}
                      onChange={e => setFormData({ ...formData, heartbeat_interval_sec: e.target.value })}
                    />
                  </div>

                  <div className="modal-actions">
                    <button type="button" className="btn btn-ghost" onClick={() => setIsModalOpen(false)}>
                      Cancel
                    </button>
                    <button type="submit" className="btn btn-primary">
                      Provision Node
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
