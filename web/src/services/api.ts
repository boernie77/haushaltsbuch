import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || '/api';

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
});

api.interceptors.request.use(config => {
  const token = localStorage.getItem('auth_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('auth_token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export const transactionAPI = {
  getAll: (params: any) => api.get('/transactions', { params }),
  create: (data: FormData) => api.post('/transactions', data, { headers: { 'Content-Type': 'multipart/form-data' } }),
  update: (id: string, data: any) => api.put(`/transactions/${id}`, data),
  delete: (id: string) => api.delete(`/transactions/${id}`),
};

export const statsAPI = {
  monthly: (p: any) => api.get('/statistics/monthly', { params: p }),
  yearly: (p: any) => api.get('/statistics/yearly', { params: p }),
  overview: (householdId: string) => api.get('/statistics/overview', { params: { householdId } }),
};

export const budgetAPI = {
  getAll: (p: any) => api.get('/budgets', { params: p }),
  create: (d: any) => api.post('/budgets', d),
  update: (id: string, d: any) => api.put(`/budgets/${id}`, d),
  delete: (id: string) => api.delete(`/budgets/${id}`),
};

export const categoryAPI = {
  getAll: (householdId?: string) => api.get('/categories', { params: { householdId } }),
  create: (d: any) => api.post('/categories', d),
};

export const householdAPI = {
  getAll: () => api.get('/households'),
  create: (d: any) => api.post('/households', d),
  update: (id: string, d: any) => api.put(`/households/${id}`, d),
  getMembers: (id: string) => api.get(`/households/${id}/members`),
  createInvite: (id: string, d: any) => api.post(`/households/${id}/invite`, d),
  removeMember: (id: string, userId: string) => api.delete(`/households/${id}/members/${userId}`),
  getAiSettings: (id: string) => api.get(`/households/${id}/ai-settings`),
  saveAiSettings: (id: string, d: { aiEnabled: boolean; apiKey: string }) => api.put(`/households/${id}/ai-settings`, d),
};

export const ocrAPI = {
  status: () => api.get('/ocr/status'),
  analyze: (file: File) => {
    const fd = new FormData();
    fd.append('receipt', file);
    return api.post('/ocr/analyze', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
};

export const paperlessAPI = {
  getConfig: (hid: string) => api.get(`/paperless/config/${hid}`),
  saveConfig: (d: any) => api.post('/paperless/config', d),
  sync: (hid: string) => api.post(`/paperless/sync/${hid}`),
  getData: (hid: string) => api.get(`/paperless/data/${hid}`),
  createDocType: (d: any) => api.post('/paperless/create-type', d),
  createCorrespondent: (d: any) => api.post('/paperless/create-correspondent', d),
  createTag: (d: any) => api.post('/paperless/create-tag', d),
  upload: (d: any) => api.post('/paperless/upload', d),
};

export const adminAPI = {
  getStats: () => api.get('/admin/stats'),
  getUsers: (p?: any) => api.get('/admin/users', { params: p }),
  updateUser: (id: string, d: any) => api.put(`/admin/users/${id}`, d),
  deleteUser: (id: string) => api.delete(`/admin/users/${id}`),
  getHouseholds: () => api.get('/admin/households'),
  createInviteCode: (d: any) => api.post('/admin/invite-codes', d),
  getInviteCodes: () => api.get('/admin/invite-codes'),
  getAiSettings: () => api.get('/admin/ai-settings'),
  saveAiSettings: (d: { apiKey: string; aiKeyPublic: boolean }) => api.put('/admin/ai-settings', d),
  toggleAiGrant: (id: string) => api.put(`/admin/users/${id}/ai-grant`),
};
