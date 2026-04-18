/**
 * EmergencyNotification — FR9.4 Safety Check Modal.
 * Design System: Vigilant Glass (Bento + Glassmorphism)
 *
 * Displays a full-screen emergency safety prompt to employees when an
 * emergency is active and a safety check has been sent. Employees
 * confirm they are safe or request help.
 *
 * Props:
 *   emergency  {object}   Active emergency event object (or null)
 *   onRespond  {function} Called with ('YES' | 'NO') when employee responds
 *   loading    {boolean}  Disables buttons while request is in flight
 */
import { useEffect, useState } from 'react';

export default function EmergencyNotification({ emergency, onRespond, loading }) {
  const [pulse, setPulse] = useState(true);

  // Pulse animation every 1.5 s to draw attention
  useEffect(() => {
    const id = setInterval(() => setPulse(p => !p), 1500);
    return () => clearInterval(id);
  }, []);

  if (!emergency) return null;

  const emergencyTypeLabel = {
    FIRE: '🔥 Fire Emergency',
    DRILL: '📋 Emergency Drill',
    SECURITY: '🔒 Security Threat',
    OTHER: '⚠️ Emergency Alert',
  }[emergency.emergency_type] || '⚠️ Emergency Alert';

  return (
    <div className="emergency-modal-overlay" role="alertdialog" aria-modal="true" aria-label="Emergency Safety Check">
      {/* Full-screen glass panel */}
      <div className={`emergency-modal-card ${pulse ? 'emergency-modal-card--pulse' : ''}`}>

        {/* Header */}
        <div className="emergency-modal-header">
          <span className="material-symbols-outlined emergency-modal-icon">emergency</span>
          <div className="emergency-modal-header-text">
            <span className="page-header-chip" data-role="SUPER_ADMIN">SAFETY CHECK</span>
            <h1 className="emergency-modal-title">{emergencyTypeLabel}</h1>
            <p className="emergency-modal-subtitle">
              An emergency has been declared. Please confirm your safety status immediately.
            </p>
          </div>
        </div>

        {/* Emergency details */}
        <div className="emergency-modal-details">
          <div className="emergency-modal-detail-row">
            <span className="material-symbols-outlined">schedule</span>
            <span>
              Activated at{' '}
              <strong>{new Date(emergency.activation_time).toLocaleTimeString()}</strong>
            </span>
          </div>
          {emergency.notes && (
            <div className="emergency-modal-detail-row">
              <span className="material-symbols-outlined">info</span>
              <span>{emergency.notes}</span>
            </div>
          )}
          <div className="emergency-modal-detail-row">
            <span className="material-symbols-outlined">groups</span>
            <span>
              <strong>{emergency.headcount_at_activation}</strong> people were recorded inside when alert was triggered
            </span>
          </div>
        </div>

        {/* Call-to-action */}
        <p className="emergency-modal-cta">
          Are you currently safe and accounted for?
        </p>

        {/* Response buttons */}
        <div className="emergency-modal-actions">
          <button
            id="emergency-safe-btn"
            className="btn emergency-btn-safe"
            onClick={() => onRespond('YES')}
            disabled={loading}
            aria-label="I am safe"
          >
            <span className="material-symbols-outlined">verified_user</span>
            {loading ? 'Sending…' : "Yes, I'm Safe"}
          </button>

          <button
            id="emergency-danger-btn"
            className="btn emergency-btn-danger"
            onClick={() => onRespond('NO')}
            disabled={loading}
            aria-label="I need help"
          >
            <span className="material-symbols-outlined">sos</span>
            {loading ? 'Sending…' : 'No, I Need Help'}
          </button>
        </div>

        {/* Reassurance footer */}
        <p className="emergency-modal-footer">
          <span className="material-symbols-outlined">lock</span>
          Your response is sent directly to the emergency response team.
        </p>
      </div>
    </div>
  );
}