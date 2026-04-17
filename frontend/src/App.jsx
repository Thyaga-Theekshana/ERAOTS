/**
 * ERAOTS — Main Application Component.
 * Sets up routing, auth context, theme context, and navigation structure.
 * Design System: Vigilant Glass (Bento + Glassmorphism)
 */
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import AppLayout from './layouts/AppLayout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import EmployeesPage from './pages/EmployeesPage';
import DepartmentsPage from './pages/DepartmentsPage';
import AttendancePage from './pages/AttendancePage';
import SchedulesPage from './pages/SchedulesPage';
import CorrectionsPage from './pages/CorrectionsPage';
import NotificationsPage from './pages/NotificationsPage';
import EmergencyPage from './pages/EmergencyPage';
import ScannersPage from './pages/ScannersPage';
import AnalyticsPage from './pages/AnalyticsPage';
import SettingsPage from './pages/SettingsPage';
import ProfilePage from './pages/ProfilePage';
import MyAttendancePage from './pages/MyAttendancePage';
import MySchedulePage from './pages/MySchedulePage';
import TeamPage from './pages/TeamPage';
import DevToolsPage from './pages/DevToolsPage';
import PlaceholderPage from './pages/PlaceholderPage';
import PersonalInsightsPage from './pages/PersonalInsightsPage';
import CompanyInsightsPage from './pages/CompanyInsightsPage';
import SystemInsightsPage from './pages/SystemInsightsPage';
import './styles/index.css';
import HardwarePage from './pages/Hardwarepage';

/**
 * Protected route wrapper — redirects to login if not authenticated.
 */
function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: 'var(--surface)',
        color: 'var(--secondary)',
        fontFamily: 'var(--font-headline)',
        fontWeight: 600,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        fontSize: '0.75rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div className="pulse-indicator" />
          Loading...
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

/**
 * Role-based route wrapper — redirects to dashboard if user doesn't have required role.
 */
function RoleRoute({ children, allowedRoles }) {
  const { user } = useAuth();

  if (!allowedRoles.includes(user?.role)) {
    return <Navigate to="/" replace />;
  }

  return children;
}
function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Public */}
            <Route path="/login" element={<LoginPage />} />

            {/* Protected — inside the app layout */}
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              {/* Dashboard - everyone */}
              <Route index element={<DashboardPage />} />

              {/* Employee personal pages */}
              <Route path="my-profile" element={<ProfilePage />} />
              <Route path="my-attendance" element={<MyAttendancePage />} />
              <Route path="my-insights" element={<PersonalInsightsPage />} />
              <Route path="my-schedule" element={<MySchedulePage />} />

              {/* Manager team pages */}
              <Route path="team" element={
                <RoleRoute allowedRoles={['MANAGER']}>
                  <TeamPage />
                </RoleRoute>
              } />
              <Route path="team-attendance" element={
                <RoleRoute allowedRoles={['MANAGER']}>
                  <AttendancePage departmentScoped />
                </RoleRoute>
              } />
              <Route path="team-schedules" element={
                <RoleRoute allowedRoles={['MANAGER']}>
                  <SchedulesPage departmentScoped />
                </RoleRoute>
              } />

              {/* Admin/HR pages */}
              <Route path="employees" element={
                <RoleRoute allowedRoles={['HR_MANAGER', 'SUPER_ADMIN']}>
                  <EmployeesPage />
                </RoleRoute>
              } />
              <Route path="departments" element={
                <RoleRoute allowedRoles={['HR_MANAGER', 'SUPER_ADMIN']}>
                  <DepartmentsPage />
                </RoleRoute>
              } />
              <Route path="attendance" element={
                <RoleRoute allowedRoles={['HR_MANAGER', 'SUPER_ADMIN']}>
                  <AttendancePage />
                </RoleRoute>
              } />
              <Route path="schedules" element={
                <RoleRoute allowedRoles={['HR_MANAGER', 'SUPER_ADMIN']}>
                  <SchedulesPage />
                </RoleRoute>
              } />
              <Route path="scanners" element={
                <RoleRoute allowedRoles={['HR_MANAGER', 'SUPER_ADMIN']}>
                  <ScannersPage />
                </RoleRoute>
              } />

              {/* Hardware Health Monitoring - NEW */}
              <Route path="hardware" element={
                <RoleRoute allowedRoles={['HR_MANAGER', 'SUPER_ADMIN']}>
                  <HardwarePage />
                </RoleRoute>
              } />

              <Route path="emergency" element={
                <RoleRoute allowedRoles={['HR_MANAGER', 'SUPER_ADMIN']}>
                  <EmergencyPage />
                </RoleRoute>
              } />
              <Route path="analytics" element={
                <RoleRoute allowedRoles={['HR_MANAGER', 'SUPER_ADMIN']}>
                  <AnalyticsPage />
                </RoleRoute>
              } />
              <Route path="company-insights" element={
                <RoleRoute allowedRoles={['HR_MANAGER', 'SUPER_ADMIN']}>
                  <CompanyInsightsPage />
                </RoleRoute>
              } />
              <Route path="system-insights" element={
                <RoleRoute allowedRoles={['SUPER_ADMIN']}>
                  <SystemInsightsPage />
                </RoleRoute>
              } />
              <Route path="settings" element={
                <RoleRoute allowedRoles={['SUPER_ADMIN', 'HR_MANAGER']}>
                  <SettingsPage />
                </RoleRoute>
              } />

              {/* Super Admin dev tools */}
              <Route path="dev-tools" element={
                <RoleRoute allowedRoles={['SUPER_ADMIN']}>
                  <DevToolsPage />
                </RoleRoute>
              } />

              {/* Corrections - all roles but different views */}
              <Route path="corrections" element={<CorrectionsPage />} />

              {/* Notifications - everyone */}
              <Route path="notifications" element={<NotificationsPage />} />
            </Route>

            {/* Catch-all */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
