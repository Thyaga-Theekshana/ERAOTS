/**
 * ERAOTS API Service.
 * Centralized HTTP client for all backend API calls.
 */
import axios from 'axios';

const API_BASE = 'http://localhost:8000';

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
};

// ==================== ATTENDANCE ====================
export const attendanceAPI = {
  process: (targetDate) => api.post('/api/attendance/process', null, { params: { target_date: targetDate } }),
  list: (params) => api.get('/api/attendance/', { params }),
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
