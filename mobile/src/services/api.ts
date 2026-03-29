import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api';

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor
api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('auth_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Response interceptor
api.interceptors.response.use(
  response => response,
  error => {
    if (error.response?.status === 401) {
      SecureStore.deleteItemAsync('auth_token');
    }
    return Promise.reject(error);
  }
);

// ── Transaction API ───────────────────────────────────────────────────────────
export const transactionAPI = {
  getAll: (params: any) => api.get('/transactions', { params }),
  create: (data: FormData) => api.post('/transactions', data, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  update: (id: string, data: any) => api.put(`/transactions/${id}`, data),
  delete: (id: string) => api.delete(`/transactions/${id}`),
};

// ── Statistics API ────────────────────────────────────────────────────────────
export const statsAPI = {
  monthly: (params: any) => api.get('/statistics/monthly', { params }),
  yearly: (params: any) => api.get('/statistics/yearly', { params }),
  overview: (householdId: string) => api.get('/statistics/overview', { params: { householdId } }),
};

// ── Budget API ────────────────────────────────────────────────────────────────
export const budgetAPI = {
  getAll: (params: any) => api.get('/budgets', { params }),
  create: (data: any) => api.post('/budgets', data),
  update: (id: string, data: any) => api.put(`/budgets/${id}`, data),
  delete: (id: string) => api.delete(`/budgets/${id}`),
};

// ── Category API ──────────────────────────────────────────────────────────────
export const categoryAPI = {
  getAll: (householdId?: string) => api.get('/categories', { params: { householdId } }),
  create: (data: any) => api.post('/categories', data),
};

// ── Household API ─────────────────────────────────────────────────────────────
export const householdAPI = {
  getAll: () => api.get('/households'),
  create: (data: any) => api.post('/households', data),
  update: (id: string, data: any) => api.put(`/households/${id}`, data),
  getMembers: (id: string) => api.get(`/households/${id}/members`),
  createInvite: (id: string, data: any) => api.post(`/households/${id}/invite`, data),
  removeMember: (id: string, userId: string) => api.delete(`/households/${id}/members/${userId}`),
};

// ── OCR API ───────────────────────────────────────────────────────────────────
export const ocrAPI = {
  analyze: (imageUri: string) => {
    const form = new FormData();
    form.append('receipt', { uri: imageUri, type: 'image/jpeg', name: 'receipt.jpg' } as any);
    return api.post('/ocr/analyze', form, { headers: { 'Content-Type': 'multipart/form-data' } });
  }
};

// ── Paperless API ─────────────────────────────────────────────────────────────
export const paperlessAPI = {
  getConfig: (householdId: string) => api.get(`/paperless/config/${householdId}`),
  saveConfig: (data: any) => api.post('/paperless/config', data),
  sync: (householdId: string) => api.post(`/paperless/sync/${householdId}`),
  getData: (householdId: string) => api.get(`/paperless/data/${householdId}`),
  createDocType: (data: any) => api.post('/paperless/create-type', data),
  createCorrespondent: (data: any) => api.post('/paperless/create-correspondent', data),
  createTag: (data: any) => api.post('/paperless/create-tag', data),
  upload: (data: any) => api.post('/paperless/upload', data),
};
