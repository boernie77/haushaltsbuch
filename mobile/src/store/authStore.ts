import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { api } from '../services/api';

interface User {
  id: string;
  name: string;
  email: string;
  role: 'superadmin' | 'admin' | 'member';
  theme: 'feminine' | 'masculine';
  avatar?: string;
}

interface Household {
  id: string;
  name: string;
  currency: string;
  monthlyBudget?: number;
  budgetWarningAt: number;
  memberRole: string;
}

interface AuthState {
  token: string | null;
  user: User | null;
  currentHousehold: Household | null;
  households: Household[];
  isLoading: boolean;
  isAuthenticated: boolean;

  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string, inviteCode?: string) => Promise<void>;
  logout: () => Promise<void>;
  loadStoredAuth: () => Promise<void>;
  setCurrentHousehold: (household: Household) => void;
  setHouseholds: (households: Household[]) => void;
  updateTheme: (theme: 'feminine' | 'masculine') => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: null,
  user: null,
  currentHousehold: null,
  households: [],
  isLoading: false,
  isAuthenticated: false,

  login: async (email, password) => {
    set({ isLoading: true });
    try {
      const { data } = await api.post('/auth/login', { email, password });
      await SecureStore.setItemAsync('auth_token', data.token);
      api.defaults.headers.common['Authorization'] = `Bearer ${data.token}`;
      set({ token: data.token, user: data.user, isAuthenticated: true, isLoading: false });
    } catch (err: any) {
      set({ isLoading: false });
      throw new Error(err.response?.data?.error || 'Login failed');
    }
  },

  register: async (name, email, password, inviteCode) => {
    set({ isLoading: true });
    try {
      const { data } = await api.post('/auth/register', { name, email, password, inviteCode });
      await SecureStore.setItemAsync('auth_token', data.token);
      api.defaults.headers.common['Authorization'] = `Bearer ${data.token}`;
      set({ token: data.token, user: data.user, isAuthenticated: true, isLoading: false });
    } catch (err: any) {
      set({ isLoading: false });
      throw new Error(err.response?.data?.error || 'Registration failed');
    }
  },

  logout: async () => {
    await SecureStore.deleteItemAsync('auth_token');
    delete api.defaults.headers.common['Authorization'];
    set({ token: null, user: null, currentHousehold: null, households: [], isAuthenticated: false });
  },

  loadStoredAuth: async () => {
    try {
      const token = await SecureStore.getItemAsync('auth_token');
      if (!token) return;

      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      const { data } = await api.get('/auth/me');
      set({ token, user: data.user, isAuthenticated: true });
    } catch {
      await SecureStore.deleteItemAsync('auth_token');
    }
  },

  setCurrentHousehold: (household) => set({ currentHousehold: household }),
  setHouseholds: (households) => set({ households }),
  updateTheme: (theme) => set(state => ({ user: state.user ? { ...state.user, theme } : null })),
}));
