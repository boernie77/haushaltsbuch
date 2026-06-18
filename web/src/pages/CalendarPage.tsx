import {
  ArrowRightLeft,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { calendarAPI } from "../services/api";
import { useAuthStore } from "../store/authStore";

interface CalAccount {
  color: string;
  icon: string;
  id: string;
  name: string;
  startingBalance: number;
  startingBalanceDate: string | null;
  type: "asset" | "liability";
}

interface CalTransaction {
  accountId: string | null;
  affectsBalance: boolean;
  amount: number;
  category: { color: string; icon: string; nameDE: string } | null;
  date: string;
  description: string | null;
  id: string;
  merchant: string | null;
  projected: boolean;
  transferTargetAccountId: string | null;
  type: "expense" | "income" | "transfer";
}

interface CalDay {
  balances: Record<string, number>;
  date: string;
  day: number;
  inMonth: boolean;
  isFuture: boolean;
  isToday: boolean;
  total: number;
  transactions: CalTransaction[];
}

interface CalData {
  accounts: CalAccount[];
  days: CalDay[];
  month: number;
  today: string;
  year: number;
}

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
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

export default function CalendarPage() {
  const { currentHousehold } = useAuthStore();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1); // 1-12
  const [data, setData] = useState<CalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const fmt = (n: number) =>
    new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency: currentHousehold?.currency || "EUR",
    }).format(n);

  const load = async () => {
    if (!currentHousehold) {
      return;
    }
    setLoading(true);
    try {
      const { data: res } = await calendarAPI.get(
        currentHousehold.id,
        year,
        month
      );
      setData(res);
      // Vorauswahl: heute, falls im Monat, sonst der 1. des Monats.
      const todayIn = res.days.find(
        (d: CalDay) => d.isToday && d.inMonth
      )?.date;
      const firstIn = res.days.find((d: CalDay) => d.inMonth)?.date;
      setSelectedDate(todayIn || firstIn || null);
    } catch (err: any) {
      toast.error(
        err.response?.data?.error || "Kalender konnte nicht geladen werden"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentHousehold, year, month]);

  const prev = () => {
    if (month === 1) {
      setMonth(12);
      setYear((y) => y - 1);
    } else {
      setMonth((m) => m - 1);
    }
  };
  const next = () => {
    if (month === 12) {
      setMonth(1);
      setYear((y) => y + 1);
    } else {
      setMonth((m) => m + 1);
    }
  };
  const goToday = () => {
    const t = new Date();
    setYear(t.getFullYear());
    setMonth(t.getMonth() + 1);
  };

  const accountsById = useMemo(() => {
    const map: Record<string, CalAccount> = {};
    for (const a of data?.accounts || []) {
      map[a.id] = a;
    }
    return map;
  }, [data]);

  const selectedDay = useMemo(
    () => data?.days.find((d) => d.date === selectedDate) || null,
    [data, selectedDate]
  );

  const formatDayLabel = (dateStr: string) => {
    const [y, m, d] = dateStr.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    const wd = [
      "Sonntag",
      "Montag",
      "Dienstag",
      "Mittwoch",
      "Donnerstag",
      "Freitag",
      "Samstag",
    ][dt.getDay()];
    return `${wd}, ${d}. ${MONTHS[m - 1]} ${y}`;
  };

  // Summen-Netto eines Tages (nur balance-wirksame Buchungen).
  const dayNet = (day: CalDay) => {
    let net = 0;
    for (const t of day.transactions) {
      if (!t.affectsBalance || t.type === "transfer") {
        continue;
      }
      net += t.type === "income" ? t.amount : -t.amount;
    }
    return net;
  };

  const txAmountLabel = (t: CalTransaction) => {
    if (t.type === "income") {
      return `+${fmt(t.amount)}`;
    }
    if (t.type === "expense") {
      return `−${fmt(t.amount)}`;
    }
    return fmt(t.amount);
  };

  const txAmountColor = (t: CalTransaction) => {
    if (t.type === "income") {
      return "text-green-600";
    }
    if (t.type === "expense") {
      return "text-[var(--expense)]";
    }
    return "text-gray-500";
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 font-bold text-2xl text-gray-900 dark:text-white">
          <CalendarDays className="text-[var(--primary)]" size={24} />
          Kalender
        </h1>
        <div className="flex items-center gap-2">
          <button
            className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 dark:hover:bg-slate-700"
            onClick={prev}
            title="Vorheriger Monat"
            type="button"
          >
            <ChevronLeft size={20} />
          </button>
          <div className="min-w-[10rem] text-center font-semibold text-gray-900 dark:text-white">
            {MONTHS[month - 1]} {year}
          </div>
          <button
            className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 dark:hover:bg-slate-700"
            onClick={next}
            title="Nächster Monat"
            type="button"
          >
            <ChevronRight size={20} />
          </button>
          <button
            className="btn-secondary ml-2"
            onClick={goToday}
            type="button"
          >
            Heute
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-12">
          <div className="h-8 w-8 animate-spin rounded-full border-[var(--primary)] border-b-2" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Kalendergitter */}
          <div className="card p-3 lg:col-span-2">
            <div className="mb-1 grid grid-cols-7 gap-1">
              {WEEKDAYS.map((w) => (
                <div
                  className="py-1 text-center font-medium text-gray-400 text-xs uppercase"
                  key={w}
                >
                  {w}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {data?.days.map((d) => {
                const net = dayNet(d);
                const isSelected = d.date === selectedDate;
                const txCount = d.transactions.length;
                return (
                  <button
                    className={`flex min-h-[4.5rem] flex-col rounded-lg border p-1.5 text-left transition-all ${
                      isSelected
                        ? "border-[var(--primary)] ring-1 ring-[var(--primary)]"
                        : "border-transparent hover:border-gray-200 dark:hover:border-slate-600"
                    } ${
                      d.inMonth
                        ? "bg-gray-50 dark:bg-slate-700/40"
                        : "bg-transparent opacity-50"
                    }`}
                    key={d.date}
                    onClick={() => setSelectedDate(d.date)}
                    type="button"
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`flex h-5 w-5 items-center justify-center rounded-full text-xs ${
                          d.isToday
                            ? "bg-[var(--primary)] font-bold text-white"
                            : "text-gray-700 dark:text-gray-200"
                        }`}
                      >
                        {d.day}
                      </span>
                      {txCount > 0 && (
                        <span
                          className={`text-[10px] ${
                            d.isFuture ? "text-gray-400" : "text-gray-500"
                          }`}
                        >
                          {txCount}×
                        </span>
                      )}
                    </div>
                    {net !== 0 && (
                      <span
                        className={`mt-0.5 truncate text-[11px] ${
                          net > 0 ? "text-green-600" : "text-[var(--expense)]"
                        }`}
                      >
                        {net > 0 ? "+" : "−"}
                        {fmt(Math.abs(net))}
                      </span>
                    )}
                    <span
                      className={`mt-auto truncate text-[11px] ${
                        d.total < 0
                          ? "text-[var(--expense)]"
                          : "text-gray-500 dark:text-gray-400"
                      }`}
                      title="Vermögen am Tagesende"
                    >
                      {fmt(d.total)}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-gray-400">
              <span>Untere Zahl = Gesamtvermögen am Tagesende</span>
              <span>· gestrichelt = Dauerauftrag-Vorschau</span>
            </div>
          </div>

          {/* Detail-Panel */}
          <div className="card space-y-4 p-4">
            {selectedDay ? (
              <>
                <div>
                  <h2 className="font-semibold text-gray-900 dark:text-white">
                    {formatDayLabel(selectedDay.date)}
                  </h2>
                  {selectedDay.isFuture && (
                    <span className="text-[var(--primary)] text-xs">
                      Vorausschau
                    </span>
                  )}
                </div>

                {/* Kontostände am Tagesende */}
                <div>
                  <h3 className="mb-2 font-medium text-gray-500 text-xs uppercase tracking-wide">
                    Kontostände am Tagesende
                  </h3>
                  <div className="space-y-1.5">
                    {data?.accounts.map((a) => {
                      const bal = selectedDay.balances[a.id] ?? 0;
                      return (
                        <div
                          className="flex items-center gap-2 text-sm"
                          key={a.id}
                        >
                          <span
                            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs"
                            style={{
                              background: `${a.color}20`,
                              color: a.color,
                            }}
                          >
                            {a.icon}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-gray-700 dark:text-gray-300">
                            {a.name}
                          </span>
                          <span
                            className={`shrink-0 font-medium ${
                              bal < 0
                                ? "text-[var(--expense)]"
                                : "text-green-600"
                            }`}
                          >
                            {fmt(bal)}
                          </span>
                        </div>
                      );
                    })}
                    <div className="mt-1 flex items-center justify-between border-gray-200 border-t pt-1.5 text-sm dark:border-slate-600">
                      <span className="font-semibold text-gray-700 dark:text-gray-200">
                        Gesamt
                      </span>
                      <span
                        className={`font-bold ${
                          selectedDay.total < 0
                            ? "text-[var(--expense)]"
                            : "text-green-600"
                        }`}
                      >
                        {fmt(selectedDay.total)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Buchungen des Tages */}
                <div>
                  <h3 className="mb-2 font-medium text-gray-500 text-xs uppercase tracking-wide">
                    Buchungen ({selectedDay.transactions.length})
                  </h3>
                  {selectedDay.transactions.length === 0 ? (
                    <p className="text-gray-400 text-sm">
                      Keine Buchungen an diesem Tag.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {selectedDay.transactions.map((t) => (
                        <div
                          className={`flex items-center gap-2 rounded-lg border p-2 ${
                            t.projected
                              ? "border-[var(--primary)] border-dashed bg-[var(--primary)]/5"
                              : "border-gray-100 dark:border-slate-700"
                          }`}
                          key={t.id}
                        >
                          <span
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-sm"
                            style={{
                              background: t.category
                                ? `${t.category.color}20`
                                : "#e5e7eb",
                              color: t.category?.color || "#6b7280",
                            }}
                          >
                            {t.type === "transfer" ? (
                              <ArrowRightLeft size={14} />
                            ) : (
                              t.category?.icon || "💸"
                            )}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-gray-800 text-sm dark:text-gray-200">
                              {t.description ||
                                t.merchant ||
                                t.category?.nameDE ||
                                (t.type === "transfer"
                                  ? "Umbuchung"
                                  : "Buchung")}
                            </div>
                            <div className="truncate text-gray-400 text-xs">
                              {t.type === "transfer"
                                ? `${
                                    accountsById[t.accountId || ""]?.name || "?"
                                  } → ${
                                    accountsById[
                                      t.transferTargetAccountId || ""
                                    ]?.name || "?"
                                  }`
                                : accountsById[t.accountId || ""]?.name || ""}
                              {t.projected && " · Vorschau"}
                            </div>
                          </div>
                          <span
                            className={`shrink-0 font-medium text-sm ${txAmountColor(
                              t
                            )}`}
                          >
                            {txAmountLabel(t)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <p className="py-8 text-center text-gray-400 text-sm">
                Tag auswählen, um Buchungen und Kontostände zu sehen.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
