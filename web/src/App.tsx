import type React from "react";
import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import AccountsPage from "./pages/AccountsPage";
import AdminPage from "./pages/AdminPage";
import BackupPage from "./pages/BackupPage";
import BankSyncPage from "./pages/BankSyncPage";
import BudgetPage from "./pages/BudgetPage";
import CalendarPage from "./pages/CalendarPage";
import DashboardPage from "./pages/DashboardPage";
import DatenschutzPage from "./pages/DatenschutzPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import HelpPage from "./pages/HelpPage";
import HouseholdPage from "./pages/HouseholdPage";
import ImpressumPage from "./pages/ImpressumPage";
import JoinPage from "./pages/JoinPage";
import LoginPage from "./pages/LoginPage";
import PaperlessPage from "./pages/PaperlessPage";
import RegisterPage from "./pages/RegisterPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import StatisticsPage from "./pages/StatisticsPage";
import SubAccountsPage from "./pages/SubAccountsPage";
import TransactionsPage from "./pages/TransactionsPage";
import { useAuthStore } from "./store/authStore";

export function applyThemeClasses(theme: string | undefined) {
  const html = document.documentElement;
  html.classList.remove("dark", "professional");
  if (theme === "masculine") {
    html.classList.add("dark");
  } else if (theme === "professional-light") {
    html.classList.add("professional");
  } else if (theme === "professional-dark") {
    html.classList.add("dark", "professional");
  }
  // "feminine" = keine Klasse
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  if (!isAuthenticated) {
    return <Navigate replace to="/login" />;
  }
  return <>{children}</>;
}

export default function App() {
  const { loadStoredAuth, user } = useAuthStore();

  useEffect(() => {
    loadStoredAuth();
  }, []);

  // Apply theme
  useEffect(() => {
    applyThemeClasses(user?.theme);
  }, [user?.theme]);

  return (
    <Routes>
      <Route element={<LoginPage />} path="/login" />
      <Route element={<RegisterPage />} path="/register" />
      <Route element={<JoinPage />} path="/join/:code" />
      <Route element={<ImpressumPage />} path="/impressum" />
      <Route element={<DatenschutzPage />} path="/datenschutz" />
      <Route element={<ForgotPasswordPage />} path="/forgot-password" />
      <Route element={<ResetPasswordPage />} path="/reset-password" />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
        path="/"
      >
        <Route element={<DashboardPage />} index />
        <Route element={<TransactionsPage />} path="transactions" />
        <Route element={<AccountsPage />} path="accounts" />
        <Route element={<SubAccountsPage />} path="sub-accounts" />
        <Route element={<CalendarPage />} path="calendar" />
        <Route element={<BankSyncPage />} path="bank-sync" />
        <Route element={<StatisticsPage />} path="statistics" />
        <Route element={<BudgetPage />} path="budget" />
        <Route element={<HouseholdPage />} path="household" />
        <Route element={<PaperlessPage />} path="paperless" />
        <Route element={<HelpPage />} path="help" />
        <Route element={<AdminPage />} path="admin" />
        <Route element={<BackupPage />} path="backup" />
      </Route>
    </Routes>
  );
}
