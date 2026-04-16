/**
 * AppLayout — Premium Glassmorphic Layout with Fixed Header + Sidebar
 * Design System: Vigilant Glass (Bento + Glassmorphism)
 * Premium redesign for 1 Billion Tech pitch
 */
import { useState, useEffect, useRef, useMemo } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { employeeAPI, departmentAPI } from '../services/api';

// Navigation items with role requirements
const allNavItems = [
  {
  label: 'Hardware',
  icon: 'devices',
  path: '/hardware',
  requiredRoles: ['SUPER_ADMIN', 'HR_MANAGER', 'MANAGER'],
}
  // Everyone can see dashboard
  { to: '/', label: 'Dashboard', icon: 'grid_view', roles: ['EMPLOYEE', 'MANAGER', 'HR_MANAGER', 'SUPER_ADMIN'] },
  
  // Employee personal pages
  { to: '/my-profile', label: 'My Profile', icon: 'person', roles: ['EMPLOYEE'] },
  { to: '/my-attendance', label: 'My Attendance', icon: 'event_available', roles: ['EMPLOYEE'] },
  { to: '/my-schedule', label: 'My Schedule', icon: 'calendar_month', roles: ['EMPLOYEE'] },
  { to: '/corrections', label: 'My Corrections', icon: 'edit_note', roles: ['EMPLOYEE'] },
  
  // Manager department pages  
  { to: '/team', label: 'My Team', icon: 'group', roles: ['MANAGER'] },
  { to: '/team-attendance', label: 'Team Attendance', icon: 'event_available', roles: ['MANAGER'] },
  { to: '/team-schedules', label: 'Team Schedules', icon: 'calendar_month', roles: ['MANAGER'] },
  { to: '/corrections', label: 'Corrections', icon: 'edit_note', roles: ['MANAGER'] },
  
  // HR/Admin pages (full system access)
  { to: '/employees', label: 'Directory', icon: 'groups', roles: ['HR_MANAGER', 'SUPER_ADMIN'] },
  { to: '/departments', label: 'Departments', icon: 'corporate_fare', roles: ['HR_MANAGER', 'SUPER_ADMIN'] },
  { to: '/attendance', label: 'Attendance', icon: 'event_available', roles: ['HR_MANAGER', 'SUPER_ADMIN'] },
  { to: '/schedules', label: 'Schedules', icon: 'calendar_month', roles: ['HR_MANAGER', 'SUPER_ADMIN'] },
  { to: '/corrections', label: 'Corrections', icon: 'edit_note', roles: ['HR_MANAGER', 'SUPER_ADMIN'] },
  { to: '/scanners', label: 'Scanners', icon: 'sensors', roles: ['HR_MANAGER', 'SUPER_ADMIN'] },
  { to: '/emergency', label: 'Emergency', icon: 'emergency', roles: ['HR_MANAGER', 'SUPER_ADMIN'] },
  { to: '/analytics', label: 'Analytics', icon: 'monitoring', roles: ['HR_MANAGER', 'SUPER_ADMIN'] },
  { to: '/settings', label: 'Settings', icon: 'tune', roles: ['HR_MANAGER', 'SUPER_ADMIN'] },
  
  // Super Admin dev tools
  { to: '/dev-tools', label: 'Dev Tools', icon: 'code', roles: ['SUPER_ADMIN'] },
  
  // Notifications for everyone
  { to: '/notifications', label: 'Notifications', icon: 'notifications', roles: ['EMPLOYEE', 'MANAGER', 'HR_MANAGER', 'SUPER_ADMIN'] },
];

const getPageTitle = (pathname, navItems) => {
  const route = navItems.find(item => item.to === pathname);
  return route?.label || 'Dashboard';
};

