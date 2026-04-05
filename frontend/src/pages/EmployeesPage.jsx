import { useState, useEffect } from 'react';
import { employeeAPI, departmentAPI } from '../services/api';

export default function EmployeesPage() {
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [error, setError] = useState('');
  
  const initialForm = {
    first_name: '', last_name: '', email: '', phone: '',
    department_id: '', fingerprint_id: '', role_name: 'EMPLOYEE', password: ''
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
    
    // Clean up empty strings to undefined
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

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Employees</h1>
          <p className="page-subtitle">Manage staff, roles, and biometric assignments.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
          + Register Employee
        </button>
      </div>

      <div className="card">
        {loading ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>Loading...</div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Department</th>
                  <th>Status</th>
                  <th>Presence</th>
                </tr>
              </thead>
              <tbody>
                {employees.length === 0 ? (
                  <tr>
                    <td colSpan="5" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
                      No employees found.
                    </td>
                  </tr>
                ) : (
                  employees.map(emp => (
                    <tr key={emp.employee_id}>
                      <td style={{ fontWeight: 600 }}>{emp.first_name} {emp.last_name}</td>
                      <td>{emp.email}</td>
                      <td>{emp.department_name || '-'}</td>
                      <td>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: emp.status === 'ACTIVE' ? 'var(--success)' : 'var(--text-secondary)' }}>
                          {emp.status}
                        </span>
                      </td>
                      <td>
                        <span className={`status-badge ${emp.current_status?.toLowerCase().replace('_', '-') || 'outside'}`}>
                          {emp.current_status?.replace('_', ' ') || 'OUTSIDE'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isModalOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div className="card" style={{ width: '100%', maxWidth: '600px', margin: '1rem', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem' }}>Register Employee</h2>
            {error && <div style={{ color: 'var(--danger)', marginBottom: '1rem', fontSize: '0.875rem' }}>{error}</div>}
            
            <form onSubmit={handleSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">First Name</label>
                  <input type="text" className="form-input" required value={formData.first_name} onChange={e => setFormData({...formData, first_name: e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">Last Name</label>
                  <input type="text" className="form-input" required value={formData.last_name} onChange={e => setFormData({...formData, last_name: e.target.value})} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input type="email" className="form-input" required value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">Phone</label>
                  <input type="tel" className="form-input" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Department</label>
                  <select className="form-input" value={formData.department_id} onChange={e => setFormData({...formData, department_id: e.target.value})}>
                    <option value="">-- None --</option>
                    {departments.map(d => <option key={d.department_id} value={d.department_id}>{d.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Role</label>
                  <select className="form-input" value={formData.role_name} onChange={e => setFormData({...formData, role_name: e.target.value})}>
                    <option value="EMPLOYEE">Employee</option>
                    <option value="HR_MANAGER">HR Manager</option>
                    <option value="SUPER_ADMIN">Super Admin</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Initial Password</label>
                  <input type="password" className="form-input" required minLength={6} value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">Fingerprint ID (Hardware Mapping)</label>
                  <input type="text" className="form-input" placeholder="e.g. FP-025" value={formData.fingerprint_id} onChange={e => setFormData({...formData, fingerprint_id: e.target.value})} />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setIsModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Employee</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
