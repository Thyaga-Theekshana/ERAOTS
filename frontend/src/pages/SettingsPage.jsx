import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { settingsAPI, departmentAPI } from '../services/api';
import { useUIFeedback } from '../context/UIFeedbackContext';
import { TableSkeleton, EmptyStateStandard, ErrorStateStandard } from '../components/DataStates';

const ROLE_LABELS = {
  SUPER_ADMIN: 'Super Admin',
  HR_MANAGER: 'HR Manager',
  MANAGER: 'Department Manager',
  EMPLOYEE: 'Employee',
};

export default function SettingsPage() {
  const { user, isSuperAdmin, isHR, isDeptManager } = useAuth();
  const ui = useUIFeedback();
  const role = user?.role || 'EMPLOYEE';

  const [policies, setPolicies] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingPolicyId, setSavingPolicyId] = useState(null);
  const [feedback, setFeedback] = useState('');
  const [pageError, setPageError] = useState('');

  const canAccessPage = isSuperAdmin || isHR || isDeptManager;

  const fetchData = async (deptId = '') => {
    try {
      setLoading(true);
      setPageError('');
      const params = {};
      if (deptId) {
        params.department_id = deptId;
      }
      const [policyRes, deptRes] = await Promise.all([
        settingsAPI.getPolicies(params),
        (isSuperAdmin || isHR) ? departmentAPI.list() : Promise.resolve({ data: [] }),
      ]);
      setPolicies(policyRes.data || []);
      setDepartments(deptRes.data || []);
    } catch (err) {
      console.error('Failed to fetch policy settings', err);
      const detail = err.response?.data?.detail || 'Failed to load policies. Please refresh and try again.';
      setPageError(detail);
      setPolicies([]);
      setDepartments([]);
      ui.error(detail);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(selectedDepartment);
  }, [selectedDepartment]);

  const groupedPolicies = useMemo(() => {
    const groups = {
      SYSTEM: [],
      WORKFORCE: [],
    };

    policies.forEach((policy) => {
      const domain = policy.domain || 'WORKFORCE';
      if (!groups[domain]) {
        groups[domain] = [];
      }
      groups[domain].push(policy);
    });

    return groups;
  }, [policies]);

  const updatePolicyValue = (policyId, key, rawValue) => {
    setPolicies((prev) =>
      prev.map((policy) => {
        if (policy.policy_id !== policyId) return policy;

        const parsed = rawValue === ''
          ? ''
          : Number.isNaN(Number(rawValue))
            ? rawValue
            : Number(rawValue);

        return {
          ...policy,
          value: {
            ...policy.value,
            [key]: parsed,
          },
        };
      }),
    );
  };

  const handleUpdate = async (policy) => {
    if (!policy.editable) return;

    setSavingPolicyId(policy.policy_id);
    setFeedback('');
    try {
      const payload = {
        value: policy.value,
        is_active: policy.is_active,
      };
      await settingsAPI.updatePolicy(policy.policy_id, payload);
      setFeedback(`${policy.name} updated successfully.`);
      ui.success(`${policy.name} updated successfully.`);
      await fetchData(selectedDepartment);
    } catch (err) {
      const msg = err.response?.data?.detail || err.message;
      setFeedback(`Update failed: ${msg}`);
      ui.error(`Update failed: ${msg}`);
      await fetchData(selectedDepartment);
    } finally {
      setSavingPolicyId(null);
    }
  };

  const togglePolicyActive = (policyId) => {
    setPolicies((prev) =>
      prev.map((policy) =>
        policy.policy_id === policyId ? { ...policy, is_active: !policy.is_active } : policy,
      ),
    );
  };

  if (!canAccessPage) {
    return (
      <div className="page-container">
        <EmptyStateStandard
          icon="lock"
          title="Restricted"
          message="Policy configuration is only available to Super Admin, HR Manager, and Department Manager roles."
        />
      </div>
    );
  }

  return (
    <div className="page-container">
      <header className="page-header-premium">
        <div className="page-header-content">
          <span className="page-header-chip">FR15 CONFIGURABLE POLICY ENGINE</span>
          <h1 className="page-title-premium">Policy Engine</h1>
          <p className="page-subtitle-premium">
            Role-scoped policy controls with company-wide and department override support
          </p>
        </div>
      </header>

      <div className="stats-row">
        <div className="stat-card-mini">
          <span className="stat-card-mini-label">Current Role</span>
          <span className="stat-card-mini-value">{ROLE_LABELS[role] || role}</span>
        </div>
        <div className="stat-card-mini">
          <span className="stat-card-mini-label">Visible Policies</span>
          <span className="stat-card-mini-value">{policies.length}</span>
        </div>
        <div className="stat-card-mini">
          <span className="stat-card-mini-label">Editable</span>
          <span className="stat-card-mini-value">{policies.filter((p) => p.editable).length}</span>
        </div>
        <div className="stat-card-mini stat-card-mini--accent">
          <span className="stat-card-mini-label">Domain Scope</span>
          <span className="stat-card-mini-value">{isSuperAdmin ? 'System + Workforce' : 'Workforce'}</span>
        </div>
      </div>

      {(isSuperAdmin || isHR) && (
        <div className="policy-filter-bar">
          <label className="policy-filter-label">Department Filter</label>
          <select
            className="form-input"
            value={selectedDepartment}
            onChange={(e) => setSelectedDepartment(e.target.value)}
          >
            <option value="">All Departments</option>
            {departments.map((dept) => (
              <option key={dept.department_id} value={dept.department_id}>
                {dept.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {pageError && <ErrorStateStandard message={pageError} onRetry={() => fetchData(selectedDepartment)} />}

      {feedback && (
        <div className="alert-banner alert-banner--error">
          <span className="material-symbols-outlined">info</span>
          <span>{feedback}</span>
        </div>
      )}

      {loading ? (
        <TableSkeleton rows={8} columns={3} label="Loading policy settings..." />
      ) : policies.length === 0 ? (
        <EmptyStateStandard
          icon="policy"
          title="No policies available"
          message="No policy records were returned for this scope."
        />
      ) : (
        <div className="policy-domain-stack">
          {Object.entries(groupedPolicies).map(([domain, items]) => {
            if (!items.length) return null;
            return (
              <section key={domain} className="policy-domain-section">
                <div className="policy-domain-header">
                  <h2>{domain === 'SYSTEM' ? 'System Policies' : 'Workforce Policies'}</h2>
                  <p>
                    {domain === 'SYSTEM'
                      ? 'Platform, infrastructure, and hardware-level controls'
                      : 'Attendance, correction, and workforce behavior rules'}
                  </p>
                </div>

                <div className="policies-grid">
                  {items.map((policy) => (
                    <div key={policy.policy_id} className="policy-card">
                      <div className="policy-card-header">
                        <div className="policy-card-title-group">
                          <span className="material-symbols-outlined policy-card-icon">policy</span>
                          <div>
                            <h3 className="policy-card-title">{policy.name}</h3>
                            <span className="policy-card-type">{policy.policy_type}</span>
                          </div>
                        </div>
                        <div className="policy-scope-chip-wrap">
                          <span className={`policy-scope-chip ${policy.scope === 'DEPARTMENT' ? 'policy-scope-chip--dept' : ''}`}>
                            {policy.scope}
                          </span>
                        </div>
                      </div>

                      <p className="policy-description">{policy.description || 'No description available.'}</p>

                      <div className="policy-meta-grid">
                        <div>
                          <span className="policy-meta-label">Minimum Role</span>
                          <span className="policy-meta-value">{ROLE_LABELS[policy.min_role_to_edit] || policy.min_role_to_edit || '—'}</span>
                        </div>
                        <div>
                          <span className="policy-meta-label">Department</span>
                          <span className="policy-meta-value">{policy.department_name || 'Global'}</span>
                        </div>
                      </div>

                      <div className="policy-params">
                        {Object.entries(policy.value || {}).map(([key, val]) => (
                          <div key={key} className="policy-param">
                            <label className="policy-param-label">{key.replace(/_/g, ' ')}</label>
                            <input
                              type={typeof val === 'number' ? 'number' : 'text'}
                              className="policy-param-input"
                              value={val}
                              disabled={!policy.editable}
                              onChange={(e) => updatePolicyValue(policy.policy_id, key, e.target.value)}
                            />
                          </div>
                        ))}
                      </div>

                      <div className="policy-actions-row">
                        <label className="policy-active-toggle">
                          <input
                            type="checkbox"
                            checked={policy.is_active}
                            disabled={!policy.editable}
                            onChange={() => togglePolicyActive(policy.policy_id)}
                          />
                          Active
                        </label>

                        <button
                          className="btn btn-primary"
                          type="button"
                          disabled={!policy.editable || savingPolicyId === policy.policy_id}
                          onClick={() => handleUpdate(policy)}
                        >
                          {savingPolicyId === policy.policy_id ? 'Saving...' : policy.editable ? 'Save Policy' : 'Read Only'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
