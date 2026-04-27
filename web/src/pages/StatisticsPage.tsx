import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { statsAPI } from "../services/api";
import { useAuthStore } from "../store/authStore";

const MONTHS = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];
const COLORS = [
  "#E91E8C",
  "#9C27B0",
  "#F06292",
  "#CE93D8",
  "#F48FB1",
  "#AB47BC",
  "#2196F3",
  "#00BCD4",
];

type Tab = "monthly" | "yearly" | "trends" | "wealth" | "persons";

export default function StatisticsPage() {
  const { currentHousehold } = useAuthStore();
  const [tab, setTab] = useState<Tab>("monthly");
  const [monthly, setMonthly] = useState<any>(null);
  const [yearly, setYearly] = useState<any>(null);
  const [trends, setTrends] = useState<any>(null);
  const [wealth, setWealth] = useState<any>(null);
  const [persons, setPersons] = useState<any>(null);
  const [trendMonths, setTrendMonths] = useState(6);
  const now = new Date();
  const currentYear = now.getFullYear();
  const startDay = currentHousehold?.monthStartDay || 1;
  let initialMonth = now.getMonth() + 1;
  let initialYear = now.getFullYear();
  if (startDay > 1 && now.getDate() >= startDay) {
    if (initialMonth === 12) {
      initialMonth = 1;
      initialYear += 1;
    } else {
      initialMonth += 1;
    }
  }
  const [selectedMonth, setSelectedMonth] = useState(initialMonth);
  const [selectedYear, setSelectedYear] = useState(Math.max(initialYear, 2026));
  const [loading, setLoading] = useState(false);

  const fmt = (n: number) =>
    new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency: currentHousehold?.currency || "EUR",
    }).format(n);

  useEffect(() => {
    if (!currentHousehold) {
      return;
    }
    setLoading(true);
    if (tab === "monthly") {
      statsAPI
        .monthly({
          householdId: currentHousehold.id,
          year: selectedYear,
          month: selectedMonth,
        })
        .then((r) => setMonthly(r.data))
        .finally(() => setLoading(false));
    } else if (tab === "yearly") {
      statsAPI
        .yearly({ householdId: currentHousehold.id, year: selectedYear })
        .then((r) => setYearly(r.data))
        .finally(() => setLoading(false));
    } else if (tab === "trends") {
      statsAPI
        .trends(currentHousehold.id, trendMonths)
        .then((r) => setTrends(r.data))
        .finally(() => setLoading(false));
    } else if (tab === "wealth") {
      statsAPI
        .wealth(currentHousehold.id)
        .then((r) => setWealth(r.data))
        .finally(() => setLoading(false));
    } else if (tab === "persons") {
      statsAPI
        .byPerson({
          householdId: currentHousehold.id,
          year: selectedYear,
          month: selectedMonth,
        })
        .then((r) => setPersons(r.data))
        .finally(() => setLoading(false));
    }
  }, [currentHousehold, tab, selectedMonth, selectedYear, trendMonths]);

  const tabs: { key: Tab; label: string }[] = [
    { key: "monthly", label: "Monat" },
    { key: "yearly", label: "Jahr" },
    { key: "trends", label: "Trends" },
    { key: "wealth", label: "Vermögen" },
    { key: "persons", label: "Personen" },
  ];

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-bold text-2xl text-gray-900 dark:text-white">
          Statistiken
        </h1>
        <div className="flex flex-wrap gap-2">
          {tabs.map((t) => (
            <button
              className={`rounded-xl px-3 py-1.5 font-medium text-sm transition-all ${tab === t.key ? "bg-[var(--primary)] text-white" : "bg-white text-gray-700 dark:bg-slate-800 dark:text-gray-300"}`}
              key={t.key}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Period Selector */}
      {(tab === "monthly" || tab === "yearly" || tab === "persons") && (
        <div className="flex flex-wrap gap-3">
          {(tab === "monthly" || tab === "persons") && (
            <select
              className="input w-auto"
              onChange={(e) => setSelectedMonth(+e.target.value)}
              value={selectedMonth}
            >
              {MONTHS.map((m, i) => (
                <option key={i} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          )}
          <select
            className="input w-auto"
            onChange={(e) => setSelectedYear(+e.target.value)}
            value={selectedYear}
          >
            {Array.from(
              { length: Math.max(currentYear, 2026) - 2026 + 2 },
              (_, i) => 2026 + i
            ).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      )}

      {tab === "trends" && (
        <div className="flex gap-2">
          {[3, 6, 12].map((m) => (
            <button
              className={`rounded-xl px-3 py-1.5 font-medium text-sm ${trendMonths === m ? "bg-[var(--primary)] text-white" : "bg-white text-gray-700 dark:bg-slate-800 dark:text-gray-300"}`}
              key={m}
              onClick={() => setTrendMonths(m)}
            >
              {m} Monate
            </button>
          ))}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="h-10 w-10 animate-spin rounded-full border-[var(--primary)] border-b-2" />
        </div>
      )}

      {/* ── Monat ── */}
      {!loading && tab === "monthly" && monthly && (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            <div className="card p-4">
              <p className="text-gray-500 text-xs uppercase">Ausgaben</p>
              <p className="mt-1 font-bold text-2xl text-[var(--expense)]">
                {fmt(monthly.totalExpenses)}
              </p>
            </div>
            <div className="card p-4">
              <p className="text-gray-500 text-xs uppercase">Einnahmen</p>
              <p className="mt-1 font-bold text-2xl text-[var(--income)]">
                {fmt(monthly.totalIncome)}
              </p>
            </div>
            <div className="card p-4">
              <p className="text-gray-500 text-xs uppercase">Bilanz</p>
              <p
                className={`mt-1 font-bold text-2xl ${monthly.balance >= 0 ? "text-[var(--income)]" : "text-[var(--expense)]"}`}
              >
                {monthly.balance >= 0 ? "+" : ""}
                {fmt(monthly.balance)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="card p-5">
              <h2 className="mb-4 font-semibold text-gray-900 dark:text-white">
                Nach Kategorie
              </h2>
              <ResponsiveContainer height={240} width="100%">
                <PieChart>
                  <Pie
                    cx="50%"
                    cy="50%"
                    data={monthly.byCategory.slice(0, 8).map((c: any) => ({
                      name: c.category?.nameDE || "Sonstiges",
                      value: c.total,
                    }))}
                    dataKey="value"
                    innerRadius={55}
                    outerRadius={90}
                  >
                    {monthly.byCategory.slice(0, 8).map((_: any, i: number) => (
                      <Cell fill={COLORS[i % COLORS.length]} key={i} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: any) => fmt(v)} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {monthly.dailySpending?.length > 0 && (
              <div className="card p-5">
                <h2 className="mb-4 font-semibold text-gray-900 dark:text-white">
                  Tägliche Ausgaben
                </h2>
                <ResponsiveContainer height={240} width="100%">
                  <LineChart
                    data={monthly.dailySpending.map((d: any) => ({
                      day: d.day.slice(8),
                      total: d.total,
                    }))}
                  >
                    <CartesianGrid opacity={0.3} strokeDasharray="3 3" />
                    <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: any) => fmt(v)} />
                    <Line
                      dataKey="total"
                      dot={false}
                      stroke="var(--primary)"
                      strokeWidth={2}
                      type="monotone"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="card p-5">
            <h2 className="mb-4 font-semibold text-gray-900 dark:text-white">
              Ausgaben nach Kategorie
            </h2>
            <div className="space-y-3">
              {monthly.byCategory.map((c: any, i: number) => (
                <div className="flex items-center gap-3" key={i}>
                  <span className="w-8 text-xl">{c.category?.icon}</span>
                  <div className="flex-1">
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="font-medium text-gray-700 dark:text-gray-300">
                        {c.category?.nameDE || c.category?.name}
                      </span>
                      <span className="text-gray-600 dark:text-gray-400">
                        {fmt(c.total)}
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-gray-100 dark:bg-slate-600">
                      <div
                        className="h-2 rounded-full"
                        style={{
                          width: `${monthly.totalExpenses > 0 ? (c.total / monthly.totalExpenses) * 100 : 0}%`,
                          background: COLORS[i % COLORS.length],
                        }}
                      />
                    </div>
                  </div>
                  <span className="w-8 text-right text-gray-500 text-xs">
                    {monthly.totalExpenses > 0
                      ? Math.round((c.total / monthly.totalExpenses) * 100)
                      : 0}
                    %
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── Jahr ── */}
      {!loading && tab === "yearly" && yearly && (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div className="card p-4">
              <p className="text-gray-500 text-xs uppercase">Jahresausgaben</p>
              <p className="mt-1 font-bold text-2xl text-[var(--expense)]">
                {fmt(yearly.totalExpenses)}
              </p>
            </div>
            <div className="card p-4">
              <p className="text-gray-500 text-xs uppercase">Jahreseinnahmen</p>
              <p className="mt-1 font-bold text-2xl text-[var(--income)]">
                {fmt(yearly.totalIncome)}
              </p>
            </div>
            <div className="card p-4">
              <p className="text-gray-500 text-xs uppercase">Jahresbilanz</p>
              <p
                className={`mt-1 font-bold text-2xl ${yearly.balance >= 0 ? "text-[var(--income)]" : "text-[var(--expense)]"}`}
              >
                {yearly.balance >= 0 ? "+" : ""}
                {fmt(yearly.balance)}
              </p>
            </div>
            <div className="card p-4">
              <p className="text-gray-500 text-xs uppercase">Sparquote</p>
              <p
                className={`mt-1 font-bold text-2xl ${yearly.savingsRate >= 0 ? "text-[var(--income)]" : "text-[var(--expense)]"}`}
              >
                {yearly.savingsRate.toFixed(1)}%
              </p>
            </div>
          </div>

          <div className="card p-5">
            <h2 className="mb-4 font-semibold text-gray-900 dark:text-white">
              Monatliche Übersicht {yearly.year}
            </h2>
            <ResponsiveContainer height={300} width="100%">
              <BarChart
                data={yearly.monthly.map((m: any, i: number) => ({
                  name: MONTHS[i].slice(0, 3),
                  Ausgaben: m.expenses,
                  Einnahmen: m.income,
                }))}
              >
                <CartesianGrid opacity={0.3} strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v: any) => fmt(v)} />
                <Legend />
                <Bar
                  dataKey="Ausgaben"
                  fill="var(--expense)"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="Einnahmen"
                  fill="var(--income)"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {/* ── Trends ── */}
      {!loading && tab === "trends" && trends && (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div className="card p-4">
              <p className="text-gray-500 text-xs uppercase">
                Ø Ausgaben/Monat
              </p>
              <p className="mt-1 font-bold text-2xl text-[var(--expense)]">
                {fmt(trends.avgMonthlyExpenses)}
              </p>
            </div>
            <div className="card p-4">
              <p className="text-gray-500 text-xs uppercase">
                Ø Einnahmen/Monat
              </p>
              <p className="mt-1 font-bold text-2xl text-[var(--income)]">
                {fmt(trends.avgMonthlyIncome)}
              </p>
            </div>
            <div className="card p-4">
              <p className="text-gray-500 text-xs uppercase">Gesamtausgaben</p>
              <p className="mt-1 font-bold text-2xl text-[var(--expense)]">
                {fmt(trends.totalExpenses)}
              </p>
            </div>
            <div className="card p-4">
              <p className="text-gray-500 text-xs uppercase">Sparquote</p>
              <p
                className={`mt-1 font-bold text-2xl ${trends.savingsRate >= 0 ? "text-[var(--income)]" : "text-[var(--expense)]"}`}
              >
                {trends.savingsRate.toFixed(1)}%
              </p>
            </div>
          </div>

          <div className="card p-5">
            <h2 className="mb-4 font-semibold text-gray-900 dark:text-white">
              Top-Ausgaben der letzten {trendMonths} Monate
            </h2>
            <div className="space-y-3">
              {trends.byCategory.map((c: any, i: number) => (
                <div className="flex items-center gap-3" key={i}>
                  <span className="w-8 text-xl">{c.category?.icon}</span>
                  <div className="flex-1">
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="font-medium text-gray-700 dark:text-gray-300">
                        {c.category?.nameDE || c.category?.name}
                      </span>
                      <span className="text-gray-600 dark:text-gray-400">
                        Ø {fmt(c.avg)}/Monat
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-gray-100 dark:bg-slate-600">
                      <div
                        className="h-2 rounded-full"
                        style={{
                          width: `${c.share}%`,
                          background: COLORS[i % COLORS.length],
                        }}
                      />
                    </div>
                  </div>
                  <span className="w-8 text-right text-gray-500 text-xs">
                    {c.share}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── Vermögen ── */}
      {!loading &&
        tab === "wealth" &&
        wealth &&
        (wealth.data.length === 0 ? (
          <div className="card p-8 text-center text-gray-400">
            Noch keine Daten vorhanden.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div className="card p-4">
                <p className="text-gray-500 text-xs uppercase">
                  Aktuelles Guthaben
                </p>
                <p
                  className={`mt-1 font-bold text-2xl ${wealth.data.at(-1)?.cumulative >= 0 ? "text-[var(--income)]" : "text-[var(--expense)]"}`}
                >
                  {fmt(wealth.data.at(-1)?.cumulative || 0)}
                </p>
              </div>
              <div className="card p-4">
                <p className="text-gray-500 text-xs uppercase">
                  Monate mit Daten
                </p>
                <p className="mt-1 font-bold text-2xl text-gray-900 dark:text-white">
                  {wealth.data.length}
                </p>
              </div>
            </div>

            <div className="card p-5">
              <h2 className="mb-4 font-semibold text-gray-900 dark:text-white">
                Vermögensentwicklung
              </h2>
              <ResponsiveContainer height={300} width="100%">
                <AreaChart data={wealth.data}>
                  <defs>
                    <linearGradient
                      id="wealthGradient"
                      x1="0"
                      x2="0"
                      y1="0"
                      y2="1"
                    >
                      <stop
                        offset="5%"
                        stopColor="var(--primary)"
                        stopOpacity={0.3}
                      />
                      <stop
                        offset="95%"
                        stopColor="var(--primary)"
                        stopOpacity={0}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid opacity={0.3} strokeDasharray="3 3" />
                  <XAxis
                    dataKey="label"
                    interval="preserveStartEnd"
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(v: any) => fmt(v)}
                    labelFormatter={(l) => `Monat: ${l}`}
                  />
                  <Area
                    dataKey="cumulative"
                    fill="url(#wealthGradient)"
                    name="Kumuliert"
                    stroke="var(--primary)"
                    strokeWidth={2}
                    type="monotone"
                  />
                  <Line
                    dataKey="balance"
                    dot={false}
                    name="Monatsbilanz"
                    stroke="#9C27B0"
                    strokeWidth={1.5}
                    type="monotone"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </>
        ))}

      {/* ── Personen ── */}
      {!loading &&
        tab === "persons" &&
        persons &&
        (persons.persons.length === 0 ? (
          <div className="card p-8 text-center text-gray-400">
            Keine gemeinsamen Ausgaben in diesem Monat.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
              <div className="card p-4">
                <p className="text-gray-500 text-xs uppercase">
                  Gesamtausgaben
                </p>
                <p className="mt-1 font-bold text-2xl text-[var(--expense)]">
                  {fmt(persons.total)}
                </p>
              </div>
              <div className="card p-4">
                <p className="text-gray-500 text-xs uppercase">Ø pro Person</p>
                <p className="mt-1 font-bold text-2xl text-gray-900 dark:text-white">
                  {fmt(persons.avg)}
                </p>
              </div>
              <div className="card p-4">
                <p className="text-gray-500 text-xs uppercase">Personen</p>
                <p className="mt-1 font-bold text-2xl text-gray-900 dark:text-white">
                  {persons.persons.length}
                </p>
              </div>
            </div>

            <div className="card p-5">
              <h2 className="mb-4 font-semibold text-gray-900 dark:text-white">
                Ausgaben pro Person
              </h2>
              <div className="space-y-4">
                {persons.persons.map((p: any, i: number) => (
                  <div className="flex items-center gap-3" key={p.userId}>
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--primary)] font-bold text-sm text-white">
                      {p.user?.name?.slice(0, 1) || "?"}
                    </div>
                    <div className="flex-1">
                      <div className="mb-1 flex justify-between text-sm">
                        <span className="font-medium text-gray-900 dark:text-white">
                          {p.user?.name}
                        </span>
                        <span className="text-gray-600 dark:text-gray-400">
                          {fmt(p.total)} ({p.share}%)
                        </span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-gray-100 dark:bg-slate-600">
                        <div
                          className="h-2 rounded-full"
                          style={{
                            width: `${p.share}%`,
                            background: COLORS[i % COLORS.length],
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {persons.settlements.length > 0 && (
              <div className="card p-5">
                <h2 className="mb-4 font-semibold text-gray-900 dark:text-white">
                  Ausgleichsrechnung
                </h2>
                <p className="mb-3 text-gray-500 text-sm">
                  Wer muss wem wie viel zahlen, damit alle gleich viel
                  beigetragen haben:
                </p>
                <div className="space-y-2">
                  {persons.settlements.map((s: any, i: number) => (
                    <div
                      className="flex items-center gap-3 rounded-xl bg-gray-50 p-3 text-sm dark:bg-slate-700"
                      key={i}
                    >
                      <span className="font-medium text-gray-900 dark:text-white">
                        {s.from?.name}
                      </span>
                      <span className="text-gray-400">→</span>
                      <span className="font-medium text-gray-900 dark:text-white">
                        {s.to?.name}
                      </span>
                      <span className="ml-auto font-bold text-[var(--primary)]">
                        {fmt(s.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ))}
    </div>
  );
}
