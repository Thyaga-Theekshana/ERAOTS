import { useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import CorrectionFormPage from './CorrectionFormPage';
import MyCorrectionsPage from './MyCorrectionsPage';
import ManagerApprovalPage from './ManagerApprovalPage';
import HRApprovalPage from './HRApprovalPage';

export default function CorrectionsHubPage() {
  const { user } = useAuth();
  const role = user?.role || 'EMPLOYEE';

  const tabs = useMemo(() => {
    const isManager = role === 'MANAGER';
    const isAdmin = role === 'HR_MANAGER' || role === 'SUPER_ADMIN';

    return [
      {
        key: 'request',
        label: 'Submit Request',
        subtitle: 'File a correction for missed or erroneous scans',
        show: true,
        render: () => <CorrectionFormPage />,
      },
      {
        key: 'mine',
        label: 'My Requests',
        subtitle: 'Track correction workflow progress and comments',
        show: true,
        render: () => <MyCorrectionsPage />,
      },
      {
        key: 'manager',
        label: 'Manager Queue',
        subtitle: 'Manager review stage for pending team corrections',
        show: isManager || isAdmin,
        render: () => <ManagerApprovalPage />,
      },
      {
        key: 'hr',
        label: 'HR Queue',
        subtitle: 'Final HR approval and rejection stage',
        show: isAdmin,
        render: () => <HRApprovalPage />,
      },
    ].filter((tab) => tab.show);
  }, [role]);

  const initialTab = tabs[0]?.key || 'request';
  const [activeTab, setActiveTab] = useState(initialTab);
  const currentTab = tabs.find((tab) => tab.key === activeTab) || tabs[0];

  if (!currentTab) {
    return null;
  }

  return (
    <div className="hub-shell">
      <header className="hub-shell-header">
        <div>
          <span className="hub-shell-chip">FR14 CORRECTION WORKFLOW</span>
          <h1 className="hub-shell-title">Corrections Hub</h1>
          <p className="hub-shell-subtitle">
            End-to-end attendance correction workflow with role-aware queues
          </p>
        </div>
      </header>

      {tabs.length > 1 && (
        <section className="hub-tabs" aria-label="Correction workflow views">
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
