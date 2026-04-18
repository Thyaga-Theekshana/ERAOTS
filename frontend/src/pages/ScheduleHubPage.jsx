import { useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import SchedulesPage from './SchedulesPage';
import MySchedulePage from './MySchedulePage';

export default function ScheduleHubPage() {
  const { isEmployee, isManager, isAdmin } = useAuth();

  const tabs = useMemo(() => {
    const allTabs = [
      {
        key: 'personal',
        label: 'My Schedule',
        subtitle: 'Personal schedule and leave management',
        show: true,
        render: () => <MySchedulePage />,
      },
      {
        key: 'team',
        label: 'Team Scheduling',
        subtitle: 'Manager leave and schedule tracking',
        show: isManager && !isAdmin,
        render: () => <SchedulesPage departmentScoped />,
      },
      {
        key: 'org',
        label: 'Organization Scheduling',
        subtitle: 'Company schedule and leave governance for HR/Admin',
        show: isAdmin,
        render: () => <SchedulesPage />,
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
          <span className="hub-shell-chip">FR8 LEAVE & SCHEDULE MANAGEMENT</span>
          <h1 className="hub-shell-title">Schedule Hub</h1>
          <p className="hub-shell-subtitle">
            {isEmployee
              ? 'Plan your schedule and leave lifecycle in one place'
              : 'Unified leave operations for personal, team, and organization views'}
          </p>
        </div>
      </header>

      {tabs.length > 1 && (
        <section className="hub-tabs" aria-label="Schedule views">
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
