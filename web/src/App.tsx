import React, { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import TransactionsPage from './pages/TransactionsPage';
import StatisticsPage from './pages/StatisticsPage';
import BudgetPage from './pages/BudgetPage';
import HouseholdPage from './pages/HouseholdPage';
import PaperlessPage from './pages/PaperlessPage';
import AdminPage from './pages/AdminPage';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  const { loadStoredAuth, user } = useAuthStore();

  useEffect(() => {
    loadStoredAuth();
  }, []);

  // Apply theme
  useEffect(() => {
    if (user?.theme === 'masculine') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [user?.theme]);

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/" element={<RequireAuth><Layout /></RequireAuth>}>
        <Route index element={<DashboardPage />} />
        <Route path="transactions" element={<TransactionsPage />} />
        <Route path="statistics" element={<StatisticsPage />} />
        <Route path="budget" element={<BudgetPage />} />
        <Route path="household" element={<HouseholdPage />} />
        <Route path="paperless" element={<PaperlessPage />} />
        <Route path="admin" element={<AdminPage />} />
      </Route>
    </Routes>
  );
}
