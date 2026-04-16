/**
 * AppLayout — Vigilant Glass Layout with Role-Aware Dual Portal Navigation.
 *
 * Navigation Architecture:
 *  SUPER_ADMIN   → Sparse maintenance nav (not a daily user)
 *  HR_MANAGER    → Managerial (company-wide) ↔ Personal toggle
 *  MANAGER       → Managerial (dept-scoped)  ↔ Personal toggle
 *  EMPLOYEE      → Personal pages only
 */
import { useState, useEffect, useRef, useMemo } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { employeeAPI, departmentAPI } from '../services/api';

// ─── Navigation config per role + portal ─────────────────────────────────────

const NAV_SUPER_ADMIN = [
  { to: '/',          label: 'Live Overview',    icon: 'pulse_alert' },
  { to: '/scanners',  label: 'Scanners',         icon: 'sensors' },
  { to: '/hardware',  label: 'Hardware Health',  icon: 'monitor_heart' },
  { to: '/settings',  label: 'System Config',    icon: 'tune' },
  { to: '/dev-tools', label: 'Dev Tools',        icon: 'code' },
  { to: '/notifications', label: 'Alerts',       icon: 'notifications' },
];

const NAV_HR_MANAGERIAL = [
  { to: '/',           label: 'Dashboard',    icon: 'grid_view' },
  { to: '/employees',  label: 'Directory',    icon: 'groups' },
  { to: '/departments',label: 'Departments',  icon: 'corporate_fare' },
  { to: '/attendance', label: 'Attendance',   icon: 'event_available' },
  { to: '/schedules',  label: 'Schedules',    icon: 'calendar_month' },
  { to: '/corrections',label: 'Corrections',  icon: 'edit_note' },
  { to: '/analytics',  label: 'Analytics',    icon: 'monitoring' },
  { to: '/emergency',  label: 'Emergency',    icon: 'emergency' },
  { to: '/hardware',   label: 'Hardware',     icon: 'monitor_heart' },
  { to: '/settings',   label: 'HR Policies',  icon: 'policy' },
  { to: '/notifications', label: 'Notifications', icon: 'notifications' },
];

const NAV_HR_PERSONAL = [
  { to: '/',              label: 'Dashboard',      icon: 'grid_view' },
  { to: '/my-profile',    label: 'My Profile',     icon: 'person' },
  { to: '/my-attendance', label: 'My Attendance',  icon: 'event_available' },
  { to: '/my-schedule',   label: 'My Schedule',    icon: 'calendar_month' },
  { to: '/corrections',   label: 'My Corrections', icon: 'edit_note' },
  { to: '/notifications', label: 'Notifications',  icon: 'notifications' },
];

const NAV_MANAGER_MANAGERIAL = [
  { to: '/',                label: 'Dashboard',       icon: 'grid_view' },
  { to: '/team',            label: 'My Team',         icon: 'group' },
  { to: '/team-attendance', label: 'Team Attendance', icon: 'event_available' },
  { to: '/team-schedules',  label: 'Team Schedules',  icon: 'calendar_month' },
  { to: '/corrections',     label: 'Corrections',     icon: 'edit_note' },
  { to: '/notifications',   label: 'Notifications',   icon: 'notifications' },
];

const NAV_MANAGER_PERSONAL = [
  { to: '/',              label: 'Dashboard',      icon: 'grid_view' },
  { to: '/my-profile',    label: 'My Profile',     icon: 'person' },
  { to: '/my-attendance', label: 'My Attendance',  icon: 'event_available' },
  { to: '/my-schedule',   label: 'My Schedule',    icon: 'calendar_month' },
  { to: '/corrections',   label: 'My Corrections', icon: 'edit_note' },
  { to: '/notifications', label: 'Notifications',  icon: 'notifications' },
];

const NAV_EMPLOYEE = [
  { to: '/',              label: 'Dashboard',      icon: 'grid_view' },
  { to: '/my-profile',    label: 'My Profile',     icon: 'person' },
  { to: '/my-attendance', label: 'My Attendance',  icon: 'event_available' },
  { to: '/my-schedule',   label: 'My Schedule',    icon: 'calendar_month' },
  { to: '/corrections',   label: 'My Corrections', icon: 'edit_note' },
  { to: '/notifications', label: 'Notifications',  icon: 'notifications' },
];

function getNavItems(role, portalMode) {
  switch (role) {
    case 'SUPER_ADMIN': return NAV_SUPER_ADMIN;
    case 'HR_MANAGER':  return portalMode === 'managerial' ? NAV_HR_MANAGERIAL : NAV_HR_PERSONAL;
    case 'MANAGER':     return portalMode === 'managerial' ? NAV_MANAGER_MANAGERIAL : NAV_MANAGER_PERSONAL;
    default:            return NAV_EMPLOYEE;
  }
}

