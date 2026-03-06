import api from './api';

const sectionService = {
  getBySuite: (sid) => api.get(`/suites/${sid}/sections`).then(r => r.data),
  getByProject: (pid) => api.get(`/projects/${pid}/sections`).then(r => r.data),
  create: (sid, data) => api.post(`/suites/${sid}/sections`, data).then(r => r.data),
  update: (id, data) => api.put(`/sections/${id}`, data).then(r => r.data),
  delete: (id) => api.delete(`/sections/${id}`).then(r => r.data),
};

export default sectionService;
