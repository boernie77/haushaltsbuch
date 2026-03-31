import React, { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, ShoppingCart, Calendar, AlertTriangle, Wallet, PiggyBank, BarChart2 } from 'lucide-react';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer
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

  if (!currentHousehold) return (
    <div className="flex items-center justify-center h-full text-gray-400">
      <div className="text-center">
        <div className="text-5xl mb-4">🏠</div>
        <p>Kein Haushalt ausgewählt.</p>
        <p className="text-sm mt-1">Bitte einen Haushalt in der Sidebar auswählen oder erstellen.</p>
      </div>
    </div>
  );

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

  const fmt = (n: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: currentHousehold.currency || 'EUR' }).format(n);

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

      {/* Summary Cards — 4 cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Ausgaben</p>
            <TrendingDown className="text-[var(--expense)]" size={18} />
          </div>
          <p className="text-2xl font-bold text-[var(--expense)]">{fmt(overview?.thisMonth || 0)}</p>
          <p className={`text-xs mt-2 flex items-center gap-1 ${(overview?.changePercent ?? 0) >= 0 ? 'text-red-500' : 'text-green-500'}`}>
            {(overview?.changePercent ?? 0) >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {(overview?.changePercent ?? 0) > 0 ? '+' : ''}{(overview?.changePercent ?? 0).toFixed(1)}% zum Vormonat
          </p>
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Einnahmen</p>
            <TrendingUp className="text-[var(--income)]" size={18} />
          </div>
          <p className="text-2xl font-bold text-[var(--income)]">{fmt(overview?.thisMonthIncome || 0)}</p>
          <p className="text-xs text-gray-500 mt-2">{overview?.transactionCount} Buchungen</p>
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Bilanz</p>
            <Wallet size={18} className={overview?.balance >= 0 ? 'text-[var(--income)]' : 'text-[var(--expense)]'} />
          </div>
          <p className={`text-2xl font-bold ${(overview?.balance ?? 0) >= 0 ? 'text-[var(--income)]' : 'text-[var(--expense)]'}`}>
            {(overview?.balance ?? 0) >= 0 ? '+' : ''}{fmt(overview?.balance || 0)}
          </p>
          <p className="text-xs text-gray-500 mt-2">Diesen Monat</p>
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Sparquote</p>
            <PiggyBank size={18} className={(overview?.savingsRate ?? 0) >= 0 ? 'text-[var(--income)]' : 'text-[var(--expense)]'} />
          </div>
          <p className={`text-2xl font-bold ${(overview?.savingsRate ?? 0) >= 0 ? 'text-[var(--income)]' : 'text-[var(--expense)]'}`}>
            {(overview?.savingsRate ?? 0).toFixed(1)}%
          </p>
          <p className="text-xs text-gray-500 mt-2">Einnahmen gespart</p>
        </div>
      </div>

      {/* Forecast + Budget */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Prognose */}
        {overview?.projectedExpenses > 0 && (
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-900 dark:text-white">Monats-Prognose</h2>
              <BarChart2 size={18} className="text-gray-400" />
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Hochgerechnete Ausgaben</span>
                <span className="font-medium text-[var(--expense)]">{fmt(overview.projectedExpenses)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Verbleibend (prognostiziert)</span>
                <span className={`font-medium ${overview.projectedRemaining >= 0 ? 'text-[var(--income)]' : 'text-[var(--expense)]'}`}>
                  {fmt(overview.projectedRemaining)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Tag</span>
                <span className="text-gray-700 dark:text-gray-300">{overview.currentDay} / {overview.daysInMonth}</span>
              </div>
            </div>
          </div>
        )}

        {/* Monatsbudget */}
        {currentHousehold?.monthlyBudget && (
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-900 dark:text-white">Monatsbudget</h2>
              {budgetPercent >= 80 && <AlertTriangle className="text-orange-500" size={18} />}
            </div>
            <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400 mb-2">
              <span>{fmt(overview?.thisMonth || 0)} von {fmt(parseFloat(String(currentHousehold.monthlyBudget)))}</span>
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
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pie Chart */}
        {pieData.length > 0 && (
          <div className="card p-5">
            <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Ausgaben nach Kategorie</h2>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={90} dataKey="value">
                  {pieData.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: any) => fmt(v)} />
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
                      {fmt(budget.spent || 0)} / {fmt(budget.limitAmount)}
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

      {/* Top Kategorie */}
      {overview?.topCategory && (
        <div className="card p-5">
          <div className="flex items-center gap-3">
            <ShoppingCart className="text-[var(--primary)]" size={20} />
            <div>
              <p className="text-xs text-gray-500 uppercase font-semibold">Top Kategorie diesen Monat</p>
              <p className="text-lg font-bold text-gray-900 dark:text-white mt-0.5">
                {overview.topCategory.icon} {overview.topCategory.nameDE || overview.topCategory.name}
                <span className="text-base font-normal text-gray-500 ml-2">{fmt(overview.topCategory.total)}</span>
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
