import React, { useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend, AreaChart, Area
} from 'recharts';
import { useAuthStore } from '../store/authStore';
import { statsAPI } from '../services/api';

const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const COLORS = ['#E91E8C', '#9C27B0', '#F06292', '#CE93D8', '#F48FB1', '#AB47BC', '#2196F3', '#00BCD4'];

type Tab = 'monthly' | 'yearly' | 'trends' | 'wealth' | 'persons';

export default function StatisticsPage() {
  const { currentHousehold } = useAuthStore();
  const [tab, setTab] = useState<Tab>('monthly');
  const [monthly, setMonthly] = useState<any>(null);
  const [yearly, setYearly] = useState<any>(null);
  const [trends, setTrends] = useState<any>(null);
  const [wealth, setWealth] = useState<any>(null);
  const [persons, setPersons] = useState<any>(null);
  const [trendMonths, setTrendMonths] = useState(6);
  const currentYear = new Date().getFullYear();
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(Math.max(currentYear, 2026));
  const [loading, setLoading] = useState(false);

  const fmt = (n: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: currentHousehold?.currency || 'EUR' }).format(n);

  useEffect(() => {
    if (!currentHousehold) return;
    setLoading(true);
    if (tab === 'monthly') {
      statsAPI.monthly({ householdId: currentHousehold.id, year: selectedYear, month: selectedMonth })
        .then(r => setMonthly(r.data)).finally(() => setLoading(false));
    } else if (tab === 'yearly') {
      statsAPI.yearly({ householdId: currentHousehold.id, year: selectedYear })
        .then(r => setYearly(r.data)).finally(() => setLoading(false));
    } else if (tab === 'trends') {
      statsAPI.trends(currentHousehold.id, trendMonths)
        .then(r => setTrends(r.data)).finally(() => setLoading(false));
    } else if (tab === 'wealth') {
      statsAPI.wealth(currentHousehold.id)
        .then(r => setWealth(r.data)).finally(() => setLoading(false));
    } else if (tab === 'persons') {
      statsAPI.byPerson({ householdId: currentHousehold.id, year: selectedYear, month: selectedMonth })
        .then(r => setPersons(r.data)).finally(() => setLoading(false));
    }
  }, [currentHousehold, tab, selectedMonth, selectedYear, trendMonths]);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'monthly', label: 'Monat' },
    { key: 'yearly', label: 'Jahr' },
    { key: 'trends', label: 'Trends' },
    { key: 'wealth', label: 'Vermögen' },
    { key: 'persons', label: 'Personen' },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Statistiken</h1>
        <div className="flex gap-2 flex-wrap">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-all ${tab === t.key ? 'bg-[var(--primary)] text-white' : 'bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Period Selector */}
      {(tab === 'monthly' || tab === 'yearly' || tab === 'persons') && (
        <div className="flex gap-3 flex-wrap">
          {(tab === 'monthly' || tab === 'persons') && (
            <select className="input w-auto" value={selectedMonth} onChange={e => setSelectedMonth(+e.target.value)}>
              {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
          )}
          <select className="input w-auto" value={selectedYear} onChange={e => setSelectedYear(+e.target.value)}>
            {Array.from({ length: Math.max(currentYear, 2026) - 2026 + 2 }, (_, i) => 2026 + i).map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      )}

      {tab === 'trends' && (
        <div className="flex gap-2">
          {[3, 6, 12].map(m => (
            <button key={m} onClick={() => setTrendMonths(m)}
              className={`px-3 py-1.5 rounded-xl text-sm font-medium ${trendMonths === m ? 'bg-[var(--primary)] text-white' : 'bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300'}`}>
              {m} Monate
            </button>
          ))}
        </div>
      )}

      {loading && <div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[var(--primary)]" /></div>}

      {/* ── Monat ── */}
      {!loading && tab === 'monthly' && monthly && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="card p-4">
              <p className="text-xs text-gray-500 uppercase">Ausgaben</p>
              <p className="text-2xl font-bold text-[var(--expense)] mt-1">{fmt(monthly.totalExpenses)}</p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-gray-500 uppercase">Einnahmen</p>
              <p className="text-2xl font-bold text-[var(--income)] mt-1">{fmt(monthly.totalIncome)}</p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-gray-500 uppercase">Bilanz</p>
              <p className={`text-2xl font-bold mt-1 ${monthly.balance >= 0 ? 'text-[var(--income)]' : 'text-[var(--expense)]'}`}>
                {monthly.balance >= 0 ? '+' : ''}{fmt(monthly.balance)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="card p-5">
              <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Nach Kategorie</h2>
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={monthly.byCategory.slice(0, 8).map((c: any) => ({ name: c.category?.nameDE || 'Sonstiges', value: c.total }))}
                    cx="50%" cy="50%" innerRadius={55} outerRadius={90} dataKey="value">
                    {monthly.byCategory.slice(0, 8).map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => fmt(v)} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {monthly.dailySpending?.length > 0 && (
              <div className="card p-5">
                <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Tägliche Ausgaben</h2>
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={monthly.dailySpending.map((d: any) => ({ day: d.day.slice(8), total: d.total }))}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: any) => fmt(v)} />
                    <Line type="monotone" dataKey="total" stroke="var(--primary)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="card p-5">
            <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Ausgaben nach Kategorie</h2>
            <div className="space-y-3">
              {monthly.byCategory.map((c: any, i: number) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-xl w-8">{c.category?.icon}</span>
                  <div className="flex-1">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-700 dark:text-gray-300 font-medium">{c.category?.nameDE || c.category?.name}</span>
                      <span className="text-gray-600 dark:text-gray-400">{fmt(c.total)}</span>
                    </div>
                    <div className="w-full bg-gray-100 dark:bg-slate-600 rounded-full h-2">
                      <div className="h-2 rounded-full" style={{ width: `${monthly.totalExpenses > 0 ? (c.total / monthly.totalExpenses) * 100 : 0}%`, background: COLORS[i % COLORS.length] }} />
                    </div>
                  </div>
                  <span className="text-xs text-gray-500 w-8 text-right">
                    {monthly.totalExpenses > 0 ? Math.round((c.total / monthly.totalExpenses) * 100) : 0}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── Jahr ── */}
      {!loading && tab === 'yearly' && yearly && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="card p-4">
              <p className="text-xs text-gray-500 uppercase">Jahresausgaben</p>
              <p className="text-2xl font-bold text-[var(--expense)] mt-1">{fmt(yearly.totalExpenses)}</p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-gray-500 uppercase">Jahreseinnahmen</p>
              <p className="text-2xl font-bold text-[var(--income)] mt-1">{fmt(yearly.totalIncome)}</p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-gray-500 uppercase">Jahresbilanz</p>
              <p className={`text-2xl font-bold mt-1 ${yearly.balance >= 0 ? 'text-[var(--income)]' : 'text-[var(--expense)]'}`}>
                {yearly.balance >= 0 ? '+' : ''}{fmt(yearly.balance)}
              </p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-gray-500 uppercase">Sparquote</p>
              <p className={`text-2xl font-bold mt-1 ${yearly.savingsRate >= 0 ? 'text-[var(--income)]' : 'text-[var(--expense)]'}`}>
                {yearly.savingsRate.toFixed(1)}%
              </p>
            </div>
          </div>

          <div className="card p-5">
            <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Monatliche Übersicht {yearly.year}</h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={yearly.monthly.map((m: any, i: number) => ({ name: MONTHS[i].slice(0, 3), Ausgaben: m.expenses, Einnahmen: m.income }))}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v: any) => fmt(v)} />
                <Legend />
                <Bar dataKey="Ausgaben" fill="var(--expense)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Einnahmen" fill="var(--income)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {/* ── Trends ── */}
      {!loading && tab === 'trends' && trends && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="card p-4">
              <p className="text-xs text-gray-500 uppercase">Ø Ausgaben/Monat</p>
              <p className="text-2xl font-bold text-[var(--expense)] mt-1">{fmt(trends.avgMonthlyExpenses)}</p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-gray-500 uppercase">Ø Einnahmen/Monat</p>
              <p className="text-2xl font-bold text-[var(--income)] mt-1">{fmt(trends.avgMonthlyIncome)}</p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-gray-500 uppercase">Gesamtausgaben</p>
              <p className="text-2xl font-bold text-[var(--expense)] mt-1">{fmt(trends.totalExpenses)}</p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-gray-500 uppercase">Sparquote</p>
              <p className={`text-2xl font-bold mt-1 ${trends.savingsRate >= 0 ? 'text-[var(--income)]' : 'text-[var(--expense)]'}`}>
                {trends.savingsRate.toFixed(1)}%
              </p>
            </div>
          </div>

          <div className="card p-5">
            <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Top-Ausgaben der letzten {trendMonths} Monate</h2>
            <div className="space-y-3">
              {trends.byCategory.map((c: any, i: number) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-xl w-8">{c.category?.icon}</span>
                  <div className="flex-1">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-700 dark:text-gray-300 font-medium">{c.category?.nameDE || c.category?.name}</span>
                      <span className="text-gray-600 dark:text-gray-400">Ø {fmt(c.avg)}/Monat</span>
                    </div>
                    <div className="w-full bg-gray-100 dark:bg-slate-600 rounded-full h-2">
                      <div className="h-2 rounded-full" style={{ width: `${c.share}%`, background: COLORS[i % COLORS.length] }} />
                    </div>
                  </div>
                  <span className="text-xs text-gray-500 w-8 text-right">{c.share}%</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── Vermögen ── */}
      {!loading && tab === 'wealth' && wealth && (
        <>
          {wealth.data.length === 0 ? (
            <div className="card p-8 text-center text-gray-400">Noch keine Daten vorhanden.</div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="card p-4">
                  <p className="text-xs text-gray-500 uppercase">Aktuelles Guthaben</p>
                  <p className={`text-2xl font-bold mt-1 ${wealth.data[wealth.data.length - 1]?.cumulative >= 0 ? 'text-[var(--income)]' : 'text-[var(--expense)]'}`}>
                    {fmt(wealth.data[wealth.data.length - 1]?.cumulative || 0)}
                  </p>
                </div>
                <div className="card p-4">
                  <p className="text-xs text-gray-500 uppercase">Monate mit Daten</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{wealth.data.length}</p>
                </div>
              </div>

              <div className="card p-5">
                <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Vermögensentwicklung</h2>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={wealth.data}>
                    <defs>
                      <linearGradient id="wealthGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: any) => fmt(v)} labelFormatter={(l) => `Monat: ${l}`} />
                    <Area type="monotone" dataKey="cumulative" stroke="var(--primary)" strokeWidth={2} fill="url(#wealthGradient)" name="Kumuliert" />
                    <Line type="monotone" dataKey="balance" stroke="#9C27B0" strokeWidth={1.5} dot={false} name="Monatsbilanz" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </>
      )}

      {/* ── Personen ── */}
      {!loading && tab === 'persons' && persons && (
        <>
          {persons.persons.length === 0 ? (
            <div className="card p-8 text-center text-gray-400">Keine gemeinsamen Ausgaben in diesem Monat.</div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="card p-4">
                  <p className="text-xs text-gray-500 uppercase">Gesamtausgaben</p>
                  <p className="text-2xl font-bold text-[var(--expense)] mt-1">{fmt(persons.total)}</p>
                </div>
                <div className="card p-4">
                  <p className="text-xs text-gray-500 uppercase">Ø pro Person</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{fmt(persons.avg)}</p>
                </div>
                <div className="card p-4">
                  <p className="text-xs text-gray-500 uppercase">Personen</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{persons.persons.length}</p>
                </div>
              </div>

              <div className="card p-5">
                <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Ausgaben pro Person</h2>
                <div className="space-y-4">
                  {persons.persons.map((p: any, i: number) => (
                    <div key={p.userId} className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[var(--primary)] flex items-center justify-center text-white text-sm font-bold shrink-0">
                        {p.user?.name?.slice(0, 1) || '?'}
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between text-sm mb-1">
                          <span className="font-medium text-gray-900 dark:text-white">{p.user?.name}</span>
                          <span className="text-gray-600 dark:text-gray-400">{fmt(p.total)} ({p.share}%)</span>
                        </div>
                        <div className="w-full bg-gray-100 dark:bg-slate-600 rounded-full h-2">
                          <div className="h-2 rounded-full" style={{ width: `${p.share}%`, background: COLORS[i % COLORS.length] }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {persons.settlements.length > 0 && (
                <div className="card p-5">
                  <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Ausgleichsrechnung</h2>
                  <p className="text-sm text-gray-500 mb-3">Wer muss wem wie viel zahlen, damit alle gleich viel beigetragen haben:</p>
                  <div className="space-y-2">
                    {persons.settlements.map((s: any, i: number) => (
                      <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-slate-700 rounded-xl text-sm">
                        <span className="font-medium text-gray-900 dark:text-white">{s.from?.name}</span>
                        <span className="text-gray-400">→</span>
                        <span className="font-medium text-gray-900 dark:text-white">{s.to?.name}</span>
                        <span className="ml-auto font-bold text-[var(--primary)]">{fmt(s.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
