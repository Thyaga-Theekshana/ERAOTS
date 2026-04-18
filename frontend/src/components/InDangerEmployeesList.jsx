import { TableSkeleton, EmptyStateStandard } from './DataStates';

/**
 * InDangerEmployeesList — FR9.3 Emergency Headcount View.
 * Design System: Vigilant Glass (Bento + Glassmorphism)
 *
 * Displays (to HR/Admin) a table of employees who are marked IN_DANGER
 * during an active emergency. Provides a one-click "Mark Accounted For"
 * action per employee.
 *
 * Props:
 *   employees       {array}    List of headcount objects:
 *                              { headcount_id, employee_id, name, department,
 *                                status_at_event, accounted_for,
 *                                last_known_door, accounted_at }
 *   onMarkAccounted {function} Called with (headcountId) to account for an employee
 *   loading         {boolean}  Shows spinner overlay while API is in flight
 */
export default function InDangerEmployeesList({ employees = [], onMarkAccounted, loading }) {
  const dangerList = employees.filter(e => !e.accounted_for);
  const accountedList = employees.filter(e => e.accounted_for);

  if (employees.length === 0) {
    return <EmptyStateStandard icon="verified_user" title="Everyone accounted for" message="No unaccounted employees remain." />;
  }

  return (
    <div className="in-danger-list">
      {/* Summary badges */}
      <div className="stats-row" style={{ marginBottom: '1.5rem' }}>
        <div className="stat-card-mini stat-card-mini--danger">
          <span className="stat-card-mini-label">Need Accounting</span>
          <span className="stat-card-mini-value">{dangerList.length}</span>
        </div>
        <div className="stat-card-mini stat-card-mini--accent">
          <span className="stat-card-mini-label">Accounted For</span>
          <span className="stat-card-mini-value">{accountedList.length}</span>
        </div>
        <div className="stat-card-mini">
          <span className="stat-card-mini-label">Total Inside</span>
          <span className="stat-card-mini-value">{employees.length}</span>
        </div>
      </div>

      {/* Unaccounted employees — red highlight */}
      {dangerList.length > 0 && (
        <div className="in-danger-section">
          <h3 className="in-danger-section-title">
            <span className="material-symbols-outlined">warning</span>
            Unaccounted Employees
          </h3>
          <div className="data-table-wrap">
            {loading ? (
              <TableSkeleton rows={5} columns={5} label="Loading headcount entries..." />
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Department</th>
                    <th>Last Known Door</th>
                    <th>Status At Event</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {dangerList.map(emp => (
                    <tr key={emp.headcount_id || emp.employee_id} className="in-danger-row">
                      <td>
                        <div className="employee-cell">
                          <span className="material-symbols-outlined employee-cell-icon">person</span>
                          <span>{emp.name || emp.employee_name || `ID: ${emp.employee_id}`}</span>
                        </div>
                      </td>
                      <td>{emp.department || '—'}</td>
                      <td>
                        <span className="badge badge--neutral">
                          <span className="material-symbols-outlined" style={{ fontSize: '0.875rem' }}>door_front</span>
                          {emp.last_known_door || 'Unknown'}
                        </span>
                      </td>
                      <td>
                        <span className={`status-badge status-badge--${
                          emp.status_at_event === 'ACTIVE' ? 'active' :
                          emp.status_at_event === 'ON_BREAK' ? 'break' : 'neutral'
                        }`}>
                          {emp.status_at_event || 'UNKNOWN'}
                        </span>
                      </td>
                      <td>
                        <button
                          id={`account-emp-${emp.headcount_id || emp.employee_id}`}
                          className="btn btn-sm"
                          onClick={() => onMarkAccounted(emp.headcount_id)}
                          disabled={loading}
                          title="Mark this employee as accounted for"
                        >
                          <span className="material-symbols-outlined">check_circle</span>
                          Account For
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Accounted employees — muted/success list */}
      {accountedList.length > 0 && (
        <div className="in-danger-section in-danger-section--accounted">
          <h3 className="in-danger-section-title in-danger-section-title--safe">
            <span className="material-symbols-outlined">verified_user</span>
            Accounted For ({accountedList.length})
          </h3>
          <div className="in-danger-accounted-list">
            {accountedList.map(emp => (
              <div key={emp.headcount_id || emp.employee_id} className="in-danger-accounted-item">
                <span className="material-symbols-outlined in-danger-accounted-icon">check_circle</span>
                <span className="in-danger-accounted-name">
                  {emp.name || emp.employee_name || `ID: ${emp.employee_id}`}
                </span>
                {emp.accounted_at && (
                  <span className="in-danger-accounted-time">
                    {new Date(emp.accounted_at).toLocaleTimeString()}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
