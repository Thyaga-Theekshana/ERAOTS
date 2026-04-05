/**
 * ERAOTS — Main Application Component.
 * Sets up routing, auth context, and navigation structure.
 */
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import AppLayout from './layouts/AppLayout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import EmployeesPage from './pages/EmployeesPage';
import DepartmentsPage from './pages/DepartmentsPage';
import AttendancePage from './pages/AttendancePage';
import PlaceholderPage from './pages/PlaceholderPage';
import './index.css';

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
        background: 'var(--bg-primary)',
        color: 'var(--text-secondary)',
      }}>
        Loading...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

function App() {
  return (
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
            <Route index element={<DashboardPage />} />
            <Route path="employees" element={<EmployeesPage />} />
            <Route path="departments" element={<DepartmentsPage />} />
            <Route path="attendance" element={<AttendancePage />} />
            <Route path="schedules" element={<PlaceholderPage title="Schedules & Leave" description="Work schedules, leave requests, and team calendar view." />} />
            <Route path="scanners" element={<PlaceholderPage title="Scanner Management" description="Monitor biometric scanner hardware status and health." />} />
            <Route path="emergency" element={<PlaceholderPage title="Emergency Mode" description="One-click emergency evacuation mode with real-time headcount." />} />
            <Route path="analytics" element={<PlaceholderPage title="Analytics & Insights" description="Heatmaps, trend analysis, and occupancy forecasting." />} />
            <Route path="settings" element={<PlaceholderPage title="System Settings" description="Configure policies, office capacity, and notification preferences." />} />
          </Route>

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
