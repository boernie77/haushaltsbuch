import { clsx } from "clsx";
import {
  BarChart2,
  BookOpen,
  Briefcase,
  CalendarDays,
  Check,
  ChevronDown,
  CreditCard,
  FileText,
  HardDrive,
  Home,
  KeyRound,
  Landmark,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Palette,
  Receipt,
  Shield,
  Sun,
  Wallet,
  X,
} from "lucide-react";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { applyThemeClasses } from "../App";
import { api, householdAPI } from "../services/api";
import { useAuthStore } from "../store/authStore";
import { APP_VERSION } from "../version";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Übersicht", exact: true },
  { to: "/transactions", icon: Receipt, label: "Buchungen" },
  { to: "/accounts", icon: CreditCard, label: "Konten" },
  { to: "/sub-accounts", icon: Briefcase, label: "Sub-Konten" },
  { to: "/calendar", icon: CalendarDays, label: "Kalender" },
  { to: "/bank-sync", icon: Landmark, label: "Bank-Sync" },
  { to: "/statistics", icon: BarChart2, label: "Statistiken" },
  { to: "/budget", icon: Wallet, label: "Budget" },
  { to: "/household", icon: Home, label: "Haushalt" },
  { to: "/backup", icon: HardDrive, label: "Datensicherung" },
  { to: "/paperless", icon: FileText, label: "Paperless" },
  { to: "/help", icon: BookOpen, label: "Anleitung" },
];

