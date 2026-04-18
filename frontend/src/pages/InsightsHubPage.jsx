import { useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import PersonalInsightsPage from './PersonalInsightsPage';
import TeamPage from './TeamPage';
import AnalyticsPage from './AnalyticsPage';
import CompanyInsightsPage from './CompanyInsightsPage';
import SystemInsightsPage from './SystemInsightsPage';

export default function InsightsHubPage() {
  const { user } = useAuth();
  const role = user?.role || 'EMPLOYEE';

  const tabs = useMemo(() => {
    const isManager = role === 'MANAGER';
    const isHr = role === 'HR_MANAGER';
    const isSuperAdmin = role === 'SUPER_ADMIN';
    const isAdmin = isHr || isSuperAdmin;

    return [
      {
        key: 'personal',
        label: 'Personal Insights',
        subtitle: 'Individual attendance intelligence and punctuality trends',
        show: true,
        render: () => <PersonalInsightsPage />,
      },
      {
        key: 'team',
        label: 'Team Insights',
        subtitle: 'Manager-level coverage and anomalies',
        show: isManager,
        render: () => <TeamPage />,
      },
      {
        key: 'analytics',
        label: 'Analytics Reports',
        subtitle: 'Attendance exports and high-level charts',
        show: isAdmin,
        render: () => <AnalyticsPage />,
      },
      {
        key: 'company',
        label: 'Company Intelligence',
        subtitle: 'Organization-wide workforce behavior insights',
        show: isAdmin,
        render: () => <CompanyInsightsPage />,
      },
      {
        key: 'system',
        label: 'System Intelligence',
        subtitle: 'Operational and security telemetry for super admins',
        show: isSuperAdmin,
        render: () => <SystemInsightsPage />,
      },
    ].filter((tab) => tab.show);
  }, [role]);

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
          <span className="hub-shell-chip">FR12 ANALYTICS & INSIGHTS</span>
          <h1 className="hub-shell-title">Insights Hub</h1>
          <p className="hub-shell-subtitle">
            Consolidated analytics workspace with strict role-scoped visibility
          </p>
        </div>
      </header>

      {tabs.length > 1 && (
        <section className="hub-tabs" aria-label="Insights views">
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
