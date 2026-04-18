/**
 * TeamPage — Department team view for managers.
 * Shows employees in the manager's department with attendance overview.
 */
import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { employeeAPI, departmentAPI, attendanceAPI } from "../services/api";
import { useUIFeedback } from '../context/UIFeedbackContext';
import { TableSkeleton, EmptyStateStandard, ErrorStateStandard } from '../components/DataStates';

export default function TeamPage() {
  const { user } = useAuth();
  const ui = useUIFeedback();
  const [employees, setEmployees] = useState([]);
  const [department, setDepartment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [insightsLoading, setInsightsLoading] = useState(true);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [insightRange, setInsightRange] = useState(30);
  const [teamInsights, setTeamInsights] = useState({
    coverage: {
      required_headcount: 0,
      actual_headcount: 0,
      gap: 0,
      coverage_rate_pct: 0,
      status: "UNDERSTAFFED",
    },
    late_clusters: [],
    anomaly_feed: [],
  });
  const [todayStats, setTodayStats] = useState({
    present: 0,
    absent: 0,
    late: 0,
    onLeave: 0,
  });
  const [pageError, setPageError] = useState('');

  useEffect(() => {
    fetchTeamData();
  }, [user, insightRange]);

  const fetchTeamData = async () => {
    if (!user?.managed_department_id) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      setPageError('');
      // Fetch department info and employees
      const [deptRes, empRes] = await Promise.all([
        departmentAPI.list(),
        employeeAPI.list({ department_id: user.managed_department_id }),
      ]);

      const dept = (deptRes.data || []).find(
        (d) => d.department_id === user.managed_department_id,
      );
      setDepartment(dept);
      setEmployees(empRes.data || []);

      // Calculate today's stats
      const today = new Date().toISOString().split("T")[0];
      const attendanceRes = await attendanceAPI.list({
        department_id: user.managed_department_id,
        start_date: today,
        end_date: today,
      });

      const records = attendanceRes.data || [];
      setTodayStats({
        present: records.filter((r) => r.status === "PRESENT").length,
        late: records.filter((r) => r.status === "LATE").length,
        absent: records.filter((r) => r.status === "ABSENT").length,
        onLeave: records.filter((r) => r.status === "ON_LEAVE").length,
      });

      setInsightsLoading(true);
      const insightsRes = await attendanceAPI.teamInsights(
        insightRange,
        user.managed_department_id,
      );
      setTeamInsights(
        insightsRes.data || {
          coverage: {
            required_headcount: 0,
            actual_headcount: 0,
            gap: 0,
            coverage_rate_pct: 0,
            status: "UNDERSTAFFED",
          },
          late_clusters: [],
          anomaly_feed: [],
        },
      );
    } catch (err) {
      console.error("Failed to fetch team data:", err);
      const detail = err.response?.data?.detail || 'Failed to fetch team data.';
      setPageError(detail);
      ui.error(detail);
    } finally {
      setLoading(false);
      setInsightsLoading(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "ACTIVE":
        return "var(--success)";
      case "INACTIVE":
        return "var(--warning)";
      case "TERMINATED":
        return "var(--error)";
      default:
        return "var(--secondary)";
    }
  };

  if (!user?.managed_department_id) {
    return (
      <div className="page-container">
        <div className="empty-state">
          <span className="material-symbols-outlined">group_off</span>
          <h3>No Team Assigned</h3>
          <p>You are not assigned as a manager of any department.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      {/* Page Header */}
      <header className="page-header-premium">
        <div className="page-header-content">
          <span className="page-header-chip">MANAGEMENT</span>
          <h1 className="page-title-premium">My Team</h1>
          <p className="page-subtitle-premium">
            {department?.name || "Department"} — {employees.length} team members
          </p>
        </div>
        <div className="page-header-actions">
          <div className="insights-range-selector">
            {[14, 30, 60].map((d) => (
              <button
                key={d}
                className={`insights-range-btn ${insightRange === d ? "insights-range-btn--active" : ""}`}
                onClick={() => setInsightRange(d)}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>
      </header>

      {pageError && <ErrorStateStandard message={pageError} onRetry={fetchTeamData} />}

      {/* Team Insights */}
      <div className="stats-row">
        <div className="mini-stat-card glass-card">
          <span
            className="mini-stat-icon"
            style={{ color: "var(--status-active)" }}
          >
            <span className="material-symbols-outlined">groups</span>
          </span>
          <div className="mini-stat-content">
            <span className="mini-stat-value">
              {teamInsights.coverage?.actual_headcount || 0}/
              {teamInsights.coverage?.required_headcount || 0}
            </span>
            <span className="mini-stat-label">Coverage Gap Dashboard</span>
          </div>
        </div>

        <div className="mini-stat-card glass-card">
          <span
            className="mini-stat-icon"
            style={{ color: "var(--status-break)" }}
          >
            <span className="material-symbols-outlined">insights</span>
          </span>
          <div className="mini-stat-content">
            <span className="mini-stat-value">
              {teamInsights.coverage?.coverage_rate_pct || 0}%
            </span>
            <span className="mini-stat-label">Coverage Rate</span>
          </div>
        </div>

        <div className="mini-stat-card glass-card">
          <span className="mini-stat-icon" style={{ color: "var(--primary)" }}>
            <span className="material-symbols-outlined">warning</span>
          </span>
          <div className="mini-stat-content">
            <span className="mini-stat-value">
              {teamInsights.late_clusters?.length || 0}
            </span>
            <span className="mini-stat-label">Late Clustering Alerts</span>
          </div>
        </div>

        <div className="mini-stat-card glass-card">
          <span className="mini-stat-icon" style={{ color: "var(--accent)" }}>
            <span className="material-symbols-outlined">
              notifications_active
            </span>
          </span>
          <div className="mini-stat-content">
            <span className="mini-stat-value">
              {teamInsights.anomaly_feed?.length || 0}
            </span>
            <span className="mini-stat-label">Team Anomaly Feed</span>
          </div>
        </div>
      </div>

      <div className="bento-grid bento-grid-2 team-insights-panels">
        <div className="card glass-subtle">
          <div className="card-header">
            <h3 className="card-title">Late-Coming Clustering</h3>
            <span className="material-symbols-outlined">
              calendar_view_week
            </span>
          </div>
          {insightsLoading ? (
            <p className="table-loading">Loading cluster alerts...</p>
          ) : teamInsights.late_clusters?.length ? (
            <div className="team-insights-list">
              {teamInsights.late_clusters.map((alert, idx) => (
                <div
                  key={`${alert.cluster_type}-${alert.label}-${idx}`}
                  className="glass-card team-insights-item"
                >
                  <div className="team-insights-item-header">
                    <strong>{alert.label}</strong>
                    <span>{alert.rate_pct}%</span>
                  </div>
                  <p className="team-insights-item-message">
                    {alert.alert_message}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-text">
              No clustering alerts detected for this period.
            </p>
          )}
        </div>

        <div className="card glass-subtle">
          <div className="card-header">
            <h3 className="card-title">Team Anomaly Feed</h3>
            <span className="material-symbols-outlined">bolt</span>
          </div>
          {insightsLoading ? (
            <p className="table-loading">Loading anomaly feed...</p>
          ) : teamInsights.anomaly_feed?.length ? (
            <div className="team-insights-list team-insights-list-scroll">
              {teamInsights.anomaly_feed.map((item, idx) => (
                <div
                  key={`${item.anomaly_type}-${item.employee_id || "none"}-${idx}`}
                  className="glass-card team-insights-item"
                >
                  <div className="team-insights-item-header">
                    <strong>{item.employee_name || "Team Member"}</strong>
                    <span>{item.severity}</span>
                  </div>
                  <p className="team-insights-item-message">{item.message}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-text">No anomalies detected for this period.</p>
          )}
        </div>
      </div>

      {/* Today's Overview */}
      <div className="stats-row">
        <div className="mini-stat-card glass-card">
          <span className="mini-stat-icon" style={{ color: "var(--success)" }}>
            <span className="material-symbols-outlined">check_circle</span>
          </span>
          <div className="mini-stat-content">
            <span className="mini-stat-value">{todayStats.present}</span>
            <span className="mini-stat-label">Present Today</span>
          </div>
        </div>

        <div className="mini-stat-card glass-card">
          <span className="mini-stat-icon" style={{ color: "var(--warning)" }}>
            <span className="material-symbols-outlined">schedule</span>
          </span>
          <div className="mini-stat-content">
            <span className="mini-stat-value">{todayStats.late}</span>
            <span className="mini-stat-label">Late</span>
          </div>
        </div>

        <div className="mini-stat-card glass-card">
          <span className="mini-stat-icon" style={{ color: "var(--error)" }}>
            <span className="material-symbols-outlined">cancel</span>
          </span>
          <div className="mini-stat-content">
            <span className="mini-stat-value">{todayStats.absent}</span>
            <span className="mini-stat-label">Absent</span>
          </div>
        </div>

        <div className="mini-stat-card glass-card">
          <span className="mini-stat-icon" style={{ color: "var(--accent)" }}>
            <span className="material-symbols-outlined">beach_access</span>
          </span>
          <div className="mini-stat-content">
            <span className="mini-stat-value">{todayStats.onLeave}</span>
            <span className="mini-stat-label">On Leave</span>
          </div>
        </div>
      </div>

      {/* Team Members */}
      {loading ? (
        <TableSkeleton rows={8} columns={4} label="Loading team members..." />
      ) : employees.length === 0 ? (
        <EmptyStateStandard
          icon="groups"
          title="No team members found"
          message="No employees are currently assigned to this department."
        />
      ) : (
        <div className="team-grid">
          {employees.map((employee) => (
            <div
              key={employee.employee_id}
              className="team-member-card glass-card"
              onClick={() => setSelectedEmployee(employee)}
            >
              <div className="team-member-avatar">
                {employee.profile_image_url ? (
                  <img
                    src={employee.profile_image_url}
                    alt={employee.first_name}
                  />
                ) : (
                  <span>
                    {employee.first_name?.charAt(0)}
                    {employee.last_name?.charAt(0)}
                  </span>
                )}
              </div>
              <div className="team-member-info">
                <h4 className="team-member-name">
                  {employee.first_name} {employee.last_name}
                </h4>
                <span className="team-member-email">{employee.email}</span>
                <span
                  className="team-member-status"
                  style={{ color: getStatusColor(employee.status) }}
                >
                  {employee.status}
                </span>
              </div>
              <button className="team-member-action">
                <span className="material-symbols-outlined">chevron_right</span>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Employee Detail Modal */}
      {selectedEmployee && (
        <div
          className="modal-overlay"
          onClick={() => setSelectedEmployee(null)}
        >
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Team Member Details</h3>
              <button
                className="modal-close"
                onClick={() => setSelectedEmployee(null)}
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="modal-body">
              <div className="employee-detail-header">
                <div className="employee-detail-avatar">
                  {selectedEmployee.profile_image_url ? (
                    <img
                      src={selectedEmployee.profile_image_url}
                      alt={selectedEmployee.first_name}
                    />
                  ) : (
                    <span>
                      {selectedEmployee.first_name?.charAt(0)}
                      {selectedEmployee.last_name?.charAt(0)}
                    </span>
                  )}
                </div>
                <div>
                  <h2>
                    {selectedEmployee.first_name} {selectedEmployee.last_name}
                  </h2>
                  <span
                    className="status-badge"
                    style={{
                      background: `${getStatusColor(selectedEmployee.status)}20`,
                      color: getStatusColor(selectedEmployee.status),
                    }}
                  >
                    {selectedEmployee.status}
                  </span>
                </div>
              </div>

              <div className="employee-detail-grid">
                <div className="employee-detail-item">
                  <span className="material-symbols-outlined">email</span>
                  <div>
                    <span className="detail-label">Email</span>
                    <span className="detail-value">
                      {selectedEmployee.email}
                    </span>
                  </div>
                </div>

                <div className="employee-detail-item">
                  <span className="material-symbols-outlined">phone</span>
                  <div>
                    <span className="detail-label">Phone</span>
                    <span className="detail-value">
                      {selectedEmployee.phone || "Not set"}
                    </span>
                  </div>
                </div>

                <div className="employee-detail-item">
                  <span className="material-symbols-outlined">
                    calendar_today
                  </span>
                  <div>
                    <span className="detail-label">Hire Date</span>
                    <span className="detail-value">
                      {selectedEmployee.hire_date
                        ? new Date(
                            selectedEmployee.hire_date,
                          ).toLocaleDateString()
                        : "Not set"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
