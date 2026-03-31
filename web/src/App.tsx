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
import JoinPage from './pages/JoinPage';
import BackupPage from './pages/BackupPage';
import ImpressumPage from './pages/ImpressumPage';
import DatenschutzPage from './pages/DatenschutzPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';

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
      <Route path="/join/:code" element={<JoinPage />} />
      <Route path="/impressum" element={<ImpressumPage />} />
      <Route path="/datenschutz" element={<DatenschutzPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/" element={<RequireAuth><Layout /></RequireAuth>}>
        <Route index element={<DashboardPage />} />
        <Route path="transactions" element={<TransactionsPage />} />
        <Route path="statistics" element={<StatisticsPage />} />
        <Route path="budget" element={<BudgetPage />} />
        <Route path="household" element={<HouseholdPage />} />
        <Route path="paperless" element={<PaperlessPage />} />
        <Route path="admin" element={<AdminPage />} />
        <Route path="backup" element={<BackupPage />} />
      </Route>
    </Routes>
  );
}
