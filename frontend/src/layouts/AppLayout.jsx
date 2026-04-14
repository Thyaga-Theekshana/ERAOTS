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

  // ✅ NEW: Hardware Monitoring
  { to: '/hardware', label: 'Hardware Health', icon: 'monitor_heart', roles: ['HR_MANAGER', 'SUPER_ADMIN'] },

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
  const { user, logout, isAdmin, isSuperAdmin } = useAuth();
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

      {/* Sidebar */}
      <aside className="app-sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-brand-icon">
            <span className="material-symbols-outlined">pulse_alert</span>
          </div>
          <div className="sidebar-brand-text">
            <span className="sidebar-brand-name">ERAOTS</span>
            <span className="sidebar-brand-tagline">Vigilant Glass</span>
          </div>
        </div>

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

        <div className="sidebar-action">
          <button className="sidebar-action-btn" onClick={() => navigate('/analytics')}>
            <span className="sidebar-action-indicator" />
            <span>Live Analytics</span>
          </button>
        </div>

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
      </header>

      {/* Main */}
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}