// Portal toggle button labels
function getPortalToggleLabel(role, portalMode) {
  if (portalMode === 'managerial') {
    return { label: 'Personal Portal', icon: 'person' };
  }
  return role === 'HR_MANAGER'
    ? { label: 'HR Management', icon: 'admin_panel_settings' }
    : { label: 'Team Management', icon: 'group' };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AppLayout() {
  const { user, logout, isAdmin, isSuperAdmin, hasDualPortal, portalMode, togglePortalMode } = useAuth();
  const { toggleTheme, isDark } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const role = user?.role || 'EMPLOYEE';
  const navItems = useMemo(() => getNavItems(role, portalMode), [role, portalMode]);
  const toggleLabel = useMemo(() => getPortalToggleLabel(role, portalMode), [role, portalMode]);

  // Global search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setShowSearchResults(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setShowSearchResults(false);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const canSearchAll = isAdmin || isSuperAdmin;
        const promises = canSearchAll
          ? [employeeAPI.list({ search: searchQuery }), departmentAPI.list()]
          : [Promise.resolve({ data: [] }), Promise.resolve({ data: [] })];
        const [empRes, deptRes] = await Promise.all(promises);

        const employees = canSearchAll
          ? (empRes.data || []).slice(0, 5).map(e => ({
              type: 'employee', id: e.employee_id,
              name: `${e.first_name} ${e.last_name}`,
              subtitle: e.department_name || 'No Department',
              icon: 'person', path: '/employees'
            }))
          : [];

        const departments = canSearchAll
          ? (deptRes.data || [])
              .filter(d => d.name.toLowerCase().includes(searchQuery.toLowerCase()))
              .slice(0, 3)
              .map(d => ({
                type: 'department', id: d.department_id,
                name: d.name, subtitle: `${d.employee_count || 0} members`,
                icon: 'corporate_fare', path: '/departments'
              }))
          : [];

        const navMatches = navItems
          .filter(nav => nav.label.toLowerCase().includes(searchQuery.toLowerCase()))
          .slice(0, 3)
          .map(nav => ({
            type: 'page', id: nav.to,
            name: nav.label, subtitle: 'Navigate to page',
            icon: nav.icon, path: nav.to
          }));

        setSearchResults([...employees, ...departments, ...navMatches]);
        setShowSearchResults(true);
      } catch (err) {
        console.error('Search failed:', err);
      } finally {
        setSearchLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, isAdmin, isSuperAdmin, navItems]);

  const handleSearchSelect = (result) => {
    setShowSearchResults(false);
    setSearchQuery('');
    navigate(result.path);
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const currentPage = navItems.find(i => i.to === location.pathname)?.label || 'Dashboard';

  // Portal mode badge text
  const portalBadge = hasDualPortal
    ? (portalMode === 'managerial' ? (role === 'HR_MANAGER' ? 'HR Management' : 'Team Management') : 'Personal')
    : null;

  return (
    <div className="app-container">
      <div className="app-ambient" aria-hidden="true" />

      {/* Sidebar */}
      <aside className="app-sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-brand-icon">
            <span className="material-symbols-outlined">pulse_alert</span>
          </div>
          <div className="sidebar-brand-text">
            <span className="sidebar-brand-name">ERAOTS</span>
            <span className="sidebar-brand-tagline">
              {portalBadge || (role === 'SUPER_ADMIN' ? 'System Admin' : 'Vigilant Glass')}
            </span>
          </div>
        </div>

        {/* Portal mode badge for dual-portal users */}
        {hasDualPortal && (
          <div style={{
            margin: '0 12px 8px',
            padding: '4px 10px',
            borderRadius: '20px',
            fontSize: '10px',
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            textAlign: 'center',
            background: portalMode === 'managerial'
              ? 'var(--primary-container, rgba(99,102,241,0.15))'
              : 'var(--status-active, rgba(16,185,129,0.15))',
            color: portalMode === 'managerial' ? 'var(--primary)' : 'var(--status-active)',
            border: `1px solid ${portalMode === 'managerial' ? 'var(--primary)' : 'var(--status-active)'}`,
          }}>
            {portalMode === 'managerial' ? '⚡ Managerial' : '👤 Personal'}
          </div>
        )}

        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to + item.label}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `sidebar-nav-item ${isActive ? 'sidebar-nav-item--active' : ''}`
              }
            >
              <span className="material-symbols-outlined sidebar-nav-icon">
                {item.icon}
              </span>
              <span className="sidebar-nav-label">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Portal toggle — only for HR and Manager */}
        {hasDualPortal && (
          <div style={{ padding: '0 12px 8px' }}>
            <button
              onClick={togglePortalMode}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 12px',
                borderRadius: '10px',
                border: '1px solid var(--primary)',
                background: 'transparent',
                color: 'var(--primary)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'background 0.2s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--primary-container, rgba(99,102,241,0.1))'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                {toggleLabel.icon}
              </span>
              {toggleLabel.label}
            </button>
          </div>
        )}

        <div className="sidebar-footer">
          <button className="sidebar-footer-link" onClick={handleLogout}>
            <span className="material-symbols-outlined">logout</span>
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Header */}
      <header className="app-header">
        <h1>{currentPage}</h1>

        {/* Search bar — hidden for SUPER_ADMIN (not a daily user) */}
        {role !== 'SUPER_ADMIN' && (
          <div className="header-search" ref={searchRef} style={{ position: 'relative' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--on-surface-variant)' }}>search</span>
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onFocus={() => searchQuery && setShowSearchResults(true)}
              style={{
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'var(--on-surface)',
                fontSize: '14px',
                width: '180px',
              }}
            />
            {showSearchResults && searchResults.length > 0 && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                marginTop: '8px',
                background: 'var(--surface-elevated)',
                borderRadius: '12px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
                border: '1px solid var(--border)',
                zIndex: 100,
                overflow: 'hidden',
              }}>
                {searchResults.map(r => (
                  <button
                    key={r.id}
                    onClick={() => handleSearchSelect(r)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '10px 14px',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--on-surface)',
                      textAlign: 'left',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-variant)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '16px', color: 'var(--primary)' }}>{r.icon}</span>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600 }}>{r.name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--on-surface-variant)' }}>{r.subtitle}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
          <button
            onClick={toggleTheme}
            className="btn-icon"
            title="Toggle theme"
          >
            <span className="material-symbols-outlined">{isDark ? 'light_mode' : 'dark_mode'}</span>
          </button>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 12px',
            borderRadius: '20px',
            background: 'var(--surface-variant)',
            fontSize: '13px',
            fontWeight: 600,
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: '16px', color: 'var(--primary)' }}>account_circle</span>
            <span>{user?.full_name?.split(' ')[0]}</span>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}