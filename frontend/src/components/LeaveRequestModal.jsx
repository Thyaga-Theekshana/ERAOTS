/**
 * LeaveRequestModal — Modal form for submitting leave requests.
 */
import { useState } from 'react';
import { leaveAPI } from '../services/api';

export default function LeaveRequestModal({ selectedDate, leaveTypes, leaveBalance, onClose, onSubmit }) {
  const [formData, setFormData] = useState({
    leave_type_id: leaveTypes[0]?.leave_type_id || '',
    start_date: selectedDate.toISOString().slice(0, 10),
    end_date: selectedDate.toISOString().slice(0, 10),
    reason: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const selectedType = leaveTypes.find(t => t.leave_type_id === formData.leave_type_id);
  const balanceInfo = leaveBalance.find(b => b.leave_type_id === formData.leave_type_id);

  const calculateDays = () => {
    const start = new Date(formData.start_date);
    const end = new Date(formData.end_date);
    return Math.max(0, (end - start) / (1000 * 60 * 60 * 24) + 1);
  };

  const days = calculateDays();
  const canSubmit = days > 0 && formData.leave_type_id && 
                    (!balanceInfo || balanceInfo.remaining_days === null || balanceInfo.remaining_days >= days);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (new Date(formData.start_date) > new Date(formData.end_date)) {
      setError('Start date must be before or equal to end date');
      return;
    }

    if (balanceInfo && balanceInfo.remaining_days !== null && balanceInfo.remaining_days < days) {
      setError(`Insufficient leave balance. You have ${balanceInfo.remaining_days} days available but requested ${days} days.`);
      return;
    }

    setLoading(true);
    try {
      await leaveAPI.submitRequest({
        leave_type_id: formData.leave_type_id,
        start_date: formData.start_date,
        end_date: formData.end_date,
        reason: formData.reason || null,
      });
      setSuccess(true);
      setTimeout(() => {
        onSubmit();
      }, 1500);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to submit leave request. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content modal-content--success" onClick={e => e.stopPropagation()}>
          <div className="success-icon">
            <span className="material-symbols-outlined">check_circle</span>
          </div>
          <h2>Leave Request Submitted</h2>
          <p>Your leave request has been successfully submitted to your manager for approval.</p>
          <p className="request-summary">
            <strong>{selectedType?.name}</strong><br />
            {new Date(formData.start_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} - {new Date(formData.end_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            <br />
            <span className="days-count">({days} day{days !== 1 ? 's' : ''})</span>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>
            <span className="material-symbols-outlined">assignment</span>
            Submit Leave Request
          </h2>
          <button className="modal-close-btn" onClick={onClose}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="leave-request-form">
          {/* Leave Type Selection */}
          <div className="form-group">
            <label htmlFor="leave_type_id">
              <span className="material-symbols-outlined">category</span>
              Leave Type
            </label>
            <select
              id="leave_type_id"
              name="leave_type_id"
              value={formData.leave_type_id}
              onChange={handleChange}
              required
            >
              {leaveTypes.map(type => (
                <option key={type.leave_type_id} value={type.leave_type_id}>
                  {type.name}
                </option>
              ))}
            </select>
          </div>

          {/* Balance Info */}
          {balanceInfo && (
            <div className={`balance-info ${balanceInfo.remaining_days !== null && balanceInfo.remaining_days === 0 ? 'balance-info--zero' : balanceInfo.remaining_days !== null && balanceInfo.remaining_days <= 3 ? 'balance-info--low' : ''}`}>
              <div className="balance-row">
                <span>Available:</span>
                <strong>{balanceInfo.remaining_days !== null ? balanceInfo.remaining_days : 'Unlimited'} days</strong>
              </div>
              {balanceInfo.max_days && (
                <div className="balance-row">
                  <span>Total Allocation:</span>
                  <span>{balanceInfo.max_days} days/year</span>
                </div>
              )}
            </div>
          )}

          {/* Date Range */}
          <div className="form-group-row">
            <div className="form-group">
              <label htmlFor="start_date">
                <span className="material-symbols-outlined">event</span>
                From Date
              </label>
              <input
                type="date"
                id="start_date"
                name="start_date"
                value={formData.start_date}
                onChange={handleChange}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="end_date">
                <span className="material-symbols-outlined">event</span>
                To Date
              </label>
              <input
                type="date"
                id="end_date"
                name="end_date"
                value={formData.end_date}
                onChange={handleChange}
                required
              />
            </div>
          </div>

          {/* Days Summary */}
          <div className="days-summary">
            <span className="material-symbols-outlined">schedule</span>
            <span>
              <strong>{days}</strong> day{days !== 1 ? 's' : ''} requested
            </span>
          </div>

          {/* Reason */}
          <div className="form-group">
            <label htmlFor="reason">
              <span className="material-symbols-outlined">description</span>
              Reason (Optional)
            </label>
            <textarea
              id="reason"
              name="reason"
              value={formData.reason}
              onChange={handleChange}
              placeholder="Provide a reason for your leave request..."
              rows={3}
            ></textarea>
          </div>

          {/* Error Message */}
          {error && (
            <div className="alert alert-error">
              <span className="material-symbols-outlined">error</span>
              <span>{error}</span>
            </div>
          )}

          {/* Form Actions */}
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={loading || !canSubmit}>
              {loading ? (
                <>
                  <span className="loading-spinner"></span>
                  Submitting...
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined">send</span>
                  Submit Request
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
