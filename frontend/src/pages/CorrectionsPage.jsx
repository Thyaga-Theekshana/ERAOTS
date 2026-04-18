import { useState, useEffect } from 'react';
import { correctionsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useUIFeedback } from '../context/UIFeedbackContext';
import { TableSkeleton, EmptyStateStandard, ErrorStateStandard } from '../components/DataStates';

export default function CorrectionsPage() {
  const { user } = useAuth();
  const ui = useUIFeedback();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pageError, setPageError] = useState('');

  const [formData, setFormData] = useState({
    correction_date: '',
    correction_type: 'MISSED_SCAN',
    proposed_time: '',
    reason: ''
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      setPageError('');
      const res = await correctionsAPI.list();
      setRequests(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("Failed to fetch data", err);
      const detail = err.response?.data?.detail || 'Failed to load correction requests.';
      setPageError(detail);
      ui.error(detail);
      setRequests([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...formData,
        proposed_time: new Date(`${formData.correction_date}T${formData.proposed_time}`).toISOString()
      };
      await correctionsAPI.submit(payload);
      setIsModalOpen(false);
      setFormData({ correction_date: '', correction_type: 'MISSED_SCAN', proposed_time: '', reason: '' });
      fetchData();
    } catch (err) {
      ui.error(err.response?.data?.detail || 'Failed to submit correction');
    }
  };

  const handleStatusUpdate = async (id, status) => {
    try {
      await correctionsAPI.updateStatus(id, status, `HR marked as ${status}`);
      fetchData();
    } catch (err) {
      ui.error(err.response?.data?.detail || 'Failed to update correction');
    }
  };

  const isHR = user && (user.role === 'HR_MANAGER' || user.role === 'SUPER_ADMIN');
  const pendingCount = requests.filter(r => r.status === 'PENDING').length;
  const approvedCount = requests.filter(r => r.status === 'APPROVED').length;

  return (
    <div className="page-container">
      {/* Page Header */}
      <header className="page-header-premium">
        <div className="page-header-content">
          <span className="page-header-chip">RECORD MANAGEMENT</span>
          <h1 className="page-title-premium">Corrections</h1>
          <p className="page-subtitle-premium">Dispute attendance records and log missed biometric scans</p>
        </div>
      </header>

      {pageError && <ErrorStateStandard message={pageError} onRetry={fetchData} />}

      {/* Stats Row */}
      <div className="stats-row">
        <div className="stat-card-mini">
          <span className="stat-card-mini-label">Total</span>
          <span className="stat-card-mini-value">{requests.length}</span>
        </div>
        <div className="stat-card-mini">
          <span className="stat-card-mini-label">Pending</span>
          <span className="stat-card-mini-value">{pendingCount}</span>
        </div>
        <div className="stat-card-mini">
          <span className="stat-card-mini-label">Approved</span>
          <span className="stat-card-mini-value">{approvedCount}</span>
        </div>
        <div className="stat-card-mini stat-card-mini--accent">
          <span className="stat-card-mini-label">Rejected</span>
          <span className="stat-card-mini-value">{requests.length - pendingCount - approvedCount}</span>
        </div>
      </div>

      {/* Table Card */}
      <div className="table-card-premium">
        <div className="table-card-header">
          <div className="table-card-title-group">
            <span className="material-symbols-outlined table-card-icon">edit_note</span>
            <div>
              <h2 className="table-card-title">Correction Requests</h2>
              <p className="table-card-subtitle">{requests.length} requests submitted</p>
            </div>
          </div>
        </div>

        {loading ? (
          <TableSkeleton rows={6} columns={isHR ? 6 : 5} label="Loading correction requests..." />
        ) : requests.length === 0 ? (
          <EmptyStateStandard
            icon="fact_check"
            title="No correction requests"
            message="Submitted correction requests will appear here."
          />
        ) : (
          <div className="table-wrapper">
            <table className="premium-table">
              <thead>
                <tr>
                  {isHR && <th>Employee</th>}
                  <th>Date</th>
                  <th>Type</th>
                  <th>Proposed Time</th>
                  <th>Status</th>
                  {isHR && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {requests.map(req => (
                  <tr key={req.request_id}>
                    {isHR && (
                      <td>
                        <span className="table-cell-name">{req.employee_name}</span>
                      </td>
                    )}
                    <td>
                      <span className="table-cell-date">{req.correction_date}</span>
                    </td>
                    <td>
                      <span className="correction-type-chip">
                        {req.correction_type.replace('_', ' ')}
                      </span>
                    </td>
                    <td>
                      <span className="table-cell-time">
                        {new Date(req.proposed_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </td>
                    <td>
                      <div className="status-with-reason">
                        <span className={`status-chip ${
                          req.status === 'APPROVED' ? 'status-chip--active' :
                          req.status === 'REJECTED' ? 'status-chip--danger' :
                          'status-chip--warning'
                        }`}>
                          {req.status}
                        </span>
                        {req.reason && (
                          <span className="status-reason">{req.reason}</span>
                        )}
                      </div>
                    </td>
                    {isHR && (
                      <td>
                        {req.status === 'PENDING' ? (
                          <div className="action-buttons">
                            <button
                              className="action-btn action-btn--approve"
                              onClick={() => handleStatusUpdate(req.request_id, 'APPROVED')}
                              title="Approve"
                            >
                              <span className="material-symbols-outlined">check</span>
                            </button>
                            <button
                              className="action-btn action-btn--reject"
                              onClick={() => handleStatusUpdate(req.request_id, 'REJECTED')}
                              title="Reject"
                            >
                              <span className="material-symbols-outlined">close</span>
                            </button>
                          </div>
                        ) : (
                          <span className="table-cell-secondary">Resolved</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Floating Action Button */}
      <button className="fab" onClick={() => setIsModalOpen(true)} title="File Correction">
        <span className="material-symbols-outlined">add</span>
      </button>

      {/* Modal */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-header-content">
                <span className="material-symbols-outlined modal-header-icon">edit_calendar</span>
                <div>
                  <h2 className="modal-title">File Correction</h2>
                  <p className="modal-subtitle">Request attendance record adjustment</p>
                </div>
              </div>
              <button className="modal-close" onClick={() => setIsModalOpen(false)}>
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">Correction Type</label>
                <select
                  className="form-input"
                  required
                  value={formData.correction_type}
                  onChange={e => setFormData({ ...formData, correction_type: e.target.value })}
                >
                  <option value="MISSED_SCAN">Missed Scan / Left Badge</option>
                  <option value="WRONG_SCAN">Scanned Wrong Door</option>
                  <option value="OTHER">Other System Error</option>
                </select>
              </div>

              <div className="modal-form-grid">
                <div className="form-group">
                  <label className="form-label">Date of Missing Event</label>
                  <input
                    type="date"
                    className="form-input"
                    required
                    value={formData.correction_date}
                    onChange={e => setFormData({ ...formData, correction_date: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Estimated Time</label>
                  <input
                    type="time"
                    className="form-input"
                    required
                    value={formData.proposed_time}
                    onChange={e => setFormData({ ...formData, proposed_time: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Explanation</label>
                <textarea
                  className="form-input"
                  rows="3"
                  required
                  placeholder="Brief explanation of what happened..."
                  value={formData.reason}
                  onChange={e => setFormData({ ...formData, reason: e.target.value })}
                />
              </div>

              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setIsModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Submit Correction
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
