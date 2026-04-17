import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { correctionsAPI } from '../services/api';

export default function CorrectionFormPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  
  const [formData, setFormData] = useState({
    correction_date: '',
    correction_type: 'MISSED_SCAN',
    proposed_time: '',
    reason: ''
  });

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Need to format proposed_time to include the date and ISO format
      // proposed_time input is likely just "HH:mm", we must combine it.
      const datePart = formData.correction_date;
      const timePart = formData.proposed_time;
      if (!datePart || !timePart) {
        throw new Error("Date and Time are required.");
      }
      
      const isoDateTime = new Date(`${datePart}T${timePart}`).toISOString();

      await correctionsAPI.submit({
        correction_date: datePart,
        correction_type: formData.correction_type,
        proposed_time: isoDateTime,
        reason: formData.reason
      });

      setSuccess(true);
      setTimeout(() => navigate('/corrections/my'), 2000);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.detail || err.message || "Failed to submit request.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-container">
      <header className="page-header-premium">
        <div className="page-header-content">
          <span className="page-header-chip">ATTENDANCE</span>
          <h1 className="page-title-premium">Request Correction</h1>
          <p className="page-subtitle-premium">Submit a request for a missed or incorrect scan.</p>
        </div>
      </header>

      <div className="bento-grid">
        <div className="card glass">
          {success ? (
            <div className="empty-state">
              <span className="material-symbols-outlined" style={{color: 'var(--success)', fontSize: '3rem'}}>check_circle</span>
              <h3 style={{marginTop: '1rem', color: 'var(--success)'}}>Correction Request Submitted</h3>
              <p>Your request is now pending manager approval.</p>
              <button className="btn-secondary" onClick={() => navigate('/corrections/my')} style={{marginTop: '1rem'}}>
                View My Requests
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              {error && <div className="form-error" style={{color: 'var(--error)', marginBottom: '1rem'}}>{error}</div>}
              
              <div className="form-group" style={{marginBottom: '1rem'}}>
                <label className="form-label">Date of Missing/Incorrect Scan</label>
                <input 
                  type="date" 
                  className="form-input"
                  name="correction_date"
                  value={formData.correction_date}
                  onChange={handleChange}
                  required
                  max={new Date().toISOString().split('T')[0]}
                  style={{width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)'}}
                />
              </div>

              <div className="form-group" style={{marginBottom: '1rem'}}>
                <label className="form-label">Correction Type</label>
                <select 
                  className="form-input"
                  name="correction_type"
                  value={formData.correction_type}
                  onChange={handleChange}
                  required
                  style={{width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)'}}
                >
                  <option value="MISSED_SCAN">Missed Scan</option>
                  <option value="WRONG_SCAN">Wrong Scan / Hardware Error</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>

              <div className="form-group" style={{marginBottom: '1rem'}}>
                <label className="form-label">Proposed Time</label>
                <input 
                  type="time" 
                  className="form-input"
                  name="proposed_time"
                  value={formData.proposed_time}
                  onChange={handleChange}
                  required
                  style={{width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)'}}
                />
              </div>

              <div className="form-group" style={{marginBottom: '1.5rem'}}>
                <label className="form-label">Reason</label>
                <textarea 
                  className="form-input"
                  name="reason"
                  placeholder="Explain why this correction is needed..."
                  value={formData.reason}
                  onChange={handleChange}
                  required
                  minLength="10"
                  rows="4"
                  style={{width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)'}}
                />
              </div>

              <button 
                type="submit" 
                className="btn-primary" 
                disabled={loading}
                style={{width: '100%', padding: '0.75rem', justifyContent: 'center'}}
              >
                {loading ? 'Submitting...' : 'Submit Request'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
