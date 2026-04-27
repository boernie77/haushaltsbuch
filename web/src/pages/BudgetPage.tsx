import { AlertTriangle, PiggyBank, Plus, Target, Trash2 } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { budgetAPI, categoryAPI, savingsGoalAPI } from "../services/api";
import { useAuthStore } from "../store/authStore";

type Tab = "budgets" | "goals";

const GOAL_ICONS = [
  "🎯",
  "🏠",
  "✈️",
  "🚗",
  "💻",
  "🎓",
  "💍",
  "🏖️",
  "🛋️",
  "📱",
  "🎸",
  "⛵",
];

export default function BudgetPage() {
  const { currentHousehold } = useAuthStore();
  const [tab, setTab] = useState<Tab>("budgets");

  // Budgets
  const [budgets, setBudgets] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [showBudgetForm, setShowBudgetForm] = useState(false);
  const [budgetForm, setBudgetForm] = useState({
    categoryId: "",
    limitAmount: "",
    warningAt: "80",
    month: "",
    year: String(new Date().getFullYear()),
  });

  // Sparziele
  const [goals, setGoals] = useState<any[]>([]);
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [goalForm, setGoalForm] = useState({
    name: "",
    targetAmount: "",
    savedAmount: "0",
    targetDate: "",
    icon: "🎯",
    color: "#E91E8C",
  });
  const [depositGoalId, setDepositGoalId] = useState<string | null>(null);
  const [depositAmount, setDepositAmount] = useState("");

  const now = new Date();
  const startDay = currentHousehold?.monthStartDay || 1;
  let periodMonth = now.getMonth() + 1;
  let periodYear = now.getFullYear();
  if (startDay > 1 && now.getDate() >= startDay) {
    if (periodMonth === 12) {
      periodMonth = 1;
      periodYear += 1;
    } else {
      periodMonth += 1;
    }
  }

  const fmt = (n: number) =>
    new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency: currentHousehold?.currency || "EUR",
    }).format(n);

  const loadBudgets = async () => {
    if (!currentHousehold) {
      return;
    }
    const { data } = await budgetAPI.getAll({
      householdId: currentHousehold.id,
      month: periodMonth,
      year: periodYear,
    });
    setBudgets(data.budgets);
  };

  const loadGoals = async () => {
    if (!currentHousehold) {
      return;
    }
    const { data } = await savingsGoalAPI.getAll(currentHousehold.id);
    setGoals(data.goals);
  };

  useEffect(() => {
    if (!currentHousehold) {
      return;
    }
    loadBudgets();
    loadGoals();
    categoryAPI
      .getAll(currentHousehold.id)
      .then(({ data }) => setCategories(data.categories));
  }, [currentHousehold]);

  const handleSaveBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentHousehold) {
      return;
    }
    try {
      await budgetAPI.create({
        ...budgetForm,
        householdId: currentHousehold.id,
        month: budgetForm.month || null,
      });
      toast.success("Budget gesetzt");
      setShowBudgetForm(false);
      loadBudgets();
    } catch {
      toast.error("Fehler");
    }
  };

  const handleSaveGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentHousehold) {
      return;
    }
    try {
      await savingsGoalAPI.create({
        ...goalForm,
        householdId: currentHousehold.id,
        targetAmount: Number.parseFloat(goalForm.targetAmount),
        savedAmount: Number.parseFloat(goalForm.savedAmount || "0"),
      });
      toast.success("Sparziel erstellt");
      setShowGoalForm(false);
      setGoalForm({
        name: "",
        targetAmount: "",
        savedAmount: "0",
        targetDate: "",
        icon: "🎯",
        color: "#E91E8C",
      });
      loadGoals();
    } catch {
      toast.error("Fehler");
    }
  };

  const handleDeposit = async (goalId: string) => {
    const amount = Number.parseFloat(depositAmount);
    if (!amount || amount <= 0) {
      return;
    }
    try {
      const goal = goals.find((g) => g.id === goalId);
      await savingsGoalAPI.update(goalId, {
        savedAmount: (Number.parseFloat(goal.savedAmount) || 0) + amount,
      });
      toast.success("Eingezahlt!");
      setDepositGoalId(null);
      setDepositAmount("");
      loadGoals();
    } catch {
      toast.error("Fehler");
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-bold text-2xl text-gray-900 dark:text-white">
          Budget & Sparziele
        </h1>
        <div className="flex gap-2">
          <button
            className={`flex items-center gap-2 rounded-xl px-4 py-2 font-medium text-sm transition-all ${tab === "budgets" ? "bg-[var(--primary)] text-white" : "bg-white text-gray-700 dark:bg-slate-800 dark:text-gray-300"}`}
            onClick={() => setTab("budgets")}
          >
            <AlertTriangle size={15} /> Budgets
          </button>
          <button
            className={`flex items-center gap-2 rounded-xl px-4 py-2 font-medium text-sm transition-all ${tab === "goals" ? "bg-[var(--primary)] text-white" : "bg-white text-gray-700 dark:bg-slate-800 dark:text-gray-300"}`}
            onClick={() => setTab("goals")}
          >
            <Target size={15} /> Sparziele
          </button>
        </div>
      </div>

      {/* ── Budgets ── */}
      {tab === "budgets" && (
        <>
          <button
            className="btn-primary flex items-center gap-2"
            onClick={() => setShowBudgetForm(true)}
          >
            <Plus size={18} /> Neues Budget
          </button>

          {showBudgetForm && (
            <div className="card p-6">
              <h2 className="mb-4 font-semibold text-gray-900 dark:text-white">
                Budget hinzufügen
              </h2>
              <form
                className="grid grid-cols-1 gap-4 md:grid-cols-2"
                onSubmit={handleSaveBudget}
              >
                <div>
                  <label className="mb-1 block font-medium text-gray-700 text-sm dark:text-gray-300">
                    Kategorie (leer = Gesamtbudget)
                  </label>
                  <select
                    className="input"
                    onChange={(e) =>
                      setBudgetForm((f) => ({
                        ...f,
                        categoryId: e.target.value,
                      }))
                    }
                    value={budgetForm.categoryId}
                  >
                    <option value="">Gesamtes Haushaltbudget</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.icon} {c.nameDE || c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block font-medium text-gray-700 text-sm dark:text-gray-300">
                    Limit (€) *
                  </label>
                  <input
                    className="input"
                    onChange={(e) =>
                      setBudgetForm((f) => ({
                        ...f,
                        limitAmount: e.target.value,
                      }))
                    }
                    required
                    step="0.01"
                    type="number"
                    value={budgetForm.limitAmount}
                  />
                </div>
                <div>
                  <label className="mb-1 block font-medium text-gray-700 text-sm dark:text-gray-300">
                    Warnung bei (%)
                  </label>
                  <input
                    className="input"
                    max="100"
                    min="1"
                    onChange={(e) =>
                      setBudgetForm((f) => ({
                        ...f,
                        warningAt: e.target.value,
                      }))
                    }
                    type="number"
                    value={budgetForm.warningAt}
                  />
                </div>
                <div>
                  <label className="mb-1 block font-medium text-gray-700 text-sm dark:text-gray-300">
                    Gültig für Monat
                  </label>
                  <select
                    className="input"
                    onChange={(e) =>
                      setBudgetForm((f) => ({ ...f, month: e.target.value }))
                    }
                    value={budgetForm.month}
                  >
                    <option value="">Ganzes Jahr (alle Monate)</option>
                    {[
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
                    ].map((m, i) => (
                      <option key={i} value={String(i + 1)}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex justify-end gap-3 md:col-span-2">
                  <button
                    className="rounded-xl bg-gray-100 px-4 py-2 font-medium text-sm dark:bg-slate-700"
                    onClick={() => setShowBudgetForm(false)}
                    type="button"
                  >
                    Abbrechen
                  </button>
                  <button className="btn-primary" type="submit">
                    Speichern
                  </button>
                </div>
              </form>
            </div>
          )}

          <div className="space-y-4">
            {budgets.map((budget) => (
              <div className="card p-5" key={budget.id}>
                <div className="mb-3 flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">
                      {budget.Category
                        ? `${budget.Category.icon} ${budget.Category.nameDE || budget.Category.name}`
                        : "🏠 Gesamthaushalt"}
                    </h3>
                    <p className="text-gray-500 text-sm">
                      Limit: {fmt(Number.parseFloat(budget.limitAmount))}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {budget.isWarning && (
                      <AlertTriangle className="text-orange-500" size={18} />
                    )}
                    <span
                      className={`font-bold text-lg ${budget.isOver ? "text-red-500" : budget.isWarning ? "text-orange-500" : "text-gray-900 dark:text-white"}`}
                    >
                      {budget.percentage}%
                    </span>
                    <button
                      className="text-gray-400 hover:text-red-500"
                      onClick={() => {
                        budgetAPI.delete(budget.id).then(() => {
                          toast.success("Gelöscht");
                          loadBudgets();
                        });
                      }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                <div className="mb-2 flex justify-between text-gray-600 text-sm dark:text-gray-400">
                  <span>Ausgegeben: {fmt(budget.spent || 0)}</span>
                  <span>
                    Noch frei: {fmt(budget.limitAmount - (budget.spent || 0))}
                  </span>
                </div>
                <div className="h-3 w-full rounded-full bg-gray-200 dark:bg-slate-600">
                  <div
                    className={`h-3 rounded-full transition-all ${budget.isOver ? "bg-red-500" : budget.isWarning ? "bg-orange-500" : "bg-[var(--primary)]"}`}
                    style={{ width: `${Math.min(budget.percentage, 100)}%` }}
                  />
                </div>
                {budget.isOver && (
                  <p className="mt-2 text-red-500 text-sm">
                    ⚠️ Budget überschritten!
                  </p>
                )}
                {budget.isWarning && !budget.isOver && (
                  <p className="mt-2 text-orange-500 text-sm">
                    ⚠️ Über {budget.warningAt}% des Budgets verbraucht
                  </p>
                )}
              </div>
            ))}
            {budgets.length === 0 && (
              <div className="py-12 text-center text-gray-400">
                <div className="mb-4 text-5xl">💰</div>
                <p>Noch keine Budgets gesetzt</p>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Sparziele ── */}
      {tab === "goals" && (
        <>
          <button
            className="btn-primary flex items-center gap-2"
            onClick={() => setShowGoalForm(true)}
          >
            <Plus size={18} /> Neues Sparziel
          </button>

          {showGoalForm && (
            <div className="card p-6">
              <h2 className="mb-4 font-semibold text-gray-900 dark:text-white">
                Sparziel erstellen
              </h2>
              <form
                className="grid grid-cols-1 gap-4 md:grid-cols-2"
                onSubmit={handleSaveGoal}
              >
                <div>
                  <label className="mb-1 block font-medium text-gray-700 text-sm dark:text-gray-300">
                    Name *
                  </label>
                  <input
                    className="input"
                    onChange={(e) =>
                      setGoalForm((f) => ({ ...f, name: e.target.value }))
                    }
                    placeholder="z.B. Urlaub Mallorca"
                    required
                    value={goalForm.name}
                  />
                </div>
                <div>
                  <label className="mb-1 block font-medium text-gray-700 text-sm dark:text-gray-300">
                    Zielbetrag (€) *
                  </label>
                  <input
                    className="input"
                    onChange={(e) =>
                      setGoalForm((f) => ({
                        ...f,
                        targetAmount: e.target.value,
                      }))
                    }
                    required
                    step="0.01"
                    type="number"
                    value={goalForm.targetAmount}
                  />
                </div>
                <div>
                  <label className="mb-1 block font-medium text-gray-700 text-sm dark:text-gray-300">
                    Bereits gespart (€)
                  </label>
                  <input
                    className="input"
                    onChange={(e) =>
                      setGoalForm((f) => ({
                        ...f,
                        savedAmount: e.target.value,
                      }))
                    }
                    step="0.01"
                    type="number"
                    value={goalForm.savedAmount}
                  />
                </div>
                <div>
                  <label className="mb-1 block font-medium text-gray-700 text-sm dark:text-gray-300">
                    Zieldatum (optional)
                  </label>
                  <input
                    className="input"
                    onChange={(e) =>
                      setGoalForm((f) => ({ ...f, targetDate: e.target.value }))
                    }
                    type="date"
                    value={goalForm.targetDate}
                  />
                </div>
                <div>
                  <label className="mb-1 block font-medium text-gray-700 text-sm dark:text-gray-300">
                    Icon
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {GOAL_ICONS.map((icon) => (
                      <button
                        className={`flex h-9 w-9 items-center justify-center rounded-lg text-lg ${goalForm.icon === icon ? "bg-[var(--primary)] text-white" : "bg-gray-100 dark:bg-slate-700"}`}
                        key={icon}
                        onClick={() => setGoalForm((f) => ({ ...f, icon }))}
                        type="button"
                      >
                        {icon}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex justify-end gap-3 md:col-span-2">
                  <button
                    className="rounded-xl bg-gray-100 px-4 py-2 font-medium text-sm dark:bg-slate-700"
                    onClick={() => setShowGoalForm(false)}
                    type="button"
                  >
                    Abbrechen
                  </button>
                  <button className="btn-primary" type="submit">
                    Erstellen
                  </button>
                </div>
              </form>
            </div>
          )}

          <div className="space-y-4">
            {goals.map((goal) => {
              const pct =
                goal.targetAmount > 0
                  ? Math.min((goal.savedAmount / goal.targetAmount) * 100, 100)
                  : 0;
              const remaining = goal.targetAmount - goal.savedAmount;
              return (
                <div
                  className={`card p-5 ${goal.isCompleted ? "border-2 border-green-400" : ""}`}
                  key={goal.id}
                >
                  <div className="mb-3 flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">{goal.icon}</span>
                      <div>
                        <h3 className="font-semibold text-gray-900 dark:text-white">
                          {goal.name}
                        </h3>
                        {goal.targetDate && (
                          <p className="text-gray-500 text-xs">
                            Zieldatum:{" "}
                            {new Date(goal.targetDate).toLocaleDateString(
                              "de-DE"
                            )}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {goal.isCompleted && (
                        <span className="font-medium text-green-500 text-sm">
                          ✅ Erreicht!
                        </span>
                      )}
                      <button
                        className="text-gray-400 hover:text-red-500"
                        onClick={() =>
                          savingsGoalAPI.delete(goal.id).then(() => {
                            toast.success("Gelöscht");
                            loadGoals();
                          })
                        }
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  <div className="mb-2 flex justify-between text-gray-600 text-sm dark:text-gray-400">
                    <span className="flex items-center gap-1">
                      <PiggyBank size={14} /> {fmt(goal.savedAmount)} gespart
                    </span>
                    <span>Ziel: {fmt(goal.targetAmount)}</span>
                  </div>
                  <div className="mb-2 h-3 w-full rounded-full bg-gray-200 dark:bg-slate-600">
                    <div
                      className="h-3 rounded-full transition-all"
                      style={{
                        width: `${pct}%`,
                        background: goal.isCompleted
                          ? "#22c55e"
                          : "var(--primary)",
                      }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-gray-500 text-xs">
                    <span>{pct.toFixed(1)}% erreicht</span>
                    {!goal.isCompleted && (
                      <span>Noch {fmt(remaining)} fehlend</span>
                    )}
                  </div>

                  {!goal.isCompleted && (
                    <div className="mt-3">
                      {depositGoalId === goal.id ? (
                        <div className="mt-2 flex gap-2">
                          <input
                            autoFocus
                            className="input flex-1"
                            onChange={(e) => setDepositAmount(e.target.value)}
                            placeholder="Betrag"
                            step="0.01"
                            type="number"
                            value={depositAmount}
                          />
                          <button
                            className="btn-primary px-3 text-sm"
                            onClick={() => handleDeposit(goal.id)}
                          >
                            Einzahlen
                          </button>
                          <button
                            className="rounded-xl bg-gray-100 px-3 py-2 text-sm dark:bg-slate-700"
                            onClick={() => {
                              setDepositGoalId(null);
                              setDepositAmount("");
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <button
                          className="mt-2 rounded-xl bg-[var(--primary-light,#fce4ec)] px-4 py-2 font-medium text-[var(--primary)] text-sm transition-opacity hover:opacity-90"
                          onClick={() => {
                            setDepositGoalId(goal.id);
                            setDepositAmount("");
                          }}
                        >
                          + Einzahlen
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {goals.length === 0 && (
              <div className="py-12 text-center text-gray-400">
                <div className="mb-4 text-5xl">🎯</div>
                <p>Noch keine Sparziele erstellt</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
