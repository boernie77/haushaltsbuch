import React, { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, ShoppingCart, Calendar, AlertTriangle } from 'lucide-react';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend
} from 'recharts';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { useAuthStore } from '../store/authStore';
import { statsAPI, budgetAPI } from '../services/api';

const COLORS = ['#E91E8C', '#9C27B0', '#F06292', '#CE93D8', '#F48FB1', '#AB47BC', '#E040FB', '#2196F3'];

export default function DashboardPage() {
  const { user, currentHousehold } = useAuthStore();
  const [overview, setOverview] = useState<any>(null);
  const [monthly, setMonthly] = useState<any>(null);
  const [budgets, setBudgets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const now = new Date();

  useEffect(() => {
    if (!currentHousehold) return;
    setLoading(true);
    Promise.all([
      statsAPI.overview(currentHousehold.id),
      statsAPI.monthly({ householdId: currentHousehold.id, year: now.getFullYear(), month: now.getMonth() + 1 }),
      budgetAPI.getAll({ householdId: currentHousehold.id, month: now.getMonth() + 1, year: now.getFullYear() })
    ]).then(([o, m, b]) => {
      setOverview(o.data);
      setMonthly(m.data);
      setBudgets(b.data.budgets);
    }).finally(() => setLoading(false));
  }, [currentHousehold]);

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[var(--primary)]" />
    </div>
  );

  const budgetPercent = currentHousehold?.monthlyBudget && overview
    ? (overview.thisMonth / currentHousehold.monthlyBudget) * 100 : 0;

  const pieData = monthly?.byCategory?.slice(0, 8).map((c: any) => ({
    name: c.category?.nameDE || 'Sonstiges',
    value: c.total,
    icon: c.category?.icon
  })) || [];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Hallo, {user?.name?.split(' ')[0]} 👋
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          {format(now, "EEEE, d. MMMM yyyy", { locale: de })} · {currentHousehold?.name}
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Ausgaben diesen Monat</p>
            <TrendingDown className="text-[var(--expense)]" size={20} />
          </div>
          <p className="text-3xl font-bold text-[var(--expense)]">
            {overview?.thisMonth?.toFixed(2)} €
          </p>
          <p className={`text-sm mt-2 flex items-center gap-1 ${overview?.changePercent >= 0 ? 'text-red-500' : 'text-green-500'}`}>
            {overview?.changePercent >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            {overview?.changePercent > 0 ? '+' : ''}{overview?.changePercent?.toFixed(1)}% zum Vormonat
          </p>
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Vormonat</p>
            <Calendar className="text-gray-400" size={20} />
          </div>
          <p className="text-3xl font-bold text-gray-700 dark:text-gray-200">
            {overview?.lastMonth?.toFixed(2)} €
          </p>
          <p className="text-sm text-gray-500 mt-2">{overview?.transactionCount} Buchungen</p>
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Top Kategorie</p>
            <ShoppingCart className="text-[var(--primary)]" size={20} />
          </div>
          {overview?.topCategory ? (
            <>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {overview.topCategory.icon} {overview.topCategory.nameDE || overview.topCategory.name}
              </p>
              <p className="text-sm text-gray-500 mt-2">{overview.topCategory.total?.toFixed(2)} €</p>
            </>
          ) : <p className="text-gray-400">Keine Daten</p>}
        </div>
      </div>

      {/* Budget Warning */}
      {currentHousehold?.monthlyBudget && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-900 dark:text-white">Monatsbudget</h2>
            {budgetPercent >= 80 && <AlertTriangle className="text-orange-500" size={18} />}
          </div>
          <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400 mb-2">
            <span>{overview?.thisMonth?.toFixed(2)} € von {currentHousehold.monthlyBudget.toFixed(2)} €</span>
            <span className={`font-bold ${budgetPercent >= 100 ? 'text-red-500' : budgetPercent >= 80 ? 'text-orange-500' : 'text-green-600'}`}>
              {Math.round(budgetPercent)}%
            </span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-slate-600 rounded-full h-3">
            <div
              className={`h-3 rounded-full transition-all ${budgetPercent >= 100 ? 'bg-red-500' : budgetPercent >= 80 ? 'bg-orange-500' : 'bg-[var(--primary)]'}`}
              style={{ width: `${Math.min(budgetPercent, 100)}%` }}
            />
          </div>
          {budgetPercent >= 80 && (
            <p className={`text-sm mt-2 ${budgetPercent >= 100 ? 'text-red-500' : 'text-orange-500'}`}>
              ⚠️ {budgetPercent >= 100 ? 'Budget überschritten!' : 'Budget fast aufgebraucht!'}
            </p>
          )}
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pie Chart */}
        {pieData.length > 0 && (
          <div className="card p-5">
            <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Ausgaben nach Kategorie</h2>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} dataKey="value">
                  {pieData.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: any) => `${v.toFixed(2)} €`} />
              </PieChart>
            </ResponsiveContainer>
            <div className="grid grid-cols-2 gap-1 mt-2">
              {pieData.slice(0, 6).map((d: any, i: number) => (
                <div key={i} className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                  <span className="truncate">{d.icon} {d.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Category Budgets */}
        {budgets.filter(b => b.categoryId).length > 0 && (
          <div className="card p-5">
            <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Kategoriebudgets</h2>
            <div className="space-y-3">
              {budgets.filter(b => b.categoryId).map(budget => (
                <div key={budget.id}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-700 dark:text-gray-300">
                      {budget.Category?.icon} {budget.Category?.nameDE || budget.Category?.name}
                    </span>
                    <span className={`font-medium ${budget.isOver ? 'text-red-500' : budget.isWarning ? 'text-orange-500' : 'text-gray-600 dark:text-gray-400'}`}>
                      {budget.spent?.toFixed(0)} / {budget.limitAmount} €
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-slate-600 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${budget.isOver ? 'bg-red-500' : budget.isWarning ? 'bg-orange-500' : 'bg-[var(--primary)]'}`}
                      style={{ width: `${Math.min(budget.percentage, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
