import * as SecureStore from "expo-secure-store";
import { create } from "zustand";
import { api } from "../services/api";

interface User {
  avatar?: string;
  email: string;
  id: string;
  name: string;
  role: "superadmin" | "admin" | "member";
  theme: "feminine" | "masculine" | "professional-light" | "professional-dark";
}

interface Household {
  budgetWarningAt: number;
  currency: string;
  id: string;
  memberRole: string;
  monthlyBudget?: number;
  monthStartDay?: number;
  name: string;
}

interface AuthState {
  currentHousehold: Household | null;
  households: Household[];
  isAuthenticated: boolean;
  isLoading: boolean;
  loadStoredAuth: () => Promise<void>;

  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  register: (
    name: string,
    email: string,
    password: string,
    inviteCode?: string
  ) => Promise<void>;
  setCurrentHousehold: (household: Household) => void;
  setHouseholds: (households: Household[]) => void;
  token: string | null;
  updateTheme: (
    theme: "feminine" | "masculine" | "professional-light" | "professional-dark"
  ) => void;
  user: User | null;
}

export const useAuthStore = create<AuthState>((set, _get) => ({
  token: null,
  user: null,
  currentHousehold: null,
  households: [],
  isLoading: false,
  isAuthenticated: false,

  login: async (email, password) => {
    set({ isLoading: true });
    try {
      const { data } = await api.post("/auth/login", { email, password });
      await SecureStore.setItemAsync("auth_token", data.token);
      api.defaults.headers.common.Authorization = `Bearer ${data.token}`;
      set({
        token: data.token,
        user: data.user,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (err: any) {
      set({ isLoading: false });
      throw new Error(err.response?.data?.error || "Login failed");
    }
  },

  register: async (name, email, password, inviteCode) => {
    set({ isLoading: true });
    try {
      const { data } = await api.post("/auth/register", {
        name,
        email,
        password,
        inviteCode,
      });
      await SecureStore.setItemAsync("auth_token", data.token);
      api.defaults.headers.common.Authorization = `Bearer ${data.token}`;
      set({
        token: data.token,
        user: data.user,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (err: any) {
      set({ isLoading: false });
      throw new Error(err.response?.data?.error || "Registration failed");
    }
  },

  logout: async () => {
    await SecureStore.deleteItemAsync("auth_token");
    api.defaults.headers.common.Authorization = undefined;
    set({
      token: null,
      user: null,
      currentHousehold: null,
      households: [],
      isAuthenticated: false,
    });
  },

  loadStoredAuth: async () => {
    set({ isLoading: true });
    try {
      const token = await SecureStore.getItemAsync("auth_token");
      if (!token) {
        set({ isLoading: false });
        return;
      }

      api.defaults.headers.common.Authorization = `Bearer ${token}`;
      const { data } = await api.get("/auth/me");
      const { data: hd } = await api.get("/households");
      const households = hd.households || [];
      set({
        token,
        user: data.user,
        isAuthenticated: true,
        isLoading: false,
        households,
        currentHousehold: households[0] || null,
      });
    } catch {
      await SecureStore.deleteItemAsync("auth_token");
      set({ isLoading: false });
    }
  },

  setCurrentHousehold: (household) => set({ currentHousehold: household }),
  setHouseholds: (households) => set({ households }),
  updateTheme: (theme) =>
    set((state) => ({ user: state.user ? { ...state.user, theme } : null })),
}));
