/**
 * Employees Page — Personnel Directory with presence tracking.
 * Design System: Vigilant Glass (Bento + Glassmorphism)
 * Premium redesign for 1 Billion Tech pitch
 */
import { useState, useEffect } from 'react';
import { employeeAPI, departmentAPI } from '../services/api';

export default function EmployeesPage() {
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Filter state
  const [showFilters, setShowFilters] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  
  // Employee detail/edit modal
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editFormData, setEditFormData] = useState({});
  const [editError, setEditError] = useState('');
  
  const initialForm = {
    first_name: '', last_name: '', email: '', phone: '',
    department_id: '', fingerprint_id: '', role_name: 'EMPLOYEE',
    job_title: '', password: ''
  };
  const [formData, setFormData] = useState(initialForm);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [empRes, deptRes] = await Promise.all([
        employeeAPI.list(),
        departmentAPI.list()
      ]);
      setEmployees(empRes.data);
      setDepartments(deptRes.data);
    } catch (err) {
      console.error("Failed to fetch data", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    const submitData = { ...formData };
    if (!submitData.department_id) delete submitData.department_id;
    if (!submitData.phone) delete submitData.phone;
    if (!submitData.fingerprint_id) delete submitData.fingerprint_id;

    try {
      await employeeAPI.create(submitData);
      setIsModalOpen(false);
      setFormData(initialForm);
      fetchData();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to register employee');
    }
  };

  const getStatusConfig = (status) => {
    const configs = {
      'ACTIVE': { class: 'status--active', label: 'Active Node' },
      'IN_MEETING': { class: 'status--meeting', label: 'In Meeting' },
      'ON_BREAK': { class: 'status--break', label: 'On Break' },
      'AWAY': { class: 'status--away', label: 'Away' },
      'OUTSIDE': { class: 'status--outside', label: 'Disconnected' }
    };
    return configs[status] || configs['OUTSIDE'];
  };

  const filteredEmployees = employees.filter(emp => {
    const fullName = `${emp.first_name} ${emp.last_name}`.toLowerCase();
    const matchesSearch = fullName.includes(searchTerm.toLowerCase()) || 
           emp.email?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = !statusFilter || emp.current_status === statusFilter;
    const matchesDept = !departmentFilter || emp.department_id === departmentFilter;
    return matchesSearch && matchesStatus && matchesDept;
  });

  // Pagination logic
  const totalPages = Math.ceil(filteredEmployees.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedEmployees = filteredEmployees.slice(startIndex, startIndex + itemsPerPage);
  
  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, departmentFilter]);

  // Handle viewing employee details
  const handleViewEmployee = (emp) => {
    setSelectedEmployee(emp);
    setEditFormData({
      first_name: emp.first_name || '',
      last_name: emp.last_name || '',
      phone: emp.phone || '',
      department_id: emp.department_id || '',
      status: emp.status || 'active'
    });
    setIsEditing(false);
    setEditError('');
    setIsDetailModalOpen(true);
  };

  // Handle employee update
  const handleUpdateEmployee = async (e) => {
    e.preventDefault();
    setEditError('');
    
    try {
      await employeeAPI.update(selectedEmployee.employee_id, editFormData);
      setIsDetailModalOpen(false);
      setIsEditing(false);
      fetchData();
    } catch (err) {
      setEditError(err.response?.data?.detail || 'Failed to update employee');
    }
  };

  // Clear all filters
  const clearFilters = () => {
    setStatusFilter('');
    setDepartmentFilter('');
    setShowFilters(false);
  };

  // Stats
  const activeCount = employees.filter(e => e.current_status === 'ACTIVE').length;
  const awayCount = employees.filter(e => ['OUTSIDE', 'AWAY'].includes(e.current_status)).length;
  const breakCount = employees.filter(e => e.current_status === 'ON_BREAK').length;

  return (
    <div className="directory-page">
      {/* Page Header */}
      <div className="directory-header">
        <div className="directory-header-content">
          <h1 className="directory-title">
            Personnel <span className="directory-title-accent">Directory</span>
          </h1>
          <p className="directory-subtitle">Monitoring human capital presence across secure nodes.</p>
        </div>
        <div className="directory-header-actions">
          <div className="directory-search">
            <span className="material-symbols-outlined directory-search-icon">search</span>
            <input
              type="text"
              className="directory-search-input"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search personnel or email"
            />
          </div>
          <button 
            className={`directory-btn directory-btn--ghost ${(statusFilter || departmentFilter) ? 'directory-btn--active' : ''}`}
            onClick={() => setShowFilters(!showFilters)}
          >
            <span className="material-symbols-outlined">filter_list</span>
            Refine
            {(statusFilter || departmentFilter) && <span className="directory-filter-badge">!</span>}
          </button>
          <button className="directory-btn directory-btn--primary" onClick={() => setIsModalOpen(true)}>
            <span className="material-symbols-outlined">person_add</span>
            Add Personnel
          </button>
        </div>
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <div className="directory-filters">
          <div className="directory-filter-group">
            <label className="directory-filter-label">Status</label>
            <select 
              className="directory-filter-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All Statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="IN_MEETING">In Meeting</option>
              <option value="ON_BREAK">On Break</option>
              <option value="AWAY">Away</option>
              <option value="OUTSIDE">Outside</option>
            </select>
          </div>
          <div className="directory-filter-group">
            <label className="directory-filter-label">Department</label>
            <select 
              className="directory-filter-select"
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
            >
              <option value="">All Departments</option>
              {departments.map(d => (
                <option key={d.department_id} value={d.department_id}>{d.name}</option>
              ))}
            </select>
          </div>
          <button className="directory-filter-clear" onClick={clearFilters}>
            <span className="material-symbols-outlined">clear_all</span>
            Clear Filters
          </button>
        </div>
      )}

      {/* Stat Cards */}
      <div className="directory-stats">
        <div className="directory-stat-card">
          <span className="directory-stat-label">On-Site Nodes</span>
          <span className="directory-stat-value directory-stat-value--primary">{activeCount}</span>
        </div>
        <div className="directory-stat-card">
          <span className="directory-stat-label">External Links</span>
          <span className="directory-stat-value">{awayCount}</span>
        </div>
        <div className="directory-stat-card">
          <span className="directory-stat-label">Idle Units</span>
          <span className="directory-stat-value directory-stat-value--muted">{breakCount}</span>
        </div>
        <div className="directory-stat-card directory-stat-card--alert">
          <span className="directory-stat-label">Total Personnel</span>
          <span className="directory-stat-value">{employees.length}</span>
        </div>
      </div>

      {/* Data Table */}
      <div className="directory-table-container">
        {loading ? (
          <div className="directory-loading">
            <div className="directory-loading-spinner" />
            <span>Loading personnel data...</span>
          </div>
        ) : (
          <>
            <table className="directory-table">
              <thead>
                <tr>
                  <th>Personnel Unit</th>
                  <th>Department Sector</th>
                  <th>Pulse Status</th>
                  <th>Last Transmission</th>
                  <th>Registry</th>
                </tr>
              </thead>
              <tbody>
                {paginatedEmployees.length === 0 ? (
                  <tr>
                    <td colSpan="5">
                      <div className="directory-empty">
                        <span className="material-symbols-outlined">person_off</span>
                        <span>No personnel found</span>
                        <span className="directory-empty-hint">
                          {(statusFilter || departmentFilter) ? 'Try adjusting your filters' : 'Click "Add Personnel" to register your first entry'}
                        </span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedEmployees.map(emp => {
                    const statusConfig = getStatusConfig(emp.current_status);
                    const isActive = emp.current_status === 'ACTIVE';
                    return (
                      <tr key={emp.employee_id} className={!isActive ? 'directory-row--inactive' : ''}>
                        <td>
                          <div className="directory-person">
                            <div className={`directory-person-avatar ${!isActive ? 'directory-person-avatar--inactive' : ''}`}>
                              {emp.first_name?.charAt(0)}{emp.last_name?.charAt(0)}
                              <span className={`directory-person-indicator ${statusConfig.class}`} />
                            </div>
                            <div className="directory-person-info">
                              <span className="directory-person-name">{emp.first_name} {emp.last_name}</span>
                              <span className="directory-person-id">UNIT ID: {emp.employee_id?.slice(0,8).toUpperCase() || 'N/A'}</span>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className="directory-department">{emp.department_name || '—'}</span>
                        </td>
                        <td>
                          <span className={`directory-status ${statusConfig.class}`}>
                            {isActive && <span className="directory-status-ping" />}
                            {statusConfig.label}
                          </span>
                        </td>
                        <td>
                          <span className="directory-location">{isActive ? 'HQ Secure-1' : 'Offline'}</span>
                        </td>
                        <td>
                          <button 
                            className="directory-action-btn"
                            onClick={() => handleViewEmployee(emp)}
                            title="View Details"
                          >
                            <span className="material-symbols-outlined">visibility</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
            
            {/* Pagination Footer */}
            <div className="directory-footer">
              <span className="directory-footer-info">
                Showing <strong>{startIndex + 1}-{Math.min(startIndex + itemsPerPage, filteredEmployees.length)}</strong> of {filteredEmployees.length} personnel
                {filteredEmployees.length !== employees.length && ` (filtered from ${employees.length})`}
              </span>
              <div className="directory-pagination">
                <button 
                  className="directory-page-btn"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  <span className="material-symbols-outlined">chevron_left</span>
                </button>
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }
                  return (
                    <button 
                      key={pageNum}
                      className={`directory-page-btn ${currentPage === pageNum ? 'directory-page-btn--active' : ''}`}
                      onClick={() => setCurrentPage(pageNum)}
                    >
                      {pageNum}
                    </button>
                  );
                })}
                <button 
                  className="directory-page-btn"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages || totalPages === 0}
                >
                  <span className="material-symbols-outlined">chevron_right</span>
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-header-content">
                <span className="material-symbols-outlined modal-header-icon">person_add</span>
                <div>
                  <h2 className="modal-title">Register Personnel</h2>
                  <p className="modal-subtitle">Add a new node to the system</p>
                </div>
              </div>
              <button className="modal-close" onClick={() => setIsModalOpen(false)}>
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            
            {error && (
              <div className="modal-error">
                <span className="material-symbols-outlined">error</span>
                <span>{error}</span>
              </div>
            )}
            
            <form onSubmit={handleSubmit} className="modal-form">
              <div className="modal-form-grid">
                <div className="modal-field">
                  <label className="modal-label">First Name</label>
                  <input 
                    type="text" 
                    className="modal-input" 
                    required 
                    value={formData.first_name} 
                    onChange={e => setFormData({...formData, first_name: e.target.value})} 
                    placeholder="Enter first name"
                  />
                </div>
                <div className="modal-field">
                  <label className="modal-label">Last Name</label>
                  <input 
                    type="text" 
                    className="modal-input" 
                    required 
                    value={formData.last_name} 
                    onChange={e => setFormData({...formData, last_name: e.target.value})} 
                    placeholder="Enter last name"
                  />
                </div>
              </div>

              <div className="modal-form-grid">
                <div className="modal-field">
                  <label className="modal-label">Email Address</label>
                  <input 
                    type="email" 
                    className="modal-input" 
                    required 
                    value={formData.email} 
                    onChange={e => setFormData({...formData, email: e.target.value})} 
                    placeholder="email@company.com"
                  />
                </div>
                <div className="modal-field">
                  <label className="modal-label">Phone Number</label>
                  <input 
                    type="tel" 
                    className="modal-input" 
                    value={formData.phone} 
                    onChange={e => setFormData({...formData, phone: e.target.value})} 
                    placeholder="+1 (555) 000-0000"
                  />
                </div>
              </div>

              <div className="modal-form-grid">
                <div className="modal-field">
                  <label className="modal-label">Department</label>
                  <select 
                    className="modal-input" 
                    value={formData.department_id} 
                    onChange={e => setFormData({...formData, department_id: e.target.value})}
                  >
                    <option value="">Select department</option>
                    {departments.map(d => (
                      <option key={d.department_id} value={d.department_id}>{d.name}</option>
                    ))}
                  </select>
                </div>
                <div className="modal-field">
                  <label className="modal-label">Role</label>
                  <select 
                    className="modal-input" 
                    value={formData.role_name} 
                    onChange={e => setFormData({...formData, role_name: e.target.value})}
                  >
                    <option value="EMPLOYEE">Employee</option>
                    <option value="MANAGER">Department Manager</option>
                    <option value="HR_MANAGER">HR Manager</option>
                    <option value="SUPER_ADMIN">Super Admin</option>
                  </select>
                </div>
              </div>

              <div className="modal-form-grid">
                <div className="modal-field">
                  <label className="modal-label">Initial Password</label>
                  <input 
                    type="password" 
                    className="modal-input" 
                    required 
                    minLength={6} 
                    value={formData.password} 
                    onChange={e => setFormData({...formData, password: e.target.value})} 
                    placeholder="Min 6 characters"
                  />
                </div>
                <div className="modal-field">
                  <label className="modal-label">Fingerprint ID</label>
                  <input 
                    type="text" 
                    className="modal-input" 
                    value={formData.fingerprint_id} 
                    onChange={e => setFormData({...formData, fingerprint_id: e.target.value})} 
                    placeholder="e.g. FP-025"
                  />
                </div>
              </div>

              <div className="modal-form-grid">
                <div className="modal-field">
                  <label className="modal-label">Job Title</label>
                  <input 
                    type="text" 
                    className="modal-input" 
                    value={formData.job_title} 
                    onChange={e => setFormData({...formData, job_title: e.target.value})} 
                    placeholder="e.g. Software Engineer, QA Lead"
                  />
                </div>
              </div>


              <div className="modal-actions">
                <button type="button" className="modal-btn modal-btn--ghost" onClick={() => setIsModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="modal-btn modal-btn--primary">
                  <span className="material-symbols-outlined">save</span>
                  Save Personnel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Employee Detail Modal */}
      {isDetailModalOpen && selectedEmployee && (
        <div className="modal-overlay" onClick={() => { setIsDetailModalOpen(false); setIsEditing(false); }}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-header-content">
                <span className="material-symbols-outlined modal-header-icon">
                  {isEditing ? 'edit' : 'person'}
                </span>
                <div>
                  <h2 className="modal-title">{isEditing ? 'Edit Personnel' : 'Personnel Details'}</h2>
                  <p className="modal-subtitle">Unit ID: {selectedEmployee.employee_id?.slice(0,8).toUpperCase()}</p>
                </div>
              </div>
              <button className="modal-close" onClick={() => { setIsDetailModalOpen(false); setIsEditing(false); }}>
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            
            {editError && (
              <div className="modal-error">
                <span className="material-symbols-outlined">error</span>
                <span>{editError}</span>
              </div>
            )}
            
            {isEditing ? (
              <form onSubmit={handleUpdateEmployee} className="modal-form">
                <div className="modal-form-grid">
                  <div className="modal-field">
                    <label className="modal-label">First Name</label>
                    <input 
                      type="text" 
                      className="modal-input" 
                      required 
                      value={editFormData.first_name} 
                      onChange={e => setEditFormData({...editFormData, first_name: e.target.value})} 
                    />
                  </div>
                  <div className="modal-field">
                    <label className="modal-label">Last Name</label>
                    <input 
                      type="text" 
                      className="modal-input" 
                      required 
                      value={editFormData.last_name} 
                      onChange={e => setEditFormData({...editFormData, last_name: e.target.value})} 
                    />
                  </div>
                </div>

                <div className="modal-form-grid">
                  <div className="modal-field">
                    <label className="modal-label">Phone Number</label>
                    <input 
                      type="tel" 
                      className="modal-input" 
                      value={editFormData.phone} 
                      onChange={e => setEditFormData({...editFormData, phone: e.target.value})} 
                    />
                  </div>
                  <div className="modal-field">
                    <label className="modal-label">Department</label>
                    <select 
                      className="modal-input" 
                      value={editFormData.department_id} 
                      onChange={e => setEditFormData({...editFormData, department_id: e.target.value})}
                    >
                      <option value="">No Department</option>
                      {departments.map(d => (
                        <option key={d.department_id} value={d.department_id}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="modal-actions">
                  <button type="button" className="modal-btn modal-btn--ghost" onClick={() => setIsEditing(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="modal-btn modal-btn--primary">
                    <span className="material-symbols-outlined">save</span>
                    Save Changes
                  </button>
                </div>
              </form>
            ) : (
              <>
                <div className="modal-detail-content">
                  <div className="modal-detail-avatar">
                    {selectedEmployee.first_name?.charAt(0)}{selectedEmployee.last_name?.charAt(0)}
                  </div>
                  
                  <div className="modal-detail-grid">
                    <div className="modal-detail-item">
                      <span className="modal-detail-label">Full Name</span>
                      <span className="modal-detail-value">{selectedEmployee.first_name} {selectedEmployee.last_name}</span>
                    </div>
                    <div className="modal-detail-item">
                      <span className="modal-detail-label">Email</span>
                      <span className="modal-detail-value">{selectedEmployee.email || '—'}</span>
                    </div>
                    <div className="modal-detail-item">
                      <span className="modal-detail-label">Phone</span>
                      <span className="modal-detail-value">{selectedEmployee.phone || '—'}</span>
                    </div>
                    <div className="modal-detail-item">
                      <span className="modal-detail-label">Department</span>
                      <span className="modal-detail-value">{selectedEmployee.department_name || '—'}</span>
                    </div>
                    <div className="modal-detail-item">
                      <span className="modal-detail-label">Current Status</span>
                      <span className={`directory-status ${getStatusConfig(selectedEmployee.current_status).class}`}>
                        {getStatusConfig(selectedEmployee.current_status).label}
                      </span>
                    </div>
                    <div className="modal-detail-item">
                      <span className="modal-detail-label">Hire Date</span>
                      <span className="modal-detail-value">{selectedEmployee.hire_date || '—'}</span>
                    </div>
                  </div>
                </div>

                <div className="modal-actions">
                  <button 
                    type="button" 
                    className="modal-btn modal-btn--ghost" 
                    onClick={() => setIsDetailModalOpen(false)}
                  >
                    Close
                  </button>
                  <button 
                    type="button" 
                    className="modal-btn modal-btn--primary" 
                    onClick={() => setIsEditing(true)}
                  >
                    <span className="material-symbols-outlined">edit</span>
                    Edit
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Floating Action Button */}
      <button className="directory-fab" onClick={() => setIsModalOpen(true)}>
        <span className="material-symbols-outlined">person_add</span>
      </button>
    </div>
  );
}
