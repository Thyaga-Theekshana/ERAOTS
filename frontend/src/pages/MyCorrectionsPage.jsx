import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { correctionsAPI } from '../services/api';
import { useUIFeedback } from '../context/UIFeedbackContext';
import { TableSkeleton, EmptyStateStandard, ErrorStateStandard } from '../components/DataStates';

export default function MyCorrectionsPage() {
  const navigate = useNavigate();
  const ui = useUIFeedback();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState('');

  useEffect(() => {
    fetchMyRequests();
  }, []);

  const fetchMyRequests = async () => {
    setLoading(true);
    try {
      const res = await correctionsAPI.myCorrections();
      setPageError('');
      setRequests(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Failed to fetch requests', err);
      const detail = err.response?.data?.detail || 'Failed to load your correction requests.';
      setPageError(detail);
      ui.error(detail);
      setRequests([]);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'PENDING': return 'var(--warning)';
      case 'MANAGER_APPROVED': return 'var(--primary)';
      case 'HR_APPROVED': return 'var(--success)';
      case 'COMPLETED': return 'var(--success)';
      case 'REJECTED': return 'var(--error)';
      default: return 'var(--secondary)';
    }
  };

  return (
    <div className="page-container">
      <header className="page-header-premium">
        <div className="page-header-content">
          <span className="page-header-chip">ATTENDANCE</span>
          <h1 className="page-title-premium">My Correction Requests</h1>
          <p className="page-subtitle-premium">Track the status of your scan correction requests.</p>
        </div>
        <div className="page-header-actions">
          <button className="btn-primary" onClick={() => navigate('/corrections/request')}>
            <span className="material-symbols-outlined">add</span>
            New Request
          </button>
        </div>
      </header>

      {pageError && <ErrorStateStandard message={pageError} onRetry={fetchMyRequests} />}

      <div className="bento-grid">
        <div className="card glass-subtle bento-span-full">
          {loading ? (
            <TableSkeleton rows={6} columns={6} label="Loading your correction requests..." />
          ) : requests.length === 0 ? (
            <EmptyStateStandard
              icon="description"
              title="No correction requests yet"
              message="Your submitted correction requests will appear here."
            />
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Proposed Time</th>
                  <th>Status</th>
                  <th>Reason</th>
                  <th>Comments</th>
                </tr>
              </thead>
              <tbody>
                {requests.map(req => (
                  <tr key={req.request_id}>
                    <td>{new Date(req.correction_date).toLocaleDateString()}</td>
                    <td>{req.correction_type}</td>
                    <td>{new Date(req.proposed_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</td>
                    <td>
                      <span className="status-badge" style={{ background: `${getStatusColor(req.status)}20`, color: getStatusColor(req.status) }}>
                        {req.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td>{req.reason}</td>
                    <td>
                      {req.manager_comment && <div><small><strong>Mgr:</strong> {req.manager_comment}</small></div>}
                      {req.hr_comment && <div><small><strong>HR:</strong> {req.hr_comment}</small></div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
