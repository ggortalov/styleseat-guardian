import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:5001/api',
});

// Helper: read token from whichever storage it lives in
function getToken() {
  return localStorage.getItem('token') || sessionStorage.getItem('token');
}

// Helper: clear token from both storages
function clearAuth() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  sessionStorage.removeItem('token');
  sessionStorage.removeItem('user');
}

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  config.headers['X-Timezone'] = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      const url = error.config?.url || '';
      const isAuthEndpoint = url.includes('/auth/login') || url.includes('/auth/register');
      if (!isAuthEndpoint) {
        clearAuth();
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export { getToken, clearAuth };
export default api;
