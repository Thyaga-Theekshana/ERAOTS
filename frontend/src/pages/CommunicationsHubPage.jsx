import { useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import NotificationCenter from './NotificationCenter';
import NotificationSettings from './NotificationSettings';
import Announcements from './Announcements';
import MeetingAlerts from './MeetingAlerts';

export default function CommunicationsHubPage() {
  const { user } = useAuth();
  const role = user?.role || 'EMPLOYEE';

  const tabs = useMemo(() => {
    const isAdmin = role === 'HR_MANAGER' || role === 'SUPER_ADMIN';

    return [
      {
        key: 'alerts',
        label: 'Notification Center',
        subtitle: 'Real-time alerts, priorities, and notification history',
        show: true,
        render: () => <NotificationCenter />,
      },
      {
        key: 'prefs',
        label: 'Notification Settings',
        subtitle: 'Channels, thresholds, and suppression preferences',
        show: true,
        render: () => <NotificationSettings />,
      },
      {
        key: 'announcements',
        label: 'Announcements',
        subtitle: 'Company communication stream with role-aware publishing',
        show: true,
        render: () => <Announcements />,
      },
      {
        key: 'meetings',
        label: 'Meeting Alerts',
        subtitle: 'Scheduled meeting notifications and reminders',
        show: isAdmin,
        render: () => <MeetingAlerts />,
      },
    ].filter((tab) => tab.show);
  }, [role]);

  const initialTab = tabs[0]?.key || 'alerts';
  const [activeTab, setActiveTab] = useState(initialTab);
  const currentTab = tabs.find((tab) => tab.key === activeTab) || tabs[0];

  if (!currentTab) {
    return null;
  }

  return (
    <div className="hub-shell">
      <header className="hub-shell-header">
        <div>
          <span className="hub-shell-chip">FR6 NOTIFICATION & ALERT ENGINE</span>
          <h1 className="hub-shell-title">Communications Hub</h1>
          <p className="hub-shell-subtitle">
            Unified notification, announcement, and meeting communication center
          </p>
        </div>
      </header>

      {tabs.length > 1 && (
        <section className="hub-tabs" aria-label="Communications views">
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
