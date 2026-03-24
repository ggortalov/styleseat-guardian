import api from './api';

const dashboardService = {
  getGlobal: () => api.get('/dashboard').then(r => r.data),
  getByProject: (pid, params = {}) => api.get(`/projects/${pid}/dashboard`, { params }).then(r => r.data),
  getSyncLogs: (params = {}) => api.get('/sync-logs', { params }).then(r => r.data),
};

export default dashboardService;
