import { useState, useEffect } from 'react';
import { correctionsAPI } from '../services/api';
import { useUIFeedback } from '../context/UIFeedbackContext';
import { TableSkeleton, EmptyStateStandard, ErrorStateStandard } from '../components/DataStates';

export default function HRApprovalPage() {
  const ui = useUIFeedback();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState({});
  const [pageError, setPageError] = useState('');

  useEffect(() => {
    fetchRequests();
  }, []);

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const res = await correctionsAPI.list('MANAGER_APPROVED');
      setPageError('');
      setRequests(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Failed to fetch requests', err);
      const detail = err.response?.data?.detail || 'Failed to load HR approval requests';
      setPageError(detail);
      ui.error(detail);
      setRequests([]);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id) => {
    try {
      await correctionsAPI.hrApprove(id, comment[id] || '');
      fetchRequests();
    } catch (err) {
      ui.error(err.response?.data?.detail || 'Failed to approve');
    }
  };

  const handleReject = async (id) => {
    if (!comment[id]) {
      ui.warning('Reason is required for rejection');
      return;
    }
    try {
      await correctionsAPI.hrReject(id, comment[id]);
      fetchRequests();
    } catch (err) {
      ui.error(err.response?.data?.detail || 'Failed to reject');
    }
  };

  return (
    <div className="page-container">
      <header className="page-header-premium">
        <div className="page-header-content">
          <span className="page-header-chip">HR ADMIN</span>
          <h1 className="page-title-premium">HR Approval: Corrections</h1>
          <p className="page-subtitle-premium">Final review and attendance recalculation for correction requests.</p>
        </div>
      </header>

      {pageError && <ErrorStateStandard message={pageError} onRetry={fetchRequests} />}

      <div className="bento-grid">
        <div className="card glass bento-span-full">
          {loading ? (
            <TableSkeleton rows={6} columns={7} label="Loading HR approval requests..." />
          ) : requests.length === 0 ? (
            <EmptyStateStandard
              icon="done_all"
              title="No requests awaiting HR review"
              message="Manager-approved requests will appear here for final review."
            />
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Proposed Time</th>
                  <th>Manager Comment</th>
                  <th>HR Comment</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {requests.map(req => (
                  <tr key={req.request_id}>
                    <td><strong>{req.employee_name}</strong></td>
                    <td>{new Date(req.correction_date).toLocaleDateString()}</td>
                    <td>{req.correction_type}</td>
                    <td>{new Date(req.proposed_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</td>
                    <td>{req.manager_comment || '-'}</td>
                    <td>
                      <input 
                        type="text" 
                        className="form-input" 
                        placeholder="Add comment..."
                        value={comment[req.request_id] || ''}
                        onChange={(e) => setComment({...comment, [req.request_id]: e.target.value})}
                        style={{padding: '0.25rem 0.5rem'}}
                      />
                    </td>
                    <td>
                      <div className="btn-group">
                        <button className="btn-icon" style={{color: 'var(--success)'}} onClick={() => handleApprove(req.request_id)}>
                          <span className="material-symbols-outlined">check_circle</span>
                        </button>
                        <button className="btn-icon" style={{color: 'var(--error)'}} onClick={() => handleReject(req.request_id)}>
                          <span className="material-symbols-outlined">cancel</span>
                        </button>
                      </div>
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
