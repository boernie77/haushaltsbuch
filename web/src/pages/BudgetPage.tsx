import React, { useState, useEffect } from 'react';
import { Plus, Trash2, AlertTriangle, Target, PiggyBank } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/authStore';
import { budgetAPI, categoryAPI, savingsGoalAPI } from '../services/api';

type Tab = 'budgets' | 'goals';

const GOAL_ICONS = ['🎯', '🏠', '✈️', '🚗', '💻', '🎓', '💍', '🏖️', '🛋️', '📱', '🎸', '⛵'];

export default function BudgetPage() {
  const { currentHousehold } = useAuthStore();
  const [tab, setTab] = useState<Tab>('budgets');

  // Budgets
  const [budgets, setBudgets] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [showBudgetForm, setShowBudgetForm] = useState(false);
  const [budgetForm, setBudgetForm] = useState({ categoryId: '', limitAmount: '', warningAt: '80', month: '', year: String(new Date().getFullYear()) });

  // Sparziele
  const [goals, setGoals] = useState<any[]>([]);
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [goalForm, setGoalForm] = useState({ name: '', targetAmount: '', savedAmount: '0', targetDate: '', icon: '🎯', color: '#E91E8C' });
  const [depositGoalId, setDepositGoalId] = useState<string | null>(null);
  const [depositAmount, setDepositAmount] = useState('');

  const now = new Date();

  const fmt = (n: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: currentHousehold?.currency || 'EUR' }).format(n);

  const loadBudgets = async () => {
    if (!currentHousehold) return;
    const { data } = await budgetAPI.getAll({ householdId: currentHousehold.id, month: now.getMonth() + 1, year: now.getFullYear() });
    setBudgets(data.budgets);
  };

  const loadGoals = async () => {
    if (!currentHousehold) return;
    const { data } = await savingsGoalAPI.getAll(currentHousehold.id);
    setGoals(data.goals);
  };

  useEffect(() => {
    if (!currentHousehold) return;
    loadBudgets();
    loadGoals();
    categoryAPI.getAll(currentHousehold.id).then(({ data }) => setCategories(data.categories));
  }, [currentHousehold]);

  const handleSaveBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentHousehold) return;
    try {
      await budgetAPI.create({ ...budgetForm, householdId: currentHousehold.id, month: budgetForm.month || null });
      toast.success('Budget gesetzt');
      setShowBudgetForm(false);
      loadBudgets();
    } catch { toast.error('Fehler'); }
  };

  const handleSaveGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentHousehold) return;
    try {
      await savingsGoalAPI.create({ ...goalForm, householdId: currentHousehold.id, targetAmount: parseFloat(goalForm.targetAmount), savedAmount: parseFloat(goalForm.savedAmount || '0') });
      toast.success('Sparziel erstellt');
      setShowGoalForm(false);
      setGoalForm({ name: '', targetAmount: '', savedAmount: '0', targetDate: '', icon: '🎯', color: '#E91E8C' });
      loadGoals();
    } catch { toast.error('Fehler'); }
  };

  const handleDeposit = async (goalId: string) => {
    const amount = parseFloat(depositAmount);
    if (!amount || amount <= 0) return;
    try {
      const goal = goals.find(g => g.id === goalId);
      await savingsGoalAPI.update(goalId, { savedAmount: (parseFloat(goal.savedAmount) || 0) + amount });
      toast.success('Eingezahlt!');
      setDepositGoalId(null);
      setDepositAmount('');
      loadGoals();
    } catch { toast.error('Fehler'); }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Budget & Sparziele</h1>
        <div className="flex gap-2">
          <button onClick={() => setTab('budgets')}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${tab === 'budgets' ? 'bg-[var(--primary)] text-white' : 'bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300'}`}>
            <AlertTriangle size={15} /> Budgets
          </button>
          <button onClick={() => setTab('goals')}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${tab === 'goals' ? 'bg-[var(--primary)] text-white' : 'bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300'}`}>
            <Target size={15} /> Sparziele
          </button>
        </div>
      </div>

      {/* ── Budgets ── */}
      {tab === 'budgets' && (
        <>
          <button className="btn-primary flex items-center gap-2" onClick={() => setShowBudgetForm(true)}>
            <Plus size={18} /> Neues Budget
          </button>

          {showBudgetForm && (
            <div className="card p-6">
              <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Budget hinzufügen</h2>
              <form onSubmit={handleSaveBudget} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Kategorie (leer = Gesamtbudget)</label>
                  <select className="input" value={budgetForm.categoryId} onChange={e => setBudgetForm(f => ({ ...f, categoryId: e.target.value }))}>
                    <option value="">Gesamtes Haushaltbudget</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.nameDE || c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Limit (€) *</label>
                  <input type="number" step="0.01" className="input" value={budgetForm.limitAmount}
                    onChange={e => setBudgetForm(f => ({ ...f, limitAmount: e.target.value }))} required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Warnung bei (%)</label>
                  <input type="number" min="1" max="100" className="input" value={budgetForm.warningAt}
                    onChange={e => setBudgetForm(f => ({ ...f, warningAt: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Gültig für Monat</label>
                  <select className="input" value={budgetForm.month} onChange={e => setBudgetForm(f => ({ ...f, month: e.target.value }))}>
                    <option value="">Ganzes Jahr (alle Monate)</option>
                    {['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'].map((m, i) => (
                      <option key={i} value={String(i+1)}>{m}</option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-2 flex gap-3 justify-end">
                  <button type="button" onClick={() => setShowBudgetForm(false)} className="px-4 py-2 rounded-xl bg-gray-100 dark:bg-slate-700 text-sm font-medium">Abbrechen</button>
                  <button type="submit" className="btn-primary">Speichern</button>
                </div>
              </form>
            </div>
          )}

          <div className="space-y-4">
            {budgets.map(budget => (
              <div key={budget.id} className="card p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">
                      {budget.Category ? `${budget.Category.icon} ${budget.Category.nameDE || budget.Category.name}` : '🏠 Gesamthaushalt'}
                    </h3>
                    <p className="text-sm text-gray-500">Limit: {fmt(parseFloat(budget.limitAmount))}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {budget.isWarning && <AlertTriangle className="text-orange-500" size={18} />}
                    <span className={`text-lg font-bold ${budget.isOver ? 'text-red-500' : budget.isWarning ? 'text-orange-500' : 'text-gray-900 dark:text-white'}`}>
                      {budget.percentage}%
                    </span>
                    <button onClick={() => { budgetAPI.delete(budget.id).then(() => { toast.success('Gelöscht'); loadBudgets(); }); }} className="text-gray-400 hover:text-red-500">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400 mb-2">
                  <span>Ausgegeben: {fmt(budget.spent || 0)}</span>
                  <span>Noch frei: {fmt((budget.limitAmount - (budget.spent || 0)))}</span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-slate-600 rounded-full h-3">
                  <div className={`h-3 rounded-full transition-all ${budget.isOver ? 'bg-red-500' : budget.isWarning ? 'bg-orange-500' : 'bg-[var(--primary)]'}`}
                    style={{ width: `${Math.min(budget.percentage, 100)}%` }} />
                </div>
                {budget.isOver && <p className="text-red-500 text-sm mt-2">⚠️ Budget überschritten!</p>}
                {budget.isWarning && !budget.isOver && <p className="text-orange-500 text-sm mt-2">⚠️ Über {budget.warningAt}% des Budgets verbraucht</p>}
              </div>
            ))}
            {budgets.length === 0 && (
              <div className="text-center py-12 text-gray-400">
                <div className="text-5xl mb-4">💰</div>
                <p>Noch keine Budgets gesetzt</p>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Sparziele ── */}
      {tab === 'goals' && (
        <>
          <button className="btn-primary flex items-center gap-2" onClick={() => setShowGoalForm(true)}>
            <Plus size={18} /> Neues Sparziel
          </button>

          {showGoalForm && (
            <div className="card p-6">
              <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Sparziel erstellen</h2>
              <form onSubmit={handleSaveGoal} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name *</label>
                  <input className="input" value={goalForm.name} onChange={e => setGoalForm(f => ({ ...f, name: e.target.value }))} placeholder="z.B. Urlaub Mallorca" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Zielbetrag (€) *</label>
                  <input type="number" step="0.01" className="input" value={goalForm.targetAmount}
                    onChange={e => setGoalForm(f => ({ ...f, targetAmount: e.target.value }))} required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Bereits gespart (€)</label>
                  <input type="number" step="0.01" className="input" value={goalForm.savedAmount}
                    onChange={e => setGoalForm(f => ({ ...f, savedAmount: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Zieldatum (optional)</label>
                  <input type="date" className="input" value={goalForm.targetDate}
                    onChange={e => setGoalForm(f => ({ ...f, targetDate: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Icon</label>
                  <div className="flex flex-wrap gap-2">
                    {GOAL_ICONS.map(icon => (
                      <button key={icon} type="button" onClick={() => setGoalForm(f => ({ ...f, icon }))}
                        className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center ${goalForm.icon === icon ? 'bg-[var(--primary)] text-white' : 'bg-gray-100 dark:bg-slate-700'}`}>
                        {icon}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="md:col-span-2 flex gap-3 justify-end">
                  <button type="button" onClick={() => setShowGoalForm(false)} className="px-4 py-2 rounded-xl bg-gray-100 dark:bg-slate-700 text-sm font-medium">Abbrechen</button>
                  <button type="submit" className="btn-primary">Erstellen</button>
                </div>
              </form>
            </div>
          )}

          <div className="space-y-4">
            {goals.map(goal => {
              const pct = goal.targetAmount > 0 ? Math.min((goal.savedAmount / goal.targetAmount) * 100, 100) : 0;
              const remaining = goal.targetAmount - goal.savedAmount;
              return (
                <div key={goal.id} className={`card p-5 ${goal.isCompleted ? 'border-2 border-green-400' : ''}`}>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">{goal.icon}</span>
                      <div>
                        <h3 className="font-semibold text-gray-900 dark:text-white">{goal.name}</h3>
                        {goal.targetDate && (
                          <p className="text-xs text-gray-500">Zieldatum: {new Date(goal.targetDate).toLocaleDateString('de-DE')}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {goal.isCompleted && <span className="text-green-500 text-sm font-medium">✅ Erreicht!</span>}
                      <button onClick={() => savingsGoalAPI.delete(goal.id).then(() => { toast.success('Gelöscht'); loadGoals(); })}
                        className="text-gray-400 hover:text-red-500"><Trash2 size={16} /></button>
                    </div>
                  </div>

                  <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400 mb-2">
                    <span className="flex items-center gap-1"><PiggyBank size={14} /> {fmt(goal.savedAmount)} gespart</span>
                    <span>Ziel: {fmt(goal.targetAmount)}</span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-slate-600 rounded-full h-3 mb-2">
                    <div className="h-3 rounded-full transition-all" style={{ width: `${pct}%`, background: goal.isCompleted ? '#22c55e' : 'var(--primary)' }} />
                  </div>
                  <div className="flex justify-between items-center text-xs text-gray-500">
                    <span>{pct.toFixed(1)}% erreicht</span>
                    {!goal.isCompleted && <span>Noch {fmt(remaining)} fehlend</span>}
                  </div>

                  {!goal.isCompleted && (
                    <div className="mt-3">
                      {depositGoalId === goal.id ? (
                        <div className="flex gap-2 mt-2">
                          <input type="number" step="0.01" className="input flex-1" placeholder="Betrag" value={depositAmount}
                            onChange={e => setDepositAmount(e.target.value)} autoFocus />
                          <button onClick={() => handleDeposit(goal.id)} className="btn-primary text-sm px-3">Einzahlen</button>
                          <button onClick={() => { setDepositGoalId(null); setDepositAmount(''); }}
                            className="px-3 py-2 rounded-xl bg-gray-100 dark:bg-slate-700 text-sm">✕</button>
                        </div>
                      ) : (
                        <button onClick={() => { setDepositGoalId(goal.id); setDepositAmount(''); }}
                          className="mt-2 px-4 py-2 rounded-xl bg-[var(--primary-light,#fce4ec)] text-[var(--primary)] text-sm font-medium hover:opacity-90 transition-opacity">
                          + Einzahlen
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {goals.length === 0 && (
              <div className="text-center py-12 text-gray-400">
                <div className="text-5xl mb-4">🎯</div>
                <p>Noch keine Sparziele erstellt</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
