import api from './api';

const runService = {
  getAll: ({ limit, offset } = {}) => {
    const params = {};
    if (limit != null) params.limit = limit;
    if (offset != null) params.offset = offset;
    return api.get('/runs', { params }).then(r => r.data);
  },
  getByProject: (pid) => api.get(`/projects/${pid}/runs`).then(r => r.data),
  getById: (id) => api.get(`/runs/${id}`).then(r => r.data),
  create: (pid, data) => api.post(`/projects/${pid}/runs`, data).then(r => r.data),
  update: (id, data) => api.put(`/runs/${id}`, data).then(r => r.data),
  delete: (id) => api.delete(`/runs/${id}`).then(r => r.data),
  getResults: (id) => api.get(`/runs/${id}/results`).then(r => r.data),
  getResult: (id) => api.get(`/results/${id}`).then(r => r.data),
  updateResult: (id, data) => api.put(`/results/${id}`, data).then(r => r.data),
  getResultHistory: (id) => api.get(`/results/${id}/history`).then(r => r.data),
  importFromCircleCI: (workflowUrl) => api.post('/runs/import-circleci', { workflow_url: workflowUrl }).then(r => r.data),
  getImportStatus: () => api.get('/runs/import-status').then(r => r.data),
  getDelta: (id) => api.get(`/runs/${id}/delta`).then(r => r.data),
  bulkDelete: (ids) => api.post('/runs/bulk-delete', { ids }).then(r => r.data),
};

export default runService;
