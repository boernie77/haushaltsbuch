import React, { useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend
} from 'recharts';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { useAuthStore } from '../store/authStore';
import { statsAPI } from '../services/api';

const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const COLORS = ['#E91E8C', '#9C27B0', '#F06292', '#CE93D8', '#F48FB1', '#AB47BC', '#2196F3', '#00BCD4'];

export default function StatisticsPage() {
  const { currentHousehold } = useAuthStore();
  const [view, setView] = useState<'monthly' | 'yearly'>('monthly');
  const [monthly, setMonthly] = useState<any>(null);
  const [yearly, setYearly] = useState<any>(null);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentHousehold) return;
    setLoading(true);
    Promise.all([
      statsAPI.monthly({ householdId: currentHousehold.id, year: selectedYear, month: selectedMonth }),
      statsAPI.yearly({ householdId: currentHousehold.id, year: selectedYear })
    ]).then(([m, y]) => {
      setMonthly(m.data);
      setYearly(y.data);
    }).finally(() => setLoading(false));
  }, [currentHousehold, selectedMonth, selectedYear]);

  if (loading) return <div className="flex items-center justify-center h-full"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[var(--primary)]" /></div>;

  const pieData = monthly?.byCategory?.slice(0, 8).map((c: any) => ({
    name: c.category?.nameDE || 'Sonstiges',
    value: c.total,
    icon: c.category?.icon || '📦'
  })) || [];

  const yearlyChartData = yearly?.monthly?.map((m: any, i: number) => ({
    name: MONTHS[i],
    Ausgaben: m.expenses,
    Einnahmen: m.income
  })) || [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Statistiken</h1>
        <div className="flex gap-2">
          <button onClick={() => setView('monthly')}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${view === 'monthly' ? 'bg-[var(--primary)] text-white' : 'bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300'}`}>
            Monat
          </button>
          <button onClick={() => setView('yearly')}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${view === 'yearly' ? 'bg-[var(--primary)] text-white' : 'bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300'}`}>
            Jahr
          </button>
        </div>
      </div>

      {/* Period Selector */}
      <div className="flex gap-3 flex-wrap">
        {view === 'monthly' && (
          <select className="input w-auto" value={selectedMonth} onChange={e => setSelectedMonth(+e.target.value)}>
            {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
        )}
        <select className="input w-auto" value={selectedYear} onChange={e => setSelectedYear(+e.target.value)}>
          {[2023, 2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {view === 'monthly' && monthly && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="card p-4">
              <p className="text-xs text-gray-500 uppercase">Ausgaben</p>
              <p className="text-2xl font-bold text-[var(--expense)] mt-1">{monthly.totalExpenses.toFixed(2)} €</p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-gray-500 uppercase">Einnahmen</p>
              <p className="text-2xl font-bold text-[var(--income)] mt-1">{monthly.totalIncome.toFixed(2)} €</p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-gray-500 uppercase">Bilanz</p>
              <p className={`text-2xl font-bold mt-1 ${monthly.balance >= 0 ? 'text-[var(--income)]' : 'text-[var(--expense)]'}`}>
                {monthly.balance >= 0 ? '+' : ''}{monthly.balance.toFixed(2)} €
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Pie Chart */}
            <div className="card p-5">
              <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Nach Kategorie</h2>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} dataKey="value">
                    {pieData.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => `${v.toFixed(2)} €`} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Daily Spending */}
            {monthly.dailySpending?.length > 0 && (
              <div className="card p-5">
                <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Tägliche Ausgaben</h2>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={monthly.dailySpending.map((d: any) => ({ day: d.day.slice(8), total: d.total }))}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: any) => `${v.toFixed(2)} €`} />
                    <Line type="monotone" dataKey="total" stroke="var(--primary)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Category breakdown */}
          <div className="card p-5">
            <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Ausgaben nach Kategorie</h2>
            <div className="space-y-3">
              {monthly.byCategory.map((c: any, i: number) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-xl w-8">{c.category?.icon}</span>
                  <div className="flex-1">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-700 dark:text-gray-300 font-medium">
                        {c.category?.nameDE || c.category?.name}
                      </span>
                      <span className="text-gray-600 dark:text-gray-400">{c.total.toFixed(2)} €</span>
                    </div>
                    <div className="w-full bg-gray-100 dark:bg-slate-600 rounded-full h-2">
                      <div
                        className="h-2 rounded-full"
                        style={{
                          width: `${(c.total / monthly.totalExpenses) * 100}%`,
                          background: COLORS[i % COLORS.length]
                        }}
                      />
                    </div>
                  </div>
                  <span className="text-xs text-gray-500 w-8 text-right">
                    {Math.round((c.total / monthly.totalExpenses) * 100)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {view === 'yearly' && yearly && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="card p-4">
              <p className="text-xs text-gray-500 uppercase">Jahresausgaben</p>
              <p className="text-2xl font-bold text-[var(--expense)] mt-1">{yearly.totalExpenses.toFixed(2)} €</p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-gray-500 uppercase">Jahreseinnahmen</p>
              <p className="text-2xl font-bold text-[var(--income)] mt-1">{yearly.totalIncome.toFixed(2)} €</p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-gray-500 uppercase">Jahresbilanz</p>
              <p className={`text-2xl font-bold mt-1 ${yearly.balance >= 0 ? 'text-[var(--income)]' : 'text-[var(--expense)]'}`}>
                {yearly.balance >= 0 ? '+' : ''}{yearly.balance.toFixed(2)} €
              </p>
            </div>
          </div>

          <div className="card p-5">
            <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Monatliche Übersicht {yearly.year}</h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={yearlyChartData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v: any) => `${v.toFixed(2)} €`} />
                <Legend />
                <Bar dataKey="Ausgaben" fill="var(--expense)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Einnahmen" fill="var(--income)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}
