import { useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import AttendancePage from './AttendancePage';
import MyAttendancePage from './MyAttendancePage';

export default function AttendanceHubPage() {
  const { isEmployee, isManager, isAdmin } = useAuth();

  const tabs = useMemo(() => {
    const allTabs = [
      {
        key: 'personal',
        label: 'My Attendance',
        subtitle: 'Personal timeline, hours, and attendance trend',
        show: true,
        render: () => <MyAttendancePage />,
      },
      {
        key: 'team',
        label: 'Team Attendance',
        subtitle: 'Department scoped attendance operations for managers',
        show: isManager && !isAdmin,
        render: () => <AttendancePage departmentScoped />,
      },
      {
        key: 'org',
        label: 'Organization Attendance',
        subtitle: 'Company-wide attendance processing and exports',
        show: isAdmin,
        render: () => <AttendancePage />,
      },
    ];

    return allTabs.filter((tab) => tab.show);
  }, [isManager, isAdmin]);

  const initialTab = tabs[0]?.key || 'personal';
  const [activeTab, setActiveTab] = useState(initialTab);
  const currentTab = tabs.find((tab) => tab.key === activeTab) || tabs[0];

  if (!currentTab) {
    return null;
  }

  return (
    <div className="hub-shell">
      <header className="hub-shell-header">
        <div>
          <span className="hub-shell-chip">FR4 ATTENDANCE REPORTING</span>
          <h1 className="hub-shell-title">Attendance Hub</h1>
          <p className="hub-shell-subtitle">
            {isEmployee
              ? 'Your attendance operations in one focused workspace'
              : 'Role-aware attendance operations with shared workflow design'}
          </p>
        </div>
      </header>

      {tabs.length > 1 && (
        <section className="hub-tabs" aria-label="Attendance views">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              className={`hub-tab ${activeTab === tab.key ? 'hub-tab--active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
              type="button"
            >
              <span className="hub-tab-label">{tab.label}</span>
            </button>
          ))}
        </section>
      )}

      <section className="hub-context-card">
        <h2>{currentTab.label}</h2>
        <p>{currentTab.subtitle}</p>
      </section>

      <section className="hub-content">{currentTab.render()}</section>
    </div>
  );
}