function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error("Die neuen Passwörter stimmen nicht überein.");
      return;
    }
    if (newPassword.length < 8) {
      toast.error("Das neue Passwort muss mindestens 8 Zeichen lang sein.");
      return;
    }
    setSaving(true);
    try {
      await api.put("/auth/password", { currentPassword, newPassword });
      toast.success("Passwort erfolgreich geändert.");
      onClose();
    } catch (err: any) {
      const msg = err.response?.data?.error;
      if (msg === "Current password incorrect") {
        toast.error("Das aktuelle Passwort ist falsch.");
      } else {
        toast.error("Fehler beim Ändern des Passworts.");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-800">
        <h2 className="mb-4 font-bold text-gray-900 text-lg dark:text-white">
          Passwort ändern
        </h2>
        <form className="space-y-3" onSubmit={handleSubmit}>
          <div>
            <label className="mb-1 block font-medium text-gray-700 text-sm dark:text-gray-300">
              Aktuelles Passwort
            </label>
            <input
              className="input w-full"
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              type="password"
              value={currentPassword}
            />
          </div>
          <div>
            <label className="mb-1 block font-medium text-gray-700 text-sm dark:text-gray-300">
              Neues Passwort
            </label>
            <input
              className="input w-full"
              minLength={8}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              type="password"
              value={newPassword}
            />
          </div>
          <div>
            <label className="mb-1 block font-medium text-gray-700 text-sm dark:text-gray-300">
              Neues Passwort bestätigen
            </label>
            <input
              className="input w-full"
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              type="password"
              value={confirmPassword}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button className="btn-secondary" onClick={onClose} type="button">
              Abbrechen
            </button>
            <button className="btn" disabled={saving} type="submit">
              {saving ? "Speichern…" : "Speichern"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Layout() {
  const navigate = useNavigate();
  const {
    user,
    logout,
    currentHousehold,
    households,
    setHouseholds,
    setCurrentHousehold,
    updateUser,
  } = useAuthStore();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [householdOpen, setHouseholdOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    householdAPI
      .getAll()
      .then(({ data }) => {
        setHouseholds(data.households);
        if (!currentHousehold && data.households.length > 0) {
          setCurrentHousehold(data.households[0]);
        }
      })
      .catch(() => {});
  }, []);

  // Close user menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        userMenuRef.current &&
        !userMenuRef.current.contains(e.target as Node)
      ) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const handleThemeChange = async (newTheme: string) => {
    try {
      await api.put("/auth/profile", { theme: newTheme });
      updateUser({ theme: newTheme as any });
      applyThemeClasses(newTheme);
    } catch {}
  };

  return (
    <div className="layout-bg flex h-screen bg-pink-50 dark:bg-slate-900">
      {/* Modals */}
      {showPasswordModal && (
        <ChangePasswordModal onClose={() => setShowPasswordModal(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={clsx(
          "flex flex-col border-pink-100 border-r bg-white transition-all duration-300 dark:border-slate-700 dark:bg-slate-800",
          sidebarOpen ? "w-64" : "w-16"
        )}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 border-pink-100 border-b p-4 dark:border-slate-700">
          <span className="text-2xl">💰</span>
          {sidebarOpen && (
            <span className="font-bold text-[var(--primary)] text-lg">
              Haushaltsbuch
            </span>
          )}
          <button
            className="ml-auto text-gray-400 hover:text-[var(--primary)]"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>

        {/* Household Selector */}
        {sidebarOpen && (
          <div className="border-pink-100 border-b p-3 dark:border-slate-700">
            <button
              className="flex w-full items-center justify-between rounded-lg p-2 text-sm hover:bg-pink-50 dark:hover:bg-slate-700"
              onClick={() => setHouseholdOpen(!householdOpen)}
            >
              <span className="flex items-center gap-2 truncate">
                <Home className="shrink-0 text-[var(--primary)]" size={16} />
                <span className="truncate text-gray-700 dark:text-gray-300">
                  {currentHousehold?.name || "Haushalt wählen"}
                </span>
              </span>
              <ChevronDown className="shrink-0 text-gray-400" size={14} />
            </button>
            {householdOpen && (
              <div className="mt-1 overflow-hidden rounded-lg bg-pink-50 dark:bg-slate-700">
                {households.map((h) => (
                  <button
                    className={clsx(
                      "w-full px-3 py-2 text-left text-sm hover:bg-pink-100 dark:hover:bg-slate-600",
                      currentHousehold?.id === h.id
                        ? "font-medium text-[var(--primary)]"
                        : "text-gray-700 dark:text-gray-300"
                    )}
                    key={h.id}
                    onClick={() => {
                      setCurrentHousehold(h);
                      setHouseholdOpen(false);
                    }}
                  >
                    {h.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4">
          {navItems.map(({ to, icon: Icon, label, exact }) => (
            <NavLink
              className={({ isActive }) =>
                clsx(
                  "mx-2 mb-1 flex items-center gap-3 rounded-xl px-4 py-3 font-medium text-sm transition-all",
                  isActive
                    ? "bg-[var(--primary)] text-white shadow-sm"
                    : "text-gray-600 hover:bg-pink-50 dark:text-gray-400 dark:hover:bg-slate-700"
                )
              }
              end={exact}
              key={to}
              to={to}
            >
              <Icon className="shrink-0" size={20} />
              {sidebarOpen && label}
            </NavLink>
          ))}

          {(user?.role === "admin" || user?.role === "superadmin") && (
              <NavLink
                className={({ isActive }) =>
                  clsx(
                    "mx-2 mb-1 flex items-center gap-3 rounded-xl px-4 py-3 font-medium text-sm transition-all",
                    isActive
                      ? "bg-[var(--primary)] text-white"
                      : "text-gray-600 hover:bg-pink-50 dark:text-gray-400 dark:hover:bg-slate-700"
                  )
                }
                to="/admin"
              >
                <Shield className="shrink-0" size={20} />
                {sidebarOpen && "Administration"}
              </NavLink>
            )}
        </nav>

        {/* User */}
        <div className="border-pink-100 border-t p-4 dark:border-slate-700">
          {sidebarOpen ? (
            <div className="relative" ref={userMenuRef}>
              <button
                className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-pink-50 dark:hover:bg-slate-700"
                onClick={() => setUserMenuOpen(!userMenuOpen)}
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--primary)] font-bold text-sm text-white">
                  {user?.name?.charAt(0)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-gray-900 text-sm dark:text-gray-100">
                    {user?.name}
                  </p>
                  <p className="truncate text-gray-500 text-xs">
                    {user?.email}
                  </p>
                </div>
                <ChevronDown className="shrink-0 text-gray-400" size={14} />
              </button>

              {/* Dropdown Menu */}
              {userMenuOpen && (
                <div className="absolute right-0 bottom-full left-0 mb-1 overflow-hidden rounded-xl border border-pink-100 bg-white shadow-lg dark:border-slate-600 dark:bg-slate-800">
                  <button
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-gray-700 text-sm hover:bg-pink-50 dark:text-gray-300 dark:hover:bg-slate-700"
                    onClick={() => {
                      setUserMenuOpen(false);
                      setShowPasswordModal(true);
                    }}
                  >
                    <KeyRound className="text-gray-400" size={15} />
                    Passwort ändern
                  </button>
                  <div className="border-pink-100 border-t dark:border-slate-600" />
                  <p className="px-4 pt-2 pb-1 font-medium text-gray-400 text-xs uppercase tracking-wide">
                    Design
                  </p>
                  {(
                    [
                      { v: "feminine", icon: Sun, label: "Rosa (Hell)" },
                      { v: "masculine", icon: Moon, label: "Dunkel Blau" },
                      {
                        v: "professional-light",
                        icon: Palette,
                        label: "Professional Hell",
                      },
                      {
                        v: "professional-dark",
                        icon: Palette,
                        label: "Professional Dunkel",
                      },
                    ] as const
                  ).map(({ v, icon: Icon, label }) => (
                    <button
                      className={clsx(
                        "flex w-full items-center gap-2 px-4 py-2 text-left text-sm",
                        user?.theme === v
                          ? "font-medium text-[var(--primary)]"
                          : "sidebar-hover text-gray-700 hover:bg-pink-50 dark:text-gray-300 dark:hover:bg-slate-700"
                      )}
                      key={v}
                      onClick={() => {
                        setUserMenuOpen(false);
                        handleThemeChange(v);
                      }}
                    >
                      <Icon className="text-gray-400" size={15} />
                      {label}
                      {user?.theme === v && (
                        <Check className="ml-auto" size={13} />
                      )}
                    </button>
                  ))}
                  <button
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-red-500 text-sm hover:bg-red-50 dark:hover:bg-red-900/20"
                    onClick={() => {
                      setUserMenuOpen(false);
                      handleLogout();
                    }}
                  >
                    <LogOut size={15} />
                    Abmelden
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <button
                className="text-gray-400 hover:text-[var(--primary)]"
                onClick={() => {
                  setSidebarOpen(true);
                  setUserMenuOpen(true);
                }}
                title="Design wechseln"
              >
                <Palette size={20} />
              </button>
              <button
                className="text-gray-400 hover:text-red-500"
                onClick={handleLogout}
              >
                <LogOut size={20} />
              </button>
            </div>
          )}
        </div>
        {/* Footer Links */}
        {sidebarOpen && (
          <div className="flex gap-3 px-4 pb-3 text-gray-400 text-xs dark:text-gray-600">
            <Link className="hover:text-[var(--primary)]" to="/impressum">
              Impressum
            </Link>
            <Link className="hover:text-[var(--primary)]" to="/datenschutz">
              Datenschutz
            </Link>
          </div>
        )}

        {/* Version — IMMER sichtbar (auch wenn Sidebar zugeklappt) */}
        <div
          className="border-pink-100 border-t px-2 py-2 text-center text-gray-400 text-xs dark:border-slate-700"
          title={`Version ${APP_VERSION}`}
        >
          v{APP_VERSION}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
