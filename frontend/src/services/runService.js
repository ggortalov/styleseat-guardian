import api from './api';

const runService = {
  getAll: () => api.get('/runs').then(r => r.data),
  getByProject: (pid) => api.get(`/projects/${pid}/runs`).then(r => r.data),
  getById: (id) => api.get(`/runs/${id}`).then(r => r.data),
  create: (pid, data) => api.post(`/projects/${pid}/runs`, data).then(r => r.data),
  update: (id, data) => api.put(`/runs/${id}`, data).then(r => r.data),
  delete: (id) => api.delete(`/runs/${id}`).then(r => r.data),
  getResults: (id) => api.get(`/runs/${id}/results`).then(r => r.data),
  getResult: (id) => api.get(`/results/${id}`).then(r => r.data),
  updateResult: (id, data) => api.put(`/results/${id}`, data).then(r => r.data),
  getResultHistory: (id) => api.get(`/results/${id}/history`).then(r => r.data),
};

export default runService;
