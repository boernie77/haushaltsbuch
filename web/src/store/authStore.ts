import { create } from "zustand";
import { api } from "../services/api";

interface User {
  avatar?: string;
  email: string;
  id: string;
  isActive: boolean;
  name: string;
  role: "superadmin" | "admin" | "member";
  subscriptionActive: boolean;
  subscriptionType: "trial" | "monthly" | null;
  theme: "feminine" | "masculine";
  trialEndsAt: string | null;
  trialStartedAt: string | null;
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
  loadStoredAuth: () => Promise<void>;

  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  register: (
    name: string,
    email: string,
    password: string,
    inviteCode?: string
  ) => Promise<void>;
  setCurrentHousehold: (h: Household) => void;
  setHouseholds: (h: Household[]) => void;
  token: string | null;
  updateUser: (data: Partial<User>) => void;
  user: User | null;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: null,
  user: null,
  currentHousehold: null,
  households: [],
  isAuthenticated: false,

  login: async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    localStorage.setItem("auth_token", data.token);
    api.defaults.headers.common.Authorization = `Bearer ${data.token}`;
    set({ token: data.token, user: data.user, isAuthenticated: true });
    const { data: hd } = await api.get("/households");
    if (hd.households?.length > 0) {
      set({ households: hd.households, currentHousehold: hd.households[0] });
    }
  },

  register: async (name, email, password, inviteCode) => {
    const { data } = await api.post("/auth/register", {
      name,
      email,
      password,
      inviteCode,
    });
    localStorage.setItem("auth_token", data.token);
    api.defaults.headers.common.Authorization = `Bearer ${data.token}`;
    set({ token: data.token, user: data.user, isAuthenticated: true });
    const { data: hd } = await api.get("/households");
    if (hd.households?.length > 0) {
      set({ households: hd.households, currentHousehold: hd.households[0] });
    }
  },

  logout: () => {
    localStorage.removeItem("auth_token");
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
    const token = localStorage.getItem("auth_token");
    if (!token) {
      return;
    }
    try {
      api.defaults.headers.common.Authorization = `Bearer ${token}`;
      const { data } = await api.get("/auth/me");
      set({ token, user: data.user, isAuthenticated: true });
      // Also load households so page-refresh works without re-login
      const { data: hd } = await api.get("/households");
      if (hd.households?.length > 0) {
        set((state) => ({
          households: hd.households,
          currentHousehold: state.currentHousehold ?? hd.households[0],
        }));
      }
    } catch {
      localStorage.removeItem("auth_token");
    }
  },

  setCurrentHousehold: (currentHousehold) => set({ currentHousehold }),
  setHouseholds: (households) => set({ households }),
  updateUser: (data) =>
    set((state) => ({ user: state.user ? { ...state.user, ...data } : null })),
}));
