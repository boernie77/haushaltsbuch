import React, { useState, useEffect } from 'react';
import { Plus, Trash2, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/authStore';
import { budgetAPI, categoryAPI } from '../services/api';

export default function BudgetPage() {
  const { currentHousehold } = useAuthStore();
  const [budgets, setBudgets] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ categoryId: '', limitAmount: '', warningAt: '80', month: '', year: String(new Date().getFullYear()) });
  const now = new Date();

  const load = async () => {
    if (!currentHousehold) return;
    const { data } = await budgetAPI.getAll({ householdId: currentHousehold.id, month: now.getMonth() + 1, year: now.getFullYear() });
    setBudgets(data.budgets);
  };

  useEffect(() => {
    load();
    if (currentHousehold) {
      categoryAPI.getAll(currentHousehold.id).then(({ data }) => setCategories(data.categories));
    }
  }, [currentHousehold]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentHousehold) return;
    try {
      await budgetAPI.create({ ...form, householdId: currentHousehold.id, month: form.month || null });
      toast.success('Budget gesetzt');
      setShowForm(false);
      load();
    } catch { toast.error('Fehler'); }
  };

  const handleDelete = async (id: string) => {
    try { await budgetAPI.delete(id); toast.success('Gelöscht'); load(); }
    catch { toast.error('Fehler'); }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Budget verwalten</h1>
        <button className="btn-primary flex items-center gap-2" onClick={() => setShowForm(true)}>
          <Plus size={18} /> Neues Budget
        </button>
      </div>

      {showForm && (
        <div className="card p-6">
          <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Budget hinzufügen</h2>
          <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Kategorie (leer = Gesamtbudget)</label>
              <select className="input" value={form.categoryId} onChange={e => setForm(f => ({ ...f, categoryId: e.target.value }))}>
                <option value="">Gesamtes Haushaltbudget</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.nameDE || c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Limit (€) *</label>
              <input type="number" step="0.01" className="input" value={form.limitAmount}
                onChange={e => setForm(f => ({ ...f, limitAmount: e.target.value }))} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Warnung bei (%) </label>
              <input type="number" min="1" max="100" className="input" value={form.warningAt}
                onChange={e => setForm(f => ({ ...f, warningAt: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Gültig für Monat</label>
              <select className="input" value={form.month} onChange={e => setForm(f => ({ ...f, month: e.target.value }))}>
                <option value="">Ganzes Jahr (alle Monate)</option>
                {['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'].map((m, i) => (
                  <option key={i} value={String(i+1)}>{m}</option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2 flex gap-3 justify-end">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded-xl bg-gray-100 dark:bg-slate-700 text-sm font-medium">Abbrechen</button>
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
                <p className="text-sm text-gray-500">Limit: {parseFloat(budget.limitAmount).toFixed(2)} €</p>
              </div>
              <div className="flex items-center gap-3">
                {budget.isWarning && <AlertTriangle className="text-orange-500" size={18} />}
                <span className={`text-lg font-bold ${budget.isOver ? 'text-red-500' : budget.isWarning ? 'text-orange-500' : 'text-gray-900 dark:text-white'}`}>
                  {budget.percentage}%
                </span>
                <button onClick={() => handleDelete(budget.id)} className="text-gray-400 hover:text-red-500">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
            <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400 mb-2">
              <span>Ausgegeben: {budget.spent?.toFixed(2)} €</span>
              <span>Noch frei: {(budget.limitAmount - budget.spent).toFixed(2)} €</span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-slate-600 rounded-full h-3">
              <div
                className={`h-3 rounded-full transition-all ${budget.isOver ? 'bg-red-500' : budget.isWarning ? 'bg-orange-500' : 'bg-[var(--primary)]'}`}
                style={{ width: `${Math.min(budget.percentage, 100)}%` }}
              />
            </div>
            {budget.isOver && <p className="text-red-500 text-sm mt-2">⚠️ Budget überschritten!</p>}
            {budget.isWarning && !budget.isOver && (
              <p className="text-orange-500 text-sm mt-2">⚠️ Über {budget.warningAt}% des Budgets verbraucht</p>
            )}
          </div>
        ))}
        {budgets.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <div className="text-5xl mb-4">💰</div>
            <p>Noch keine Budgets gesetzt</p>
          </div>
        )}
      </div>
    </div>
  );
}
