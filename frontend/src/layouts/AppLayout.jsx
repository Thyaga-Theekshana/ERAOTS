/**
 * AppLayout — Vigilant Glass Layout with Role-Aware Dual Portal Navigation.
 *
 * Design System: Vigilant Glass (Bento + Glassmorphism)
 * - Zero inline styles — every visual decision is a CSS class from index.css
 * - Typography: Space Grotesk (font-headline) / Sora (font-body)
 * - Icons: Material Symbols Outlined, filled weight for active states
 * - No explicit border/divider lines — separation via tonal layers only
 *
 * Navigation Architecture:
 *  SUPER_ADMIN → System nav + personal schedule (no portal toggle)
 *  HR_MANAGER  → Managerial + personal schedule ↔ Personal portal toggle
 *  MANAGER     → Team management (6 items) ↔ Personal (6 items) toggle
 *  EMPLOYEE    → Personal pages only (6 items, no toggle)
 */
import { useState, useEffect, useRef, useMemo } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { employeeAPI, departmentAPI } from '../services/api';
import NotificationBell from '../components/notifications/NotificationBell';
import BrandLogo from '../components/BrandLogo';

// ─── Navigation definitions ────────────────────────────────────────────────

const NAV_SUPER_ADMIN = [
  { to: '/',                label: 'Dashboard',      icon: 'pulse_alert' },
  { to: '/directory',       label: 'Directory Hub',  icon: 'groups' },
  { to: '/attendance-hub',  label: 'Attendance Hub', icon: 'event_available' },
  { to: '/schedule-hub',    label: 'Schedule Hub',   icon: 'calendar_month' },
  { to: '/corrections-hub', label: 'Corrections',    icon: 'edit_note' },
  { to: '/insights-hub',    label: 'Insights',       icon: 'monitoring' },
  { to: '/communications',  label: 'Comms Hub',      icon: 'notifications' },
  { to: '/hardware',        label: 'Hardware',       icon: 'monitor_heart' },
  { to: '/settings',        label: 'System Config',  icon: 'tune' },
  { to: '/dev-tools',       label: 'Dev Tools',      icon: 'code' },
];

const NAV_HR_MANAGERIAL = [
  { to: '/',               label: 'Dashboard',      icon: 'grid_view' },
  { to: '/directory',      label: 'Directory Hub',  icon: 'groups' },
  { to: '/attendance-hub', label: 'Attendance Hub', icon: 'event_available' },
  { to: '/schedule-hub',   label: 'Schedule Hub',   icon: 'calendar_month' },
  { to: '/corrections-hub',label: 'Corrections',    icon: 'edit_note' },
  { to: '/insights-hub',   label: 'Insights',       icon: 'monitoring' },
  { to: '/communications', label: 'Comms Hub',      icon: 'notifications' },
  { to: '/emergency',      label: 'Emergency',      icon: 'emergency' },
  { to: '/settings',       label: 'HR Policies',    icon: 'policy' },
];

const NAV_HR_PERSONAL = [
  { to: '/',               label: 'Dashboard',      icon: 'grid_view' },
  { to: '/my-profile',     label: 'My Profile',     icon: 'person' },
  { to: '/attendance-hub', label: 'Attendance',     icon: 'event_available' },
  { to: '/schedule-hub',   label: 'Schedule',       icon: 'calendar_month' },
  { to: '/corrections-hub',label: 'Corrections',    icon: 'edit_note' },
  { to: '/insights-hub',   label: 'Insights',       icon: 'analytics' },
  { to: '/communications', label: 'Comms Hub',      icon: 'notifications' },
];

const NAV_MANAGER_MANAGERIAL = [
  { to: '/',                label: 'Dashboard',      icon: 'grid_view' },
  { to: '/team',            label: 'My Team',        icon: 'group' },
  { to: '/attendance-hub',  label: 'Attendance Hub', icon: 'event_available' },
  { to: '/schedule-hub',    label: 'Schedule Hub',   icon: 'calendar_month' },
  { to: '/corrections-hub', label: 'Corrections',    icon: 'edit_note' },
  { to: '/insights-hub',    label: 'Insights',       icon: 'analytics' },
  { to: '/settings',        label: 'Team Policies',  icon: 'policy' },
  { to: '/communications',  label: 'Comms Hub',      icon: 'notifications' },
];

