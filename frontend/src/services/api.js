/**
 * ERAOTS API Service.
 * Centralized HTTP client for all backend API calls.
 * 
 * Configuration:
 *   - API_BASE is set via VITE_API_URL environment variable
 *   - Default fallback: http://localhost:8000
 *   - Set in .env file: VITE_API_URL=http://your-api-server:8000
 */
import axios from 'axios';

// Use Vite environment variable, fallback to localhost for development
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// Export for use in other modules (e.g., WebSocket URL generation)
export const getApiBaseUrl = () => API_BASE;

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('eraots_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 — redirect to login
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('eraots_token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// ==================== AUTH ====================
export const authAPI = {
  login: (email, password) => {
    const formData = new URLSearchParams();
    formData.append('username', email);
    formData.append('password', password);
    return api.post('/api/auth/login', formData, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
  },
  getMe: () => api.get('/api/auth/me'),
  updateProfile: (data) => api.put('/api/auth/me/profile', data),
  changePassword: (currentPassword, newPassword) => 
    api.put('/api/auth/me/password', { current_password: currentPassword, new_password: newPassword }),
};

// ==================== EMPLOYEES ====================
export const employeeAPI = {
  list: (params) => api.get('/api/employees', { params }),
  get: (id) => api.get(`/api/employees/${id}`),
  create: (data) => api.post('/api/employees', data),
  update: (id, data) => api.put(`/api/employees/${id}`, data),
};

// ==================== DEPARTMENTS ====================
export const departmentAPI = {
  list: () => api.get('/api/departments'),
  create: (data) => api.post('/api/departments', data),
  update: (id, data) => api.put(`/api/departments/${id}`, data),
};

// ==================== EVENTS & OCCUPANCY ====================
export const eventsAPI = {
  scan: (data) => api.post('/api/events/scan', data),
  recent: (limit = 50) => api.get('/api/events/recent', { params: { limit } }),
  occupancy: () => api.get('/api/events/occupancy'),
  employeeStates: (status) => api.get('/api/events/occupancy/employees', { params: { status_filter: status } }),
  // Status override - manual toggle between ACTIVE/IN_MEETING
  statusOverride: (newStatus) => api.put('/api/events/status-override', null, { params: { new_status: newStatus } }),
  // Pending transitions (meeting confirmations)
  getPendingTransitions: () => api.get('/api/events/pending-transitions'),
  confirmTransition: (transitionId) => api.put(`/api/events/pending-transitions/${transitionId}/action`, null, { params: { action: 'CONFIRM' } }),
  cancelTransition: (transitionId) => api.put(`/api/events/pending-transitions/${transitionId}/action`, null, { params: { action: 'CANCEL' } }),
  // Status timeline — daily breakdown of active/meeting/break time (FR4)
  statusTimeline: (employeeId, date) => api.get(`/api/events/status-timeline/${employeeId}`, { params: { target_date: date } }),
  // Calendar integration
  getCalendarSettings: () => api.get('/api/events/calendar-settings'),
  updateCalendarSettings: (data) => api.put('/api/events/calendar-settings', data),
  // Important meetings
  listSpecialMeetings: () => api.get('/api/events/special-meetings'),
  createSpecialMeeting: (data) => api.post('/api/events/special-meetings', data),
  triggerSpecialMeeting: (meetingId) => api.post(`/api/events/special-meetings/${meetingId}/trigger`),
};

// ==================== ATTENDANCE ====================
export const attendanceAPI = {
  process: (targetDate) => api.post('/api/attendance/process', null, { params: { target_date: targetDate } }),
  list: (params) => api.get('/api/attendance/', { params }),
};

// ==================== SCHEDULES & LEAVE ====================
export const scheduleAPI = {
  list: (params) => api.get('/api/schedules/', { params }),
  mySchedule: (params) => api.get('/api/schedules/my-schedule', { params }),
  create: (data) => api.post('/api/schedules/', data),
  update: (id, data) => api.put(`/api/schedules/${id}`, data),
};

export const leaveAPI = {
  getTypes: () => api.get('/api/schedules/leave-types'),
  submitRequest: (data) => api.post('/api/schedules/leave-requests', data),
  listRequests: (status) => api.get('/api/schedules/leave-requests', { params: { status } }),
  myRequests: () => api.get('/api/schedules/leave-requests/my'),
  getUsage: (year) => api.get('/api/schedules/leave-usage', { params: { year } }),
  getBalance: (year) => api.get('/api/schedules/leave-balance', { params: { year } }),
  getCalendar: (month) => api.get('/api/schedules/leave-calendar', { params: { month } }),
  getHolidays: (month) => api.get('/api/schedules/leave-holidays', { params: { month } }),
  exportMyRequests: (format = 'pdf', month = null) =>
    api.get('/api/schedules/leave-requests/my/export', { params: { format, month }, responseType: 'blob' }),
  cancelRequest: (id) => api.put(`/api/schedules/leave-requests/${id}/cancel`),
  updateStatus: (id, status_val, comment) => api.put(`/api/schedules/leave-requests/${id}/status`, null, { params: { status: status_val, comment } })
};

// ==================== CORRECTIONS ====================
export const correctionsAPI = {
  submit: (data) => api.post('/api/corrections/', data),
  list: (status) => api.get('/api/corrections/', { params: { status } }),
  updateStatus: (id, status_val, comment) => api.put(`/api/corrections/${id}/status`, null, { params: { status: status_val, comment } })
};

// ==================== NOTIFICATIONS ====================
export const notificationsAPI = {
  list: (limit = 10) => api.get('/api/notifications/', { params: { limit } }),
  markRead: (id) => api.put(`/api/notifications/${id}/read`)
};

// ==================== EMERGENCY ====================
export const emergencyAPI = {
  getActive: () => api.get('/api/emergency/active'),
  getHistory: () => api.get('/api/emergency/'),
  trigger: (data) => api.post('/api/emergency/trigger', data),
  resolve: (id) => api.put(`/api/emergency/${id}/resolve`),
  markAccounted: (headcountId) => api.put(`/api/emergency/headcount/${headcountId}/account`),
  // Safety Check
  sendSafetyCheck: (emergencyId, data = {}) => api.post(`/api/emergency/${emergencyId}/safety-check`, data),
  getSafetyCheck: (emergencyId, statusFilter) => api.get(`/api/emergency/${emergencyId}/safety-check`, { params: { status_filter: statusFilter } }),
  respondSafetyCheck: (response) => api.put('/api/emergency/safety-check/respond', { response }),
};

// ==================== HARDWARE SCANNERS (See FR13 later in file) ====================

// ==================== SYSTEM SETTINGS ====================
export const settingsAPI = {
  getPolicies: () => api.get('/api/settings/policies'),
  updatePolicy: (id, value) => api.put(`/api/settings/policies/${id}`, { value })
};

// ==================== CALENDAR SYNC ====================
export const calendarAPI = {
  getConnectUrl: () => api.get('/api/calendar/connect'),
  disconnect: () => api.delete('/api/calendar/disconnect'),
  getSettings: () => api.get('/api/events/calendar-settings'),
  updateSettings: (data) => api.put('/api/events/calendar-settings', data)
};

// ==================== PRODUCTIVITY ====================
export const productivityAPI = {
  getMyStats: () => api.get('/api/productivity/my-stats'),
  getTeamStats: (date) => api.get('/api/productivity/team-stats', { params: { date } })
};

// ==================== REPORTS & EXPORTS ====================
export const reportsAPI = {
  /**
   * Export attendance report.
   * @param {string} startDate - Start date (YYYY-MM-DD)
   * @param {string} endDate - End date (YYYY-MM-DD)
   * @param {string} format - Export format: csv, excel, pdf
   * @param {string} departmentId - Optional department filter
   */
  exportAttendance: (startDate, endDate, format = 'excel', departmentId = null) => {
    const params = { start_date: startDate, end_date: endDate, format };
    if (departmentId) params.department_id = departmentId;
    return api.get('/api/reports/attendance', { params, responseType: 'blob' });
  },
  
  /**
   * Export employee directory.
   */
  exportEmployees: (format = 'excel', departmentId = null, status = null) => {
    const params = { format };
    if (departmentId) params.department_id = departmentId;
    if (status) params.status = status;
    return api.get('/api/reports/employees', { params, responseType: 'blob' });
  },
  
  /**
   * Export late arrivals report.
   */
  exportLateArrivals: (startDate, endDate, format = 'excel') => {
    return api.get('/api/reports/late-arrivals', {
      params: { start_date: startDate, end_date: endDate, format },
      responseType: 'blob'
    });
  },
  
  /**
   * Export department summary.
   */
  exportDepartmentSummary: (startDate, endDate, format = 'excel') => {
    return api.get('/api/reports/department-summary', {
      params: { start_date: startDate, end_date: endDate, format },
      responseType: 'blob'
    });
  }
};

/**
 * Helper function to download a blob response as a file.
 * @param {Blob} blob - The blob data
 * @param {string} filename - Suggested filename
 */
export const downloadBlob = (blob, filename) => {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

// ==================== WEBSOCKET ====================
export const createDashboardSocket = (onMessage) => {
  const wsUrl = API_BASE.replace('http', 'ws') + '/api/events/ws/dashboard';
  const ws = new WebSocket(wsUrl);
  
  ws.onopen = () => console.log('[WS] Dashboard connected');
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    onMessage(data);
  };
  ws.onclose = () => {
    console.log('[WS] Dashboard disconnected. Reconnecting in 3s...');
    setTimeout(() => createDashboardSocket(onMessage), 3000);
  };
  ws.onerror = (err) => console.error('[WS] Error:', err);
  
  return ws;
};

export default api;


// ==================== HARDWARE (FR13) ====================
export const hardwareAPI = {
  getHealth: () => api.get('/api/scanners/health'),
  getHealthHistory: (scannerId) => api.get(`/api/scanners/${scannerId}/health-history`),
  register: (data) => api.post('/api/scanners', data),
  list: () => api.get('/api/scanners'),
  sendHeartbeat: (scannerId, data) => api.post(`/api/scanners/${scannerId}/heartbeat`, data),
  syncBuffer: (scannerId, data) => api.post(`/api/scanners/${scannerId}/buffer-sync`, data),
  restart: (scannerId) => api.post(`/api/scanners/${scannerId}/restart`),
};
