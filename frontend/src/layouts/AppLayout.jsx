/**
 * AppLayout — sidebar navigation + main content area.
 */
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const navItems = [
  { section: 'Overview', items: [
    { to: '/', label: 'Dashboard', icon: '📊' },
  ]},
  { section: 'Management', items: [
    { to: '/employees', label: 'Employees', icon: '👥' },
    { to: '/departments', label: 'Departments', icon: '🏢' },
    { to: '/attendance', label: 'Attendance', icon: '📋' },
    { to: '/schedules', label: 'Schedules', icon: '📅' },
  ]},
  { section: 'Operations', items: [
    { to: '/scanners', label: 'Scanners', icon: '🔧' },
    { to: '/emergency', label: 'Emergency', icon: '🚨' },
    { to: '/analytics', label: 'Analytics', icon: '📈' },
  ]},
  { section: 'System', items: [
    { to: '/settings', label: 'Settings', icon: '⚙️' },
  ]},
];

export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="app-layout">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-logo">E</div>
          <div>
            <div className="sidebar-title">ERAOTS</div>
            <div className="sidebar-subtitle">Attendance System</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {navItems.map((section) => (
            <div key={section.section}>
              <div className="nav-section-title">{section.section}</div>
              {section.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                >
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        {/* User footer */}
        <div style={{
          padding: '1rem 1.25rem',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
        }}>
          <div style={{
            width: '32px',
            height: '32px',
            background: 'var(--primary)',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.8rem',
            fontWeight: '700',
            color: 'white',
          }}>
            {user?.full_name?.charAt(0) || 'U'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.full_name || 'User'}
            </div>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
              {user?.role?.replace('_', ' ') || 'Employee'}
            </div>
          </div>
          <button
            onClick={handleLogout}
            title="Logout"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '1.1rem',
              padding: '0.25rem',
            }}
          >
            🚪
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