export default function AppLayout() {
  const { user, logout, isAdmin, isSuperAdmin, isManager, hasRole } = useAuth();
  const { toggleTheme, isDark } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  
  // Filter nav items based on user role
  const navItems = useMemo(() => {
    const role = user?.role || 'EMPLOYEE';
    return allNavItems.filter(item => item.roles.includes(role));
  }, [user?.role]);
  
  // Global search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchRef = useRef(null);

  // Close search dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setShowSearchResults(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setShowSearchResults(false);
      return;
    }

    const timer = setTimeout(async () => {
      setSearchLoading(true);
      try {
        // Only admins can search employees/departments
        const canSearchAll = isAdmin || isSuperAdmin;
        
        const promises = canSearchAll 
          ? [employeeAPI.list({ search: searchQuery }), departmentAPI.list()]
          : [Promise.resolve({ data: [] }), Promise.resolve({ data: [] })];
          
        const [empRes, deptRes] = await Promise.all(promises);
        
        const employees = canSearchAll 
          ? (empRes.data || []).slice(0, 5).map(e => ({
              type: 'employee',
              id: e.employee_id,
              name: `${e.first_name} ${e.last_name}`,
              subtitle: e.department_name || 'No Department',
              icon: 'person',
              path: '/employees'
            }))
          : [];
        
        const departments = canSearchAll 
          ? (deptRes.data || [])
              .filter(d => d.name.toLowerCase().includes(searchQuery.toLowerCase()))
              .slice(0, 3)
              .map(d => ({
                type: 'department',
                id: d.department_id,
                name: d.name,
                subtitle: `${d.employee_count || 0} members`,
                icon: 'corporate_fare',
                path: '/departments'
              }))
          : [];
        
        // Add quick navigation results (filtered by role)
        const navMatches = navItems
          .filter(nav => nav.label.toLowerCase().includes(searchQuery.toLowerCase()))
          .slice(0, 3)
          .map(nav => ({
            type: 'page',
            id: nav.to,
            name: nav.label,
            subtitle: 'Navigate to page',
            icon: nav.icon,
            path: nav.to
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

  const currentPage = getPageTitle(location.pathname, navItems);

  return (
    <div className="app-container">
      <div className="app-ambient" aria-hidden="true" />

      {/* Fixed Sidebar */}
      <aside className="app-sidebar">
        {/* Brand */}
        <div className="sidebar-brand">
          <div className="sidebar-brand-icon">
            <span 
              className="material-symbols-outlined" 
              style={{ fontSize: '1.5rem', fontVariationSettings: "'FILL' 1" }}
            >
              pulse_alert
            </span>
          </div>
          <div className="sidebar-brand-text">
            <span className="sidebar-brand-name">ERAOTS</span>
            <span className="sidebar-brand-tagline">Vigilant Glass</span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
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

        {/* Live Feed Button - Navigate to real-time events section */}
        <div className="sidebar-action">
          <button className="sidebar-action-btn" onClick={() => navigate('/analytics')}>
            <span className="sidebar-action-indicator" />
            <span>Live Analytics</span>
          </button>
        </div>

        {/* Footer Links */}
        <div className="sidebar-footer">
          <button className="sidebar-footer-link" onClick={() => window.open('https://github.com/your-org/eraots/wiki', '_blank')}>
            <span className="material-symbols-outlined">help</span>
            <span>Help Center</span>
          </button>
          <button className="sidebar-footer-link" onClick={handleLogout}>
            <span className="material-symbols-outlined">logout</span>
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Fixed Header */}
      <header className="app-header">
        <div className="header-left">
          <h1 className="header-title">{currentPage}</h1>
        </div>
        
        <div className="header-right">
          {/* Search */}
          <div className="header-search" ref={searchRef}>
            <span className="material-symbols-outlined header-search-icon">search</span>
            <input 
              type="text" 
              className="header-search-input"
              placeholder="Search employees, departments..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => searchResults.length > 0 && setShowSearchResults(true)}
            />
            {searchLoading && <span className="header-search-loading" />}
            
            {/* Search Results Dropdown */}
            {showSearchResults && searchResults.length > 0 && (
              <div className="header-search-dropdown">
                {searchResults.map((result) => (
                  <button
                    key={`${result.type}-${result.id}`}
                    className="header-search-result"
                    onClick={() => handleSearchSelect(result)}
                  >
                    <span className="material-symbols-outlined header-search-result-icon">
                      {result.icon}
                    </span>
                    <div className="header-search-result-content">
                      <span className="header-search-result-name">{result.name}</span>
                      <span className="header-search-result-subtitle">{result.subtitle}</span>
                    </div>
                    <span className="header-search-result-type">{result.type}</span>
                  </button>
                ))}
              </div>
            )}
            
            {showSearchResults && searchResults.length === 0 && searchQuery.trim() && !searchLoading && (
              <div className="header-search-dropdown">
                <div className="header-search-empty">
                  <span className="material-symbols-outlined">search_off</span>
                  <span>No results found</span>
                </div>
              </div>
            )}
          </div>

          {/* Theme Toggle */}
          <div className="header-theme-toggle">
            <button
              onClick={() => !isDark && toggleTheme()}
              className={`header-theme-btn ${!isDark ? 'header-theme-btn--active' : ''}`}
              title="Light Mode"
            >
              <span className="material-symbols-outlined">light_mode</span>
            </button>
            <button
              onClick={() => isDark && toggleTheme()}
              className={`header-theme-btn ${isDark ? 'header-theme-btn--active' : ''}`}
              title="Dark Mode"
            >
              <span className="material-symbols-outlined">dark_mode</span>
            </button>
          </div>

          {/* Notifications */}
          <button 
            className="header-icon-btn"
            onClick={() => navigate('/notifications')}
            title="Notifications"
          >
            <span className="material-symbols-outlined">notifications</span>
            <span className="header-notification-dot" />
          </button>

          {/* Settings */}
          <button 
            className="header-icon-btn"
            onClick={() => navigate('/settings')}
            title="Settings"
          >
            <span className="material-symbols-outlined">settings</span>
          </button>

          {/* Divider */}
          <div className="header-divider" />

          {/* User Profile */}
          <div className="header-user">
            <div className="header-user-info">
              <span className="header-user-name">{user?.full_name || 'User'}</span>
              <span className="header-user-role">{user?.role?.replace('_', ' ') || 'Employee'}</span>
            </div>
            <div className="header-user-avatar">
              {user?.full_name?.charAt(0)?.toUpperCase() || 'U'}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="app-main">
        <div className="app-content">
          <div key={location.pathname} className="page-transition-layer">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}