const NAV_MANAGER_PERSONAL = [
  { to: '/',               label: 'Dashboard',      icon: 'grid_view' },
  { to: '/my-profile',     label: 'My Profile',     icon: 'person' },
  { to: '/attendance-hub', label: 'Attendance',     icon: 'event_available' },
  { to: '/schedule-hub',   label: 'Schedule',       icon: 'calendar_month' },
  { to: '/corrections-hub',label: 'Corrections',    icon: 'edit_note' },
  { to: '/insights-hub',   label: 'Insights',       icon: 'analytics' },
  { to: '/communications', label: 'Comms Hub',      icon: 'notifications' },
];

const NAV_EMPLOYEE = [
  { to: '/',               label: 'Dashboard',      icon: 'grid_view' },
  { to: '/my-profile',     label: 'My Profile',     icon: 'person' },
  { to: '/attendance-hub', label: 'Attendance',     icon: 'event_available' },
  { to: '/schedule-hub',   label: 'Schedule',       icon: 'calendar_month' },
  { to: '/corrections-hub',label: 'Corrections',    icon: 'edit_note' },
  { to: '/insights-hub',   label: 'Insights',       icon: 'analytics' },
  { to: '/communications', label: 'Comms Hub',      icon: 'notifications' },
];

function getNavItems(role, portalMode) {
  switch (role) {
    case 'SUPER_ADMIN': return NAV_SUPER_ADMIN;
    case 'HR_MANAGER':  return portalMode === 'managerial' ? NAV_HR_MANAGERIAL : NAV_HR_PERSONAL;
    case 'MANAGER':     return portalMode === 'managerial' ? NAV_MANAGER_MANAGERIAL : NAV_MANAGER_PERSONAL;
    default:            return NAV_EMPLOYEE;
  }
}

// Portal toggle: label + icon for the *destination* portal (what you'll switch TO)
function getPortalToggleConfig(role, portalMode) {
  if (portalMode === 'managerial') {
    return { label: 'Personal Portal', icon: 'person' };
  }
  return role === 'HR_MANAGER'
    ? { label: 'HR Management', icon: 'admin_panel_settings' }
    : { label: 'Team Management', icon: 'group' };
}

