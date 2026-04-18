import { useEffect, useMemo, useState } from 'react';
import EmployeesPage from './EmployeesPage';
import DepartmentsPage from './DepartmentsPage';

export default function DirectoryHubPage() {
  const tabs = useMemo(
    () => [
      {
        key: 'employees',
        label: 'Employee Directory',
        subtitle: 'Profiles, roles, and active status management',
        render: () => <EmployeesPage />,
      },
      {
        key: 'departments',
        label: 'Department Registry',
        subtitle: 'Organizational units, headcount, and team structure',
        render: () => <DepartmentsPage />,
      },
    ],
    [],
  );

  const [activeTab, setActiveTab] = useState('employees');

  useEffect(() => {
    if (!tabs.some((tab) => tab.key === activeTab)) {
      setActiveTab(tabs[0].key);
    }
  }, [tabs, activeTab]);

  const currentTab = tabs.find((tab) => tab.key === activeTab) || tabs[0];

  return (
    <div className="hub-shell">
      <header className="hub-shell-header">
        <div>
          <span className="hub-shell-chip">FR5 ADMIN CONTROL PANEL</span>
          <h1 className="hub-shell-title">Directory Hub</h1>
          <p className="hub-shell-subtitle">
            Unified desktop workspace for employee and department administration
          </p>
        </div>
      </header>

      <section className="hub-tabs" aria-label="Directory views">
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

      <section className="hub-context-card">
        <h2>{currentTab.label}</h2>
        <p>{currentTab.subtitle}</p>
      </section>

      <section className="hub-content">{currentTab.render()}</section>
    </div>
  );
}
