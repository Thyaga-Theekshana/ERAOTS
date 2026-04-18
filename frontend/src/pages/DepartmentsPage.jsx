import { useState, useEffect } from 'react';
import { departmentAPI } from '../services/api';
import { useUIFeedback } from '../context/UIFeedbackContext';
import { TableSkeleton, EmptyStateStandard, ErrorStateStandard } from '../components/DataStates';

export default function DepartmentsPage() {
  const ui = useUIFeedback();
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({ name: '', description: '' });
  const [error, setError] = useState('');
  
  // Edit state
  const [selectedDepartment, setSelectedDepartment] = useState(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editFormData, setEditFormData] = useState({ name: '', description: '', is_active: true });
  const [editError, setEditError] = useState('');

  const fetchDepartments = async () => {
    try {
      setLoading(true);
      setPageError('');
      const res = await departmentAPI.list();
      setDepartments(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("Failed to fetch departments", err);
      const detail = err.response?.data?.detail || 'Failed to load departments.';
      setPageError(detail);
      ui.error(detail);
      setDepartments([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDepartments();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await departmentAPI.create(formData);
      setIsModalOpen(false);
      setFormData({ name: '', description: '' });
      fetchDepartments();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create department');
    }
  };

  const handleEditClick = (dept) => {
    setSelectedDepartment(dept);
    setEditFormData({
      name: dept.name || '',
      description: dept.description || '',
      is_active: dept.is_active !== false
    });
    setEditError('');
    setIsEditModalOpen(true);
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    setEditError('');
    try {
      await departmentAPI.update(selectedDepartment.department_id, editFormData);
      setIsEditModalOpen(false);
      setSelectedDepartment(null);
      fetchDepartments();
    } catch (err) {
      setEditError(err.response?.data?.detail || 'Failed to update department');
    }
  };

  const totalEmployees = departments.reduce((sum, d) => sum + (d.employee_count || 0), 0);
  const activeCount = departments.filter(d => d.is_active).length;

  return (
    <div className="page-container">
      {/* Page Header */}
      <header className="page-header-premium">
        <div className="page-header-content">
          <span className="page-header-chip">ORGANIZATIONAL UNITS</span>
          <h1 className="page-title-premium">Departments</h1>
          <p className="page-subtitle-premium">Organizational structure and team headcount management</p>
        </div>
      </header>

      {pageError && <ErrorStateStandard message={pageError} onRetry={fetchDepartments} />}

      {/* Stats Row */}
      <div className="stats-row">
        <div className="stat-card-mini">
          <span className="stat-card-mini-label">Total Teams</span>
          <span className="stat-card-mini-value">{departments.length}</span>
        </div>
        <div className="stat-card-mini">
          <span className="stat-card-mini-label">Active</span>
          <span className="stat-card-mini-value">{activeCount}</span>
        </div>
        <div className="stat-card-mini">
          <span className="stat-card-mini-label">Personnel</span>
          <span className="stat-card-mini-value">{totalEmployees}</span>
        </div>
        <div className="stat-card-mini stat-card-mini--accent">
          <span className="stat-card-mini-label">Avg Team Size</span>
          <span className="stat-card-mini-value">
            {departments.length > 0 ? Math.round(totalEmployees / departments.length) : 0}
          </span>
        </div>
      </div>

      {/* Table Card */}
      <div className="table-card-premium">
        <div className="table-card-header">
          <div className="table-card-title-group">
            <span className="material-symbols-outlined table-card-icon">account_tree</span>
            <div>
              <h2 className="table-card-title">Department Registry</h2>
              <p className="table-card-subtitle">{departments.length} organizational units configured</p>
            </div>
          </div>
        </div>

        {loading ? (
          <TableSkeleton rows={6} columns={5} label="Loading departments..." />
        ) : departments.length === 0 ? (
          <EmptyStateStandard
            icon="folder_off"
            title="No departments configured"
            message="Create your first department to organize personnel."
          />
        ) : (
          <div className="table-wrapper">
            <table className="premium-table">
              <thead>
                <tr>
                  <th>Department</th>
                  <th>Description</th>
                  <th>Headcount</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {departments.map(dept => (
                  <tr key={dept.department_id}>
                    <td>
                      <div className="table-cell-primary">
                        <div className="dept-icon">
                          <span className="material-symbols-outlined">groups</span>
                        </div>
                        <span className="table-cell-name">{dept.name}</span>
                      </div>
                    </td>
                    <td>
                      <span className="table-cell-secondary">
                        {dept.description || 'No description'}
                      </span>
                    </td>
                    <td>
                      <span className="table-cell-metric">{dept.employee_count}</span>
                    </td>
                    <td>
                      <span className={`status-chip ${dept.is_active ? 'status-chip--active' : 'status-chip--inactive'}`}>
                        {dept.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <button
                        className="table-action-btn"
                        onClick={() => handleEditClick(dept)}
                        title="Edit Department"
                      >
                        <span className="material-symbols-outlined">edit</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Floating Action Button */}
      <button className="fab" onClick={() => setIsModalOpen(true)} title="Add Department">
        <span className="material-symbols-outlined">add</span>
      </button>

      {/* Modal */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-header-content">
                <span className="material-symbols-outlined modal-header-icon">domain_add</span>
                <div>
                  <h2 className="modal-title">New Department</h2>
                  <p className="modal-subtitle">Create a new organizational unit</p>
                </div>
              </div>
              <button className="modal-close" onClick={() => setIsModalOpen(false)}>
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {error && (
              <div className="modal-error">
                <span className="material-symbols-outlined">error</span>
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">Department Name</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  placeholder="e.g. Engineering"
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea
                  className="form-input"
                  rows="3"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Brief description of team responsibilities..."
                />
              </div>

              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setIsModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Create Department
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {isEditModalOpen && selectedDepartment && (
        <div className="modal-overlay" onClick={() => setIsEditModalOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-header-content">
                <span className="material-symbols-outlined modal-header-icon">edit</span>
                <div>
                  <h2 className="modal-title">Edit Department</h2>
                  <p className="modal-subtitle">Update {selectedDepartment.name}</p>
                </div>
              </div>
              <button className="modal-close" onClick={() => setIsEditModalOpen(false)}>
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {editError && (
              <div className="modal-error">
                <span className="material-symbols-outlined">error</span>
                {editError}
              </div>
            )}

            <form onSubmit={handleEditSubmit}>
              <div className="form-group">
                <label className="form-label">Department Name</label>
                <input
                  type="text"
                  className="form-input"
                  value={editFormData.name}
                  onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                  required
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea
                  className="form-input"
                  rows="3"
                  value={editFormData.description}
                  onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                  placeholder="Brief description of team responsibilities..."
                />
              </div>
              <div className="form-group">
                <label className="form-label">Status</label>
                <select
                  className="form-input"
                  value={editFormData.is_active ? 'active' : 'inactive'}
                  onChange={(e) => setEditFormData({ ...editFormData, is_active: e.target.value === 'active' })}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>

              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setIsEditModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