// Sidebar brand tagline text
function getSidebarTagline(role, portalMode) {
  if (role === 'SUPER_ADMIN') return 'System Admin';
  if (role === 'HR_MANAGER')  return portalMode === 'managerial' ? 'HR Management' : 'Personal View';
  if (role === 'MANAGER')     return portalMode === 'managerial' ? 'Team Management' : 'Personal View';
  return 'Vigilant Glass';
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AppLayout() {
  const {
    user, logout,
    isAdmin, isSuperAdmin,
    hasDualPortal, portalMode, togglePortalMode,
  } = useAuth();
  const { toggleTheme, isDark } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const role       = user?.role || 'EMPLOYEE';
  const navItems   = useMemo(() => getNavItems(role, portalMode), [role, portalMode]);
  const toggleCfg  = useMemo(() => getPortalToggleConfig(role, portalMode), [role, portalMode]);
  const tagline    = useMemo(() => getSidebarTagline(role, portalMode), [role, portalMode]);

  // Global search
  const [searchQuery, setSearchQuery]         = useState('');
  const [searchResults, setSearchResults]     = useState([]);
  const [showSearchResults, setShowSearch]    = useState(false);
  const [searchLoading, setSearchLoading]     = useState(false);
  const searchRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setShowSearch(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setShowSearch(false);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const canSearchAll = isAdmin || isSuperAdmin;
        const [empRes, deptRes] = await Promise.all([
          canSearchAll ? employeeAPI.list({ search: searchQuery }) : Promise.resolve({ data: [] }),
          canSearchAll ? departmentAPI.list() : Promise.resolve({ data: [] }),
        ]);

        const employees = (empRes.data || []).slice(0, 5).map(e => ({
          type: 'employee', id: e.employee_id,
          name: `${e.first_name} ${e.last_name}`,
          sub: e.department_name || 'No Department',
          icon: 'person', path: '/employees',
        }));

        const departments = (deptRes.data || [])
          .filter(d => d.name.toLowerCase().includes(searchQuery.toLowerCase()))
          .slice(0, 3)
          .map(d => ({
            type: 'department', id: d.department_id,
            name: d.name, sub: `${d.employee_count || 0} members`,
            icon: 'corporate_fare', path: '/departments',
          }));

        const navMatches = navItems
          .filter(n => n.label.toLowerCase().includes(searchQuery.toLowerCase()))
          .slice(0, 3)
          .map(n => ({
            type: 'page', id: n.to,
            name: n.label, sub: 'Navigate to page',
            icon: n.icon, path: n.to,
          }));

        setSearchResults([...employees, ...departments, ...navMatches]);
        setShowSearch(true);
      } catch (err) {
        console.error('Search failed:', err);
      } finally {
        setSearchLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, isAdmin, isSuperAdmin, navItems]);

  const handleSearchSelect = (result) => {
    setShowSearch(false);
    setSearchQuery('');
    navigate(result.path);
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const currentPage = navItems.find(i => i.to === location.pathname)?.label || 'Dashboard';

  return (
    <div className="app-container">
      <div className="app-ambient" aria-hidden="true" />

      {/* ── Sidebar ─────────────────────────────────────────── */}
      <aside className="app-sidebar">

        {/* Brand */}
        <div className="sidebar-brand">
          <BrandLogo variant="sidebar" />
          <div className="sidebar-brand-text">
            <span className="sidebar-brand-name">ERAOTS</span>
            <span className="sidebar-brand-tagline">{tagline}</span>
          </div>
        </div>

        {/* Portal mode badge — HR / Manager only */}
        {hasDualPortal && (
          <div className={`portal-badge ${
            portalMode === 'managerial' ? 'portal-badge--managerial' : 'portal-badge--personal'
          }`}>
            {portalMode === 'managerial' ? 'Managerial' : 'Personal'}
          </div>
        )}

        {/* Navigation */}
        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <NavLink
              key={`${item.to}-${item.label}`}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `sidebar-nav-item${isActive ? ' sidebar-nav-item--active' : ''}`
              }
            >
              <span
                className="material-symbols-outlined sidebar-nav-icon"
                style={{ fontVariationSettings: "'FILL' 0, 'wght' 400" }}
              >
                {item.icon}
              </span>
              <span className="sidebar-nav-label">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Portal toggle — HR Manager and Dept Manager only */}
        {hasDualPortal && (
          <div className="sidebar-portal-section">
            <button className="portal-toggle-btn" onClick={togglePortalMode}>
              <span className="material-symbols-outlined">{toggleCfg.icon}</span>
              {toggleCfg.label}
            </button>
          </div>
        )}

        {/* Sidebar footer */}
        <div className="sidebar-footer">
          <button className="sidebar-footer-link" onClick={handleLogout}>
            <span className="material-symbols-outlined">logout</span>
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* ── Header ──────────────────────────────────────────── */}
      <header className="app-header">
        <h1 className="header-title">{currentPage}</h1>

        {/* Search — hidden for SUPER_ADMIN (maintenance user, not daily) */}
        {role !== 'SUPER_ADMIN' && (
          <div className="header-search" ref={searchRef}>
            <span className="material-symbols-outlined header-search-icon">search</span>
            <input
              className="header-search-input"
              type="text"
              placeholder="Search…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onFocus={() => searchQuery && setShowSearch(true)}
            />
            {showSearchResults && searchResults.length > 0 && (
              <div className="search-dropdown">
                {searchResults.map(r => (
                  <button
                    key={r.id}
                    className="search-dropdown-item"
                    onClick={() => handleSearchSelect(r)}
                  >
                    <span className="material-symbols-outlined search-dropdown-item-icon">
                      {r.icon}
                    </span>
                    <div>
                      <div className="search-dropdown-item-name">{r.name}</div>
                      <div className="search-dropdown-item-sub">{r.sub}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="header-right">
          <NotificationBell />
          <button className="btn-icon" onClick={toggleTheme} title="Toggle theme">
            <span className="material-symbols-outlined">
              {isDark ? 'light_mode' : 'dark_mode'}
            </span>
          </button>
          <div className="header-user-chip">
            <span className="material-symbols-outlined">account_circle</span>
            {user?.full_name?.split(' ')[0]}
          </div>
        </div>
      </header>

      {/* ── Main content ────────────────────────────────────── */}
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
