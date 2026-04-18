import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { correctionsAPI } from '../services/api';

export default function MyCorrectionsPage() {
  const navigate = useNavigate();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMyRequests();
  }, []);

  const fetchMyRequests = async () => {
    setLoading(true);
    try {
      const res = await correctionsAPI.myCorrections();
      setRequests(res.data);
    } catch (err) {
      console.error('Failed to fetch requests', err);
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

      <div className="bento-grid">
        <div className="card glass-subtle bento-span-full">
          {loading ? (
            <div className="table-loading">
              <div className="loading-spinner"></div>
            </div>
          ) : requests.length === 0 ? (
            <div className="empty-state">
              <span className="material-symbols-outlined">description</span>
              <p>You haven't submitted any correction requests.</p>
            </div>
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
