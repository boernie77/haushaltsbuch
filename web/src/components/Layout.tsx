import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Receipt, BarChart2, Wallet, Home, FileText, Shield, LogOut, Menu, X, ChevronDown, HardDrive, Sun, Moon
} from 'lucide-react';
import { clsx } from 'clsx';
import { useAuthStore } from '../store/authStore';
import { api, householdAPI } from '../services/api';
import { useEffect } from 'react';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Übersicht', exact: true },
  { to: '/transactions', icon: Receipt, label: 'Buchungen' },
  { to: '/statistics', icon: BarChart2, label: 'Statistiken' },
  { to: '/budget', icon: Wallet, label: 'Budget' },
  { to: '/household', icon: Home, label: 'Haushalt' },
  { to: '/backup', icon: HardDrive, label: 'Datensicherung' },
  { to: '/paperless', icon: FileText, label: 'Paperless' },
];

export default function Layout() {
  const navigate = useNavigate();
  const { user, logout, currentHousehold, households, setHouseholds, setCurrentHousehold, updateUser } = useAuthStore();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [householdOpen, setHouseholdOpen] = useState(false);

  useEffect(() => {
    householdAPI.getAll().then(({ data }) => {
      setHouseholds(data.households);
      if (!currentHousehold && data.households.length > 0) setCurrentHousehold(data.households[0]);
    }).catch(() => {});
  }, []);

  const handleLogout = () => { logout(); navigate('/login'); };

  const handleThemeToggle = async () => {
    const newTheme = user?.theme === 'masculine' ? 'feminine' : 'masculine';
    try {
      await api.put('/auth/profile', { theme: newTheme });
      updateUser({ theme: newTheme });
      if (newTheme === 'masculine') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    } catch {}
  };

  return (
    <div className="flex h-screen bg-pink-50 dark:bg-slate-900">
      {/* Sidebar */}
      <aside className={clsx(
        'flex flex-col transition-all duration-300 bg-white dark:bg-slate-800 border-r border-pink-100 dark:border-slate-700',
        sidebarOpen ? 'w-64' : 'w-16'
      )}>
        {/* Logo */}
        <div className="flex items-center gap-3 p-4 border-b border-pink-100 dark:border-slate-700">
          <span className="text-2xl">💰</span>
          {sidebarOpen && <span className="font-bold text-lg text-[var(--primary)]">Haushaltsbuch</span>}
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="ml-auto text-gray-400 hover:text-[var(--primary)]">
            {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>

        {/* Household Selector */}
        {sidebarOpen && (
          <div className="p-3 border-b border-pink-100 dark:border-slate-700">
            <button
              onClick={() => setHouseholdOpen(!householdOpen)}
              className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-pink-50 dark:hover:bg-slate-700 text-sm"
            >
              <span className="flex items-center gap-2 truncate">
                <Home size={16} className="text-[var(--primary)] shrink-0" />
                <span className="truncate text-gray-700 dark:text-gray-300">{currentHousehold?.name || 'Haushalt wählen'}</span>
              </span>
              <ChevronDown size={14} className="text-gray-400 shrink-0" />
            </button>
            {householdOpen && (
              <div className="mt-1 bg-pink-50 dark:bg-slate-700 rounded-lg overflow-hidden">
                {households.map(h => (
                  <button
                    key={h.id}
                    onClick={() => { setCurrentHousehold(h); setHouseholdOpen(false); }}
                    className={clsx(
                      'w-full text-left px-3 py-2 text-sm hover:bg-pink-100 dark:hover:bg-slate-600',
                      currentHousehold?.id === h.id ? 'text-[var(--primary)] font-medium' : 'text-gray-700 dark:text-gray-300'
                    )}
                  >
                    {h.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 py-4 overflow-y-auto">
          {navItems.map(({ to, icon: Icon, label, exact }) => (
            <NavLink
              key={to}
              to={to}
              end={exact}
              className={({ isActive }) => clsx(
                'flex items-center gap-3 px-4 py-3 mx-2 rounded-xl mb-1 transition-all text-sm font-medium',
                isActive
                  ? 'bg-[var(--primary)] text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-pink-50 dark:hover:bg-slate-700'
              )}
            >
              <Icon size={20} className="shrink-0" />
              {sidebarOpen && label}
            </NavLink>
          ))}

          {(user?.role === 'admin' || user?.role === 'superadmin') && (
            <NavLink
              to="/admin"
              className={({ isActive }) => clsx(
                'flex items-center gap-3 px-4 py-3 mx-2 rounded-xl mb-1 transition-all text-sm font-medium',
                isActive ? 'bg-[var(--primary)] text-white' : 'text-gray-600 dark:text-gray-400 hover:bg-pink-50 dark:hover:bg-slate-700'
              )}
            >
              <Shield size={20} className="shrink-0" />
              {sidebarOpen && 'Administration'}
            </NavLink>
          )}
        </nav>

        {/* User */}
        <div className="p-4 border-t border-pink-100 dark:border-slate-700">
          {sidebarOpen ? (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-[var(--primary)] flex items-center justify-center text-white text-sm font-bold shrink-0">
                {user?.name?.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate text-gray-900 dark:text-gray-100">{user?.name}</p>
                <p className="text-xs text-gray-500 truncate">{user?.email}</p>
              </div>
              <button onClick={handleThemeToggle} className="text-gray-400 hover:text-[var(--primary)]" title={user?.theme === 'masculine' ? 'Helles Design' : 'Dunkles Design'}>
                {user?.theme === 'masculine' ? <Sun size={16} /> : <Moon size={16} />}
              </button>
              <button onClick={handleLogout} className="text-gray-400 hover:text-red-500" title="Abmelden">
                <LogOut size={16} />
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <button onClick={handleThemeToggle} className="text-gray-400 hover:text-[var(--primary)]">
                {user?.theme === 'masculine' ? <Sun size={20} /> : <Moon size={20} />}
              </button>
              <button onClick={handleLogout} className="text-gray-400 hover:text-red-500">
                <LogOut size={20} />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
