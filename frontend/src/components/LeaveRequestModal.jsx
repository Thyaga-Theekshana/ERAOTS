/**
 * LeaveRequestModal — Modal form for submitting leave requests.
 */
import { useState } from 'react';
import { leaveAPI } from '../services/api';

export default function LeaveRequestModal({ selectedDate, leaveTypes, leaveBalance, holidays = [], existingRequests = [], onClose, onSubmit }) {
  const [formData, setFormData] = useState({
    leave_type_id: leaveTypes[0]?.leave_type_id || '',
    start_date: selectedDate.toISOString().slice(0, 10),
    end_date: selectedDate.toISOString().slice(0, 10),
    is_half_day: false,
    half_day_session: 'AM',
    reason: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const selectedType = leaveTypes.find(t => t.leave_type_id === formData.leave_type_id);
  const balanceInfo = leaveBalance.find(b => b.leave_type_id === formData.leave_type_id);

  const holidaySet = new Set((holidays || []).map((h) => h.holiday_date));

  const isWeekend = (dateObj) => dateObj.getDay() === 0 || dateObj.getDay() === 6;

  const calculateDays = () => {
    const start = new Date(`${formData.start_date}T00:00:00`);
    const end = new Date(`${formData.end_date}T00:00:00`);
    if (start > end) return 0;
    let days = 0;
    const cursor = new Date(start);
    while (cursor <= end) {
      const key = cursor.toISOString().slice(0, 10);
      if (!isWeekend(cursor) && !holidaySet.has(key)) {
        days += 1;
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    if (formData.is_half_day) {
      return days > 0 ? 0.5 : 0;
    }
    return days;
  };

  const hasConflict = () => {
    const newStart = formData.start_date;
    const newEnd = formData.end_date;
    return existingRequests.some((req) => (
      ['PENDING', 'APPROVED'].includes(req.status) &&
      req.start_date <= newEnd &&
      req.end_date >= newStart
    ));
  };

  const days = calculateDays();
  const conflictExists = hasConflict();
  const projectedRemaining = balanceInfo && balanceInfo.remaining_days !== null
    ? Number(balanceInfo.remaining_days) - Number(days)
    : null;
  const canSubmit = days > 0 && formData.leave_type_id && 
                    !conflictExists &&
                    (!balanceInfo || balanceInfo.remaining_days === null || Number(balanceInfo.remaining_days) >= Number(days));

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'is_half_day' ? value === 'true' : value
    }));
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (new Date(formData.start_date) > new Date(formData.end_date)) {
      setError('Start date must be before or equal to end date');
      return;
    }

    if (formData.is_half_day && formData.start_date !== formData.end_date) {
      setError('Half-day leave requires same start and end date.');
      return;
    }

    if (conflictExists) {
      setError('You already have a pending or approved leave request in this date range.');
      return;
    }

    if (days <= 0) {
      setError('Selected date range contains only weekends or holidays.');
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
        is_half_day: formData.is_half_day,
        half_day_session: formData.is_half_day ? formData.half_day_session : null,
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
            <span className="days-count">({days} effective day{days !== 1 ? 's' : ''})</span>
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

          {/* Half Day Option */}
          <div className="form-group">
            <label htmlFor="is_half_day">
              <span className="material-symbols-outlined">timelapse</span>
              Duration Type
            </label>
            <select
              id="is_half_day"
              name="is_half_day"
              value={String(formData.is_half_day)}
              onChange={handleChange}
            >
              <option value="false">Full Day</option>
              <option value="true">Half Day</option>
            </select>
          </div>

          {formData.is_half_day && (
            <div className="form-group">
              <label htmlFor="half_day_session">
                <span className="material-symbols-outlined">schedule</span>
                Half Day Session
              </label>
              <select
                id="half_day_session"
                name="half_day_session"
                value={formData.half_day_session}
                onChange={handleChange}
              >
                <option value="AM">Morning (AM)</option>
                <option value="PM">Afternoon (PM)</option>
              </select>
            </div>
          )}

          {/* Days Summary */}
          <div className="days-summary">
            <span className="material-symbols-outlined">schedule</span>
            <span>
              <strong>{days}</strong> effective day{days !== 1 ? 's' : ''} requested
            </span>
          </div>

          {projectedRemaining !== null && (
            <div className={`days-summary ${projectedRemaining < 0 ? 'balance-info--zero' : ''}`}>
              <span className="material-symbols-outlined">monitoring</span>
              <span>Projected remaining balance: <strong>{Math.max(0, projectedRemaining)}</strong> days</span>
            </div>
          )}

          {conflictExists && (
            <div className="alert alert-error">
              <span className="material-symbols-outlined">warning</span>
              <span>Date conflict: existing pending/approved leave overlaps this request.</span>
            </div>
          )}

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
