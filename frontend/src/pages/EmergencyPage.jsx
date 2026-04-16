import { useState, useEffect } from 'react';
import { emergencyAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';

export default function EmergencyPage() {
  const { user } = useAuth();
  const [activeEmergency, setActiveEmergency] = useState(null);
  const [emergencyHistory, setEmergencyHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Safety Check state
  const [safetyCheck, setSafetyCheck] = useState(null);
  const [safetyLoading, setSafetyLoading] = useState(false);
  const [safetyFilter, setSafetyFilter] = useState('ALL');
  const [sendingCheck, setSendingCheck] = useState(false);

  useEffect(() => {
    fetchActive();
    const interval = setInterval(fetchActive, 5000);
    return () => clearInterval(interval);
  }, []);

  // Auto-refresh safety check data when emergency is active and safety check was sent
  useEffect(() => {
    if (activeEmergency?.safety_check_sent) {
      fetchSafetyCheck(activeEmergency.emergency_id);
      const interval = setInterval(() => fetchSafetyCheck(activeEmergency.emergency_id), 5000);
      return () => clearInterval(interval);
    }
  }, [activeEmergency?.emergency_id, activeEmergency?.safety_check_sent]);

  const fetchActive = async () => {
    try {
      const res = await emergencyAPI.getActive();
      setActiveEmergency(res.data);
    } catch (err) {
      console.error("Failed to fetch emergency state", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchSafetyCheck = async (emergencyId) => {
    try {
      setSafetyLoading(true);
      const res = await emergencyAPI.getSafetyCheck(emergencyId);
      setSafetyCheck(res.data);
    } catch (err) {
      console.error("Failed to fetch safety check", err);
    } finally {
      setSafetyLoading(false);
    }
  };

  const fetchHistory = async () => {
    setHistoryLoading(true);
    try {
      const res = await emergencyAPI.getHistory();
      setEmergencyHistory(res.data || []);
    } catch (err) {
      console.error("Failed to fetch emergency history", err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const toggleHistory = () => {
    if (!showHistory && emergencyHistory.length === 0) {
      fetchHistory();
    }
    setShowHistory(!showHistory);
  };

  const handleTrigger = async () => {
    if (!window.confirm("CRITICAL: Are you sure you want to trigger building evacuation mode?")) return;
    try {
      await emergencyAPI.trigger({ emergency_type: 'FACTORY_EVACUATION', notes: 'Triggered via Admin Console' });
      fetchActive();
    } catch (err) {
      alert(err.response?.data?.detail || "Failed to trigger emergency");
    }
  };

  const handleResolve = async () => {
    if (!activeEmergency) return;
    if (!window.confirm("Verify: Are you sure the emergency is resolved and employees can return?")) return;
    try {
      await emergencyAPI.resolve(activeEmergency.emergency_id);
      setActiveEmergency(null);
      setSafetyCheck(null);
    } catch (err) {
      alert("Failed to resolve emergency");
    }
  };

  const handleAccountFor = async (headcountId) => {
    try {
      await emergencyAPI.markAccounted(headcountId);
      setActiveEmergency(prev => ({
        ...prev,
        headcount_entries: prev.headcount_entries.map(e =>
          e.id === headcountId ? { ...e, accounted_for: true, accounted_at: new Date().toISOString() } : e
        )
      }));
    } catch (err) {
      console.error(err);
    }
  };

  const handleSendSafetyCheck = async () => {
    if (!activeEmergency) return;
    if (!window.confirm("This will send an 'Are you safe?' notification to ALL employees. Continue?")) return;
    try {
      setSendingCheck(true);
      await emergencyAPI.sendSafetyCheck(activeEmergency.emergency_id);
      // Refresh emergency to get updated safety_check_sent flag
      await fetchActive();
    } catch (err) {
      alert(err.response?.data?.detail || "Failed to send safety check");
    } finally {
      setSendingCheck(false);
    }
  };

  if (loading && !activeEmergency) {
    return (
      <div className="page-container">
        <div className="table-loading">
          <div className="loading-spinner"></div>
          <span>Loading emergency status...</span>
        </div>
      </div>
    );
  }

  const isAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'HR_MANAGER';
  const missingCount = activeEmergency?.headcount_entries?.filter(e => !e.accounted_for).length || 0;
  const safeCount = activeEmergency?.headcount_entries?.filter(e => e.accounted_for).length || 0;

  // Filter safety check responses based on selected filter
  const filteredResponses = safetyCheck?.responses?.filter(r => {
    if (safetyFilter === 'ALL') return true;
    return r.status === safetyFilter;
  }) || [];

  return (
    <div className="page-container">
      {/* Page Header */}
      <header className="page-header-premium">
        <div className="page-header-content">
          <span className="page-header-chip page-header-chip--emergency">SAFETY PROTOCOL</span>
          <h1 className="page-title-premium">Emergency Mode</h1>
          <p className="page-subtitle-premium">Evacuation headcount and muster point tracking</p>
        </div>
        <button 
          className={`btn btn-ghost ${showHistory ? 'btn-ghost--active' : ''}`}
          onClick={toggleHistory}
        >
          <span className="material-symbols-outlined">history</span>
          {showHistory ? 'Hide History' : 'View History'}
        </button>
      </header>

      {/* Emergency History Panel */}
      {showHistory && (
        <div className="emergency-history-panel">
          <div className="emergency-history-header">
            <span className="material-symbols-outlined">history</span>
            <h3>Emergency History</h3>
          </div>
          {historyLoading ? (
            <div className="emergency-history-loading">
              <div className="loading-spinner"></div>
              <span>Loading history...</span>
            </div>
          ) : emergencyHistory.length === 0 ? (
            <div className="emergency-history-empty">
              <span className="material-symbols-outlined">check_circle</span>
              <span>No emergency events on record</span>
            </div>
          ) : (
            <div className="emergency-history-list">
              {emergencyHistory.filter(e => e.status === 'RESOLVED').map(emergency => (
                <div key={emergency.emergency_id} className="emergency-history-item">
                  <div className="emergency-history-item-header">
                    <span className="emergency-history-type">{emergency.emergency_type}</span>
                    <span className="emergency-history-status">RESOLVED</span>
                  </div>
                  <div className="emergency-history-item-details">
                    <div className="emergency-history-detail">
                      <span className="material-symbols-outlined">schedule</span>
                      <span>Activated: {new Date(emergency.activation_time).toLocaleString()}</span>
                    </div>
                    {emergency.deactivation_time && (
                      <div className="emergency-history-detail">
                        <span className="material-symbols-outlined">check_circle</span>
                        <span>Resolved: {new Date(emergency.deactivation_time).toLocaleString()}</span>
                      </div>
                    )}
                    <div className="emergency-history-detail">
                      <span className="material-symbols-outlined">group</span>
                      <span>Headcount: {emergency.headcount_at_activation || 0} personnel</span>
                    </div>
                  </div>
                  {emergency.notes && (
                    <div className="emergency-history-notes">
                      <span className="material-symbols-outlined">notes</span>
                      <span>{emergency.notes}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!activeEmergency ? (
        /* Safe State */
        <div className="emergency-safe-card">
          <div className="emergency-safe-icon">
            <span className="material-symbols-outlined">verified_user</span>
          </div>
          <h2 className="emergency-safe-title">Building is Safe</h2>
          <p className="emergency-safe-text">There are no active emergencies</p>

          {isAdmin && (
            <button className="btn btn-danger btn-large" onClick={handleTrigger}>
              <span className="material-symbols-outlined">emergency</span>
              Trigger Evacuation
            </button>
          )}
        </div>
      ) : (
        /* Active Emergency */
        <div className="emergency-active">
          {/* Alert Banner */}
          <div className="emergency-banner">
            <div className="emergency-banner-content">
              <span className="material-symbols-outlined emergency-banner-icon">emergency</span>
              <div>
                <h2 className="emergency-banner-title">EVACUATION ACTIVE</h2>
                <p className="emergency-banner-time">
                  Activated at {new Date(activeEmergency.activation_time).toLocaleTimeString()}
                </p>
              </div>
            </div>
            <div className="emergency-banner-actions">
              {isAdmin && !activeEmergency.safety_check_sent && (
                <button
                  className="btn safety-btn-send"
                  onClick={handleSendSafetyCheck}
                  disabled={sendingCheck}
                >
                  <span className="material-symbols-outlined">campaign</span>
                  {sendingCheck ? 'Sending...' : 'Send "Are You Safe?"'}
                </button>
              )}
              {isAdmin && (
                <button className="btn btn-ghost btn-resolve" onClick={handleResolve}>
                  <span className="material-symbols-outlined">check_circle</span>
                  Resolve Emergency
                </button>
              )}
            </div>
          </div>

          {/* Stats Grid */}
          <div className="emergency-stats">
            <div className="emergency-stat-card">
              <span className="emergency-stat-value">{activeEmergency.headcount_at_activation}</span>
              <span className="emergency-stat-label">Initial Headcount</span>
            </div>
            <div className="emergency-stat-card emergency-stat-card--danger">
              <span className="emergency-stat-value">{missingCount}</span>
              <span className="emergency-stat-label">Missing Personnel</span>
            </div>
            <div className="emergency-stat-card emergency-stat-card--success">
              <span className="emergency-stat-value">{safeCount}</span>
              <span className="emergency-stat-label">Accounted For</span>
            </div>
          </div>

          {/* Safety Check Dashboard — shown after "Are you safe?" is sent */}
          {activeEmergency.safety_check_sent && safetyCheck && (
            <div className="safety-check-dashboard">
              <div className="safety-check-header">
                <div className="safety-check-header-left">
                  <span className="material-symbols-outlined safety-check-header-icon">health_and_safety</span>
                  <div>
                    <h2 className="safety-check-title">Safety Check Responses</h2>
                    <p className="safety-check-subtitle">Real-time employee safety status</p>
                  </div>
                </div>
                {safetyLoading && <div className="loading-spinner loading-spinner--small"></div>}
              </div>

              {/* Safety Stats */}
              <div className="safety-check-stats">
                <div className="safety-check-stat safety-check-stat--safe">
                  <span className="material-symbols-outlined">verified_user</span>
                  <div className="safety-check-stat-info">
                    <span className="safety-check-stat-value">{safetyCheck.safe_count}</span>
                    <span className="safety-check-stat-label">Safe</span>
                  </div>
                </div>
                <div className="safety-check-stat safety-check-stat--danger">
                  <span className="material-symbols-outlined">emergency</span>
                  <div className="safety-check-stat-info">
                    <span className="safety-check-stat-value">{safetyCheck.in_danger_count}</span>
                    <span className="safety-check-stat-label">In Danger</span>
                  </div>
                </div>
                <div className="safety-check-stat safety-check-stat--pending">
                  <span className="material-symbols-outlined">hourglass_top</span>
                  <div className="safety-check-stat-info">
                    <span className="safety-check-stat-value">{safetyCheck.pending_count}</span>
                    <span className="safety-check-stat-label">No Response</span>
                  </div>
                </div>
                <div className="safety-check-stat safety-check-stat--total">
                  <span className="material-symbols-outlined">groups</span>
                  <div className="safety-check-stat-info">
                    <span className="safety-check-stat-value">{safetyCheck.total_employees}</span>
                    <span className="safety-check-stat-label">Total</span>
                  </div>
                </div>
              </div>

              {/* Filter Tabs */}
              <div className="safety-check-filters">
                {['ALL', 'IN_DANGER', 'PENDING', 'SAFE'].map(filter => (
                  <button
                    key={filter}
                    className={`safety-check-filter-btn ${safetyFilter === filter ? 'safety-check-filter-btn--active' : ''} ${filter === 'IN_DANGER' ? 'safety-check-filter-btn--danger' : ''}`}
                    onClick={() => setSafetyFilter(filter)}
                  >
                    {filter === 'ALL' ? `All (${safetyCheck.total_employees})` :
                     filter === 'IN_DANGER' ? `In Danger (${safetyCheck.in_danger_count})` :
                     filter === 'PENDING' ? `No Response (${safetyCheck.pending_count})` :
                     `Safe (${safetyCheck.safe_count})`}
                  </button>
                ))}
              </div>

              {/* Employee Response Table */}
              <div className="table-wrapper">
                <table className="premium-table">
                  <thead>
                    <tr>
                      <th>Employee Name</th>
                      <th>Department</th>
                      <th>Email</th>
                      <th>Phone</th>
                      <th>Status</th>
                      <th>Response Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredResponses.length === 0 ? (
                      <tr>
                        <td colSpan="6" style={{ textAlign: 'center', padding: '2rem', color: 'var(--secondary)' }}>
                          No employees in this category
                        </td>
                      </tr>
                    ) : (
                      filteredResponses.map(resp => (
                        <tr
                          key={resp.id}
                          className={
                            resp.status === 'IN_DANGER' ? 'safety-row-danger' :
                            resp.status === 'PENDING' ? 'safety-row-pending' :
                            'safety-row-safe'
                          }
                        >
                          <td>
                            <span className="table-cell-name">{resp.employee_name}</span>
                          </td>
                          <td>{resp.department_name || '—'}</td>
                          <td>{resp.email || '—'}</td>
                          <td>{resp.phone || '—'}</td>
                          <td>
                            <span className={`safety-status-badge safety-status-badge--${resp.status.toLowerCase().replace('_', '-')}`}>
                              <span className="material-symbols-outlined">
                                {resp.status === 'SAFE' ? 'verified_user' :
                                 resp.status === 'IN_DANGER' ? 'warning' : 'hourglass_top'}
                              </span>
                              {resp.status === 'IN_DANGER' ? 'IN DANGER' : resp.status}
                            </span>
                          </td>
                          <td>
                            <span className="table-cell-time">
                              {resp.responded_at
                                ? new Date(resp.responded_at).toLocaleTimeString()
                                : '—'}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Muster Checklist */}
          <div className="table-card-premium emergency-table">
            <div className="table-card-header">
              <div className="table-card-title-group">
                <span className="material-symbols-outlined table-card-icon">fact_check</span>
                <div>
                  <h2 className="table-card-title">Muster Point Checklist</h2>
                  <p className="table-card-subtitle">Mark personnel as safe when accounted for</p>
                </div>
              </div>
            </div>

            <div className="table-wrapper">
              <table className="premium-table">
                <thead>
                  <tr>
                    <th>Employee Name</th>
                    <th>Status at Event</th>
                    <th>Safe Time</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {activeEmergency.headcount_entries?.map(entry => (
                    <tr
                      key={entry.id}
                      className={entry.accounted_for ? 'emergency-row-safe' : 'emergency-row-missing'}
                    >
                      <td>
                        <span className="table-cell-name">{entry.employee_name}</span>
                      </td>
                      <td>
                        <span className="status-chip status-chip--active">{entry.status_at_event}</span>
                      </td>
                      <td>
                        <span className="table-cell-time">
                          {entry.accounted_at
                            ? new Date(entry.accounted_at).toLocaleTimeString()
                            : '—'}
                        </span>
                      </td>
                      <td>
                        {!entry.accounted_for ? (
                          <button
                            className="btn btn-success btn-small"
                            onClick={() => handleAccountFor(entry.id)}
                          >
                            <span className="material-symbols-outlined">check</span>
                            Mark Safe
                          </button>
                        ) : (
                          <span className="safe-badge">
                            <span className="material-symbols-outlined">verified</span>
                            SAFE
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
