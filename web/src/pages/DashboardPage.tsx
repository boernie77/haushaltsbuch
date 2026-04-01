import { format } from "date-fns";
import { de } from "date-fns/locale";
import {
  AlertTriangle,
  BarChart2,
  PiggyBank,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { budgetAPI, statsAPI } from "../services/api";
import { useAuthStore } from "../store/authStore";

const COLORS = [
  "#E91E8C",
  "#9C27B0",
  "#F06292",
  "#CE93D8",
  "#F48FB1",
  "#AB47BC",
  "#E040FB",
  "#2196F3",
];

export default function DashboardPage() {
  const { user, currentHousehold } = useAuthStore();
  const [overview, setOverview] = useState<any>(null);
  const [monthly, setMonthly] = useState<any>(null);
  const [budgets, setBudgets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const now = new Date();
  const startDay = currentHousehold?.monthStartDay || 1;
  let periodMonth = now.getMonth() + 1;
  let periodYear = now.getFullYear();
  if (startDay > 1 && now.getDate() < startDay) {
    if (periodMonth === 1) {
      periodMonth = 12;
      periodYear -= 1;
    } else {
      periodMonth -= 1;
    }
  }

  useEffect(() => {
    if (!currentHousehold) {
      return;
    }
    setLoading(true);
    Promise.all([
      statsAPI.overview(currentHousehold.id),
      statsAPI.monthly({
        householdId: currentHousehold.id,
        year: periodYear,
        month: periodMonth,
      }),
      budgetAPI.getAll({
        householdId: currentHousehold.id,
        month: periodMonth,
        year: periodYear,
      }),
    ])
      .then(([o, m, b]) => {
        setOverview(o.data);
        setMonthly(m.data);
        setBudgets(b.data.budgets);
      })
      .finally(() => setLoading(false));
  }, [currentHousehold, periodMonth, periodYear]);

  if (!currentHousehold) {
    return (
      <div className="flex h-full items-center justify-center text-gray-400">
        <div className="text-center">
          <div className="mb-4 text-5xl">🏠</div>
          <p>Kein Haushalt ausgewählt.</p>
          <p className="mt-1 text-sm">
            Bitte einen Haushalt in der Sidebar auswählen oder erstellen.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-[var(--primary)] border-b-2" />
      </div>
    );
  }

  const budgetPercent =
    currentHousehold?.monthlyBudget && overview
      ? (overview.thisMonth / currentHousehold.monthlyBudget) * 100
      : 0;

  const pieData =
    monthly?.byCategory?.slice(0, 8).map((c: any) => ({
      name: c.category?.nameDE || "Sonstiges",
      value: c.total,
      icon: c.category?.icon,
    })) || [];

  const fmt = (n: number) =>
    new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency: currentHousehold.currency || "EUR",
    }).format(n);

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="font-bold text-2xl text-gray-900 dark:text-white">
          Hallo, {user?.name?.split(" ")[0]} 👋
        </h1>
        <p className="mt-1 text-gray-500 dark:text-gray-400">
          {format(now, "EEEE, d. MMMM yyyy", { locale: de })} ·{" "}
          {currentHousehold?.name}
        </p>
      </div>

      {/* Summary Cards — 4 cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="font-semibold text-gray-500 text-xs uppercase tracking-wide">
              Ausgaben
            </p>
            <TrendingDown className="text-[var(--expense)]" size={18} />
          </div>
          <p className="font-bold text-2xl text-[var(--expense)]">
            {fmt(overview?.thisMonth || 0)}
          </p>
          <p
            className={`mt-2 flex items-center gap-1 text-xs ${(overview?.changePercent ?? 0) >= 0 ? "text-red-500" : "text-green-500"}`}
          >
            {(overview?.changePercent ?? 0) >= 0 ? (
              <TrendingUp size={12} />
            ) : (
              <TrendingDown size={12} />
            )}
            {(overview?.changePercent ?? 0) > 0 ? "+" : ""}
            {(overview?.changePercent ?? 0).toFixed(1)}% zum Vormonat
          </p>
        </div>

        <div className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="font-semibold text-gray-500 text-xs uppercase tracking-wide">
              Einnahmen
            </p>
            <TrendingUp className="text-[var(--income)]" size={18} />
          </div>
          <p className="font-bold text-2xl text-[var(--income)]">
            {fmt(overview?.thisMonthIncome || 0)}
          </p>
          <p className="mt-2 text-gray-500 text-xs">
            Vormonat: {fmt(overview?.lastMonth || 0)}
          </p>
        </div>

        <div className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="font-semibold text-gray-500 text-xs uppercase tracking-wide">
              Bilanz
            </p>
            <Wallet
              className={
                overview?.balance >= 0
                  ? "text-[var(--income)]"
                  : "text-[var(--expense)]"
              }
              size={18}
            />
          </div>
          <p
            className={`font-bold text-2xl ${(overview?.balance ?? 0) >= 0 ? "text-[var(--income)]" : "text-[var(--expense)]"}`}
          >
            {(overview?.balance ?? 0) >= 0 ? "+" : ""}
            {fmt(overview?.balance || 0)}
          </p>
          <p className="mt-2 text-gray-500 text-xs">Diesen Monat</p>
        </div>

        <div className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="font-semibold text-gray-500 text-xs uppercase tracking-wide">
              Sparquote
            </p>
            <PiggyBank
              className={
                (overview?.savingsRate ?? 0) >= 0
                  ? "text-[var(--income)]"
                  : "text-[var(--expense)]"
              }
              size={18}
            />
          </div>
          <p
            className={`font-bold text-2xl ${(overview?.savingsRate ?? 0) >= 0 ? "text-[var(--income)]" : "text-[var(--expense)]"}`}
          >
            {(overview?.savingsRate ?? 0).toFixed(1)}%
          </p>
          <p className="mt-2 text-gray-500 text-xs">Einnahmen gespart</p>
        </div>
      </div>

      {/* Forecast + Budget */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Prognose */}
        {overview?.projectedExpenses > 0 && (
          <div className="card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900 dark:text-white">
                Monats-Prognose
              </h2>
              <BarChart2 className="text-gray-400" size={18} />
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Hochgerechnete Ausgaben</span>
                <span className="font-medium text-[var(--expense)]">
                  {fmt(overview.projectedExpenses)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">
                  Verbleibend (prognostiziert)
                </span>
                <span
                  className={`font-medium ${overview.projectedRemaining >= 0 ? "text-[var(--income)]" : "text-[var(--expense)]"}`}
                >
                  {fmt(overview.projectedRemaining)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Tag</span>
                <span className="text-gray-700 dark:text-gray-300">
                  {overview.currentDay} / {overview.daysInMonth}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Monatsbudget */}
        {currentHousehold?.monthlyBudget && (
          <div className="card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900 dark:text-white">
                Monatsbudget
              </h2>
              {budgetPercent >= 80 && (
                <AlertTriangle className="text-orange-500" size={18} />
              )}
            </div>
            <div className="mb-2 flex justify-between text-gray-600 text-sm dark:text-gray-400">
              <span>
                {fmt(overview?.thisMonth || 0)} von{" "}
                {fmt(Number.parseFloat(String(currentHousehold.monthlyBudget)))}
              </span>
              <span
                className={`font-bold ${budgetPercent >= 100 ? "text-red-500" : budgetPercent >= 80 ? "text-orange-500" : "text-green-600"}`}
              >
                {Math.round(budgetPercent)}%
              </span>
            </div>
            <div className="h-3 w-full rounded-full bg-gray-200 dark:bg-slate-600">
              <div
                className={`h-3 rounded-full transition-all ${budgetPercent >= 100 ? "bg-red-500" : budgetPercent >= 80 ? "bg-orange-500" : "bg-[var(--primary)]"}`}
                style={{ width: `${Math.min(budgetPercent, 100)}%` }}
              />
            </div>
            {budgetPercent >= 80 && (
              <p
                className={`mt-2 text-sm ${budgetPercent >= 100 ? "text-red-500" : "text-orange-500"}`}
              >
                ⚠️{" "}
                {budgetPercent >= 100
                  ? "Budget überschritten!"
                  : "Budget fast aufgebraucht!"}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Pie Chart */}
        {pieData.length > 0 && (
          <div className="card p-5">
            <h2 className="mb-4 font-semibold text-gray-900 dark:text-white">
              Ausgaben nach Kategorie
            </h2>
            <ResponsiveContainer height={220} width="100%">
              <PieChart>
                <Pie
                  cx="50%"
                  cy="50%"
                  data={pieData}
                  dataKey="value"
                  innerRadius={55}
                  outerRadius={90}
                >
                  {pieData.map((_: any, i: number) => (
                    <Cell fill={COLORS[i % COLORS.length]} key={i} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: any) => fmt(v)} />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-2 grid grid-cols-2 gap-1">
              {pieData.slice(0, 6).map((d: any, i: number) => (
                <div
                  className="flex items-center gap-2 text-gray-600 text-xs dark:text-gray-400"
                  key={i}
                >
                  <div
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: COLORS[i % COLORS.length] }}
                  />
                  <span className="truncate">
                    {d.icon} {d.name}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Category Budgets */}
        {budgets.filter((b) => b.categoryId).length > 0 && (
          <div className="card p-5">
            <h2 className="mb-4 font-semibold text-gray-900 dark:text-white">
              Kategoriebudgets
            </h2>
            <div className="space-y-3">
              {budgets
                .filter((b) => b.categoryId)
                .map((budget) => (
                  <div key={budget.id}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="text-gray-700 dark:text-gray-300">
                        {budget.Category?.icon}{" "}
                        {budget.Category?.nameDE || budget.Category?.name}
                      </span>
                      <span
                        className={`font-medium ${budget.isOver ? "text-red-500" : budget.isWarning ? "text-orange-500" : "text-gray-600 dark:text-gray-400"}`}
                      >
                        {fmt(budget.spent || 0)} / {fmt(budget.limitAmount)}
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-gray-200 dark:bg-slate-600">
                      <div
                        className={`h-2 rounded-full ${budget.isOver ? "bg-red-500" : budget.isWarning ? "bg-orange-500" : "bg-[var(--primary)]"}`}
                        style={{
                          width: `${Math.min(budget.percentage, 100)}%`,
                        }}
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
              <p className="font-semibold text-gray-500 text-xs uppercase">
                Top Kategorie diesen Monat
              </p>
              <p className="mt-0.5 font-bold text-gray-900 text-lg dark:text-white">
                {overview.topCategory.icon}{" "}
                {overview.topCategory.nameDE || overview.topCategory.name}
                <span className="ml-2 font-normal text-base text-gray-500">
                  {fmt(overview.topCategory.total)}
                </span>
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
