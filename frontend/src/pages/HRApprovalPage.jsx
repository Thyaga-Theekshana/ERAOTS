import { useState, useEffect } from 'react';
import { correctionsAPI } from '../services/api';

export default function HRApprovalPage() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState({});

  useEffect(() => {
    fetchRequests();
  }, []);

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const res = await correctionsAPI.list('MANAGER_APPROVED');
      setRequests(res.data);
    } catch (err) {
      console.error('Failed to fetch requests', err);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id) => {
    try {
      await correctionsAPI.hrApprove(id, comment[id] || '');
      fetchRequests();
    } catch (err) {
      alert('Failed to approve');
    }
  };

  const handleReject = async (id) => {
    if (!comment[id]) {
      alert('Reason is required for rejection');
      return;
    }
    try {
      await correctionsAPI.hrReject(id, comment[id]);
      fetchRequests();
    } catch (err) {
      alert('Failed to reject');
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

      <div className="bento-grid">
        <div className="card glass bento-span-full">
          {loading ? (
            <div className="table-loading">
              <div className="loading-spinner"></div>
            </div>
          ) : requests.length === 0 ? (
            <div className="empty-state">
              <span className="material-symbols-outlined">done_all</span>
              <p>No manager-approved requests waiting for HR review.</p>
            </div>
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
