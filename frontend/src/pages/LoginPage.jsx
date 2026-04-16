/**
 * Login Page — ERAOTS authentication screen.
 * Design System: Vigilant Glass (Bento + Glassmorphism)
 * Premium redesign for 1 Billion Tech pitch
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

// All 4 test accounts for quick access during development/testing
const DEMO_ACCOUNTS = [
  { label: 'Super Admin',    email: 'superadmin@eraots.com', password: 'super123', color: '#ef4444' },
  { label: 'HR Manager',     email: 'hr@eraots.com',         password: 'hr1234',   color: '#8b5cf6' },
  { label: 'Dept Manager',   email: 'manager@eraots.com',    password: 'mgr123',   color: '#f59e0b' },
  { label: 'Employee',       email: 'employee@eraots.com',   password: 'emp123',   color: '#10b981' },
];

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const { toggleTheme, isDark } = useTheme();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.detail || 'Authentication failed. Verify credentials.');
    } finally {
      setLoading(false);
    }
  };

  // Quick-fill a demo account without relying on browser autocomplete
  const fillDemo = (account) => {
    setEmail(account.email);
    setPassword(account.password);
    setError('');
  };

  return (
    <div className="login-page">
      {/* Ambient Background */}
      <div className="login-ambient" />
      
      {/* Theme Toggle */}
      <div className="login-theme-toggle">
        <button
          onClick={toggleTheme}
          className="theme-toggle-btn"
          title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        >
          <span className="material-symbols-outlined">
            {isDark ? 'light_mode' : 'dark_mode'}
          </span>
        </button>
      </div>

      {/* Main Login Card */}
      <div className="login-card">
        {/* Brand Header */}
        <div className="login-brand">
          <div className="login-brand-icon">
            <span
              className="material-symbols-outlined"
              style={{ fontSize: '2rem', fontVariationSettings: "'FILL' 1" }}
            >
              pulse_alert
            </span>
          </div>
          <div className="login-brand-text">
            <h1 className="login-brand-name">ERAOTS</h1>
            <span className="login-brand-tagline">Vigilant Glass</span>
          </div>
        </div>

        {/* Welcome Text */}
        <div className="login-welcome">
          <h2 className="login-title">Welcome Back</h2>
          <p className="login-subtitle">
            Enterprise Real-Time Attendance &amp; Occupancy Tracking System
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="login-alert login-alert-error">
            <span className="material-symbols-outlined">error</span>
            <span>{error}</span>
          </div>
        )}

        {/* Login Form — autocomplete="off" prevents browser from polluting fields between accounts */}
        <form onSubmit={handleSubmit} className="login-form" autoComplete="off">
          <div className="login-field">
            <label className="login-label">Email Address</label>
            <div className="login-input-wrapper">
              <span className="material-symbols-outlined login-input-icon">mail</span>
              <input
                id="login-email"
                type="email"
                className="login-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                required
                autoFocus
                autoComplete="off"
                name="eraots-email"
              />
            </div>
          </div>

          <div className="login-field">
            <label className="login-label">Password</label>
            <div className="login-input-wrapper">
              <span className="material-symbols-outlined login-input-icon">lock</span>
              <input
                id="login-password"
                type="password"
                className="login-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                autoComplete="new-password"
                name="eraots-password"
              />
            </div>
          </div>

          <button
            type="submit"
            className="login-submit"
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="login-spinner" />
                <span>Authenticating</span>
              </>
            ) : (
              <>
                <span>Sign In</span>
                <span className="material-symbols-outlined">arrow_forward</span>
              </>
            )}
          </button>
        </form>

        {/* Demo Credential Pills — click to instantly fill, no browser autocomplete needed */}
        <div className="login-hint">
          <div className="login-hint-header">
            <span className="material-symbols-outlined">manage_accounts</span>
            <span>Quick Access — Click to fill credentials</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '10px' }}>
            {DEMO_ACCOUNTS.map((acc) => (
              <button
                key={acc.email}
                type="button"
                onClick={() => fillDemo(acc)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  gap: '2px',
                  padding: '8px 10px',
                  borderRadius: '8px',
                  border: `1px solid ${acc.color}44`,
                  background: `${acc.color}11`,
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = `${acc.color}22`;
                  e.currentTarget.style.borderColor = acc.color;
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = `${acc.color}11`;
                  e.currentTarget.style.borderColor = `${acc.color}44`;
                }}
              >
                <span style={{ fontSize: '11px', fontWeight: 700, color: acc.color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {acc.label}
                </span>
                <span style={{ fontSize: '10px', color: 'var(--on-surface-variant)', fontFamily: 'monospace' }}>
                  {acc.email}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Version Footer */}
      <div className="login-footer">
        <span className="login-footer-dot" />
        <span>ERAOTS v1.0.0</span>
        <span className="login-footer-separator">•</span>
        <span>Vigilant Glass Design System</span>
      </div>
    </div>
  );
}
