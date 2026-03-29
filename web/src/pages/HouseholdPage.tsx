import React, { useState, useEffect } from 'react';
import { Plus, UserMinus, Copy } from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { useAuthStore } from '../store/authStore';
import { householdAPI } from '../services/api';

export default function HouseholdPage() {
  const { currentHousehold, user, setCurrentHousehold, households, setHouseholds } = useAuthStore();
  const [members, setMembers] = useState<any[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', description: '', currency: 'EUR', monthlyBudget: '', budgetWarningAt: '80' });

  useEffect(() => {
    if (currentHousehold) {
      householdAPI.getMembers(currentHousehold.id).then(({ data }) => setMembers(data.members));
    }
  }, [currentHousehold]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { data } = await householdAPI.create({ ...form, monthlyBudget: form.monthlyBudget ? parseFloat(form.monthlyBudget) : null });
      const { data: hd } = await householdAPI.getAll();
      setHouseholds(hd.households);
      setCurrentHousehold(hd.households.find((h: any) => h.id === data.household.id) || data.household);
      setShowCreateForm(false);
      toast.success('Haushalt erstellt!');
    } catch { toast.error('Fehler beim Erstellen'); }
  };

  const handleInvite = async () => {
    if (!currentHousehold) return;
    try {
      const { data } = await householdAPI.createInvite(currentHousehold.id, { role: 'member', expiresIn: 24 * 7, maxUses: 10 });
      setInviteLink(data.inviteLink);
      navigator.clipboard?.writeText(data.invite.code);
      toast.success(`Einladungscode: ${data.invite.code} (kopiert!)`);
    } catch { toast.error('Fehler'); }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!currentHousehold || !confirm('Mitglied entfernen?')) return;
    try {
      await householdAPI.removeMember(currentHousehold.id, userId);
      setMembers(prev => prev.filter(m => m.userId !== userId));
      toast.success('Entfernt');
    } catch { toast.error('Fehler'); }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Haushalt verwalten</h1>
        <button className="btn-primary flex items-center gap-2" onClick={() => setShowCreateForm(true)}>
          <Plus size={18} /> Neuer Haushalt
        </button>
      </div>

      {/* Household Selector */}
      {households.length > 1 && (
        <div className="card p-4">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Aktiver Haushalt</p>
          <div className="flex gap-2 flex-wrap">
            {households.map(h => (
              <button key={h.id} onClick={() => setCurrentHousehold(h)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${currentHousehold?.id === h.id ? 'bg-[var(--primary)] text-white' : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300'}`}>
                🏠 {h.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {showCreateForm && (
        <div className="card p-6">
          <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Neuen Haushalt erstellen</h2>
          <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name *</label>
              <input type="text" className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Monatliches Budget (€)</label>
              <input type="number" step="0.01" className="input" value={form.monthlyBudget}
                onChange={e => setForm(f => ({ ...f, monthlyBudget: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Warnung bei (%)</label>
              <input type="number" min="1" max="100" className="input" value={form.budgetWarningAt}
                onChange={e => setForm(f => ({ ...f, budgetWarningAt: e.target.value }))} />
            </div>
            <div className="md:col-span-2 flex gap-3 justify-end">
              <button type="button" onClick={() => setShowCreateForm(false)} className="px-4 py-2 rounded-xl bg-gray-100 dark:bg-slate-700 text-sm">Abbrechen</button>
              <button type="submit" className="btn-primary">Erstellen</button>
            </div>
          </form>
        </div>
      )}

      {currentHousehold && (
        <>
          {/* Household Info */}
          <div className="card p-6">
            <h2 className="font-semibold text-gray-900 dark:text-white mb-3">🏠 {currentHousehold.name}</h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-gray-500">Währung:</span> <span className="font-medium">{currentHousehold.currency}</span></div>
              {currentHousehold.monthlyBudget && (
                <div><span className="text-gray-500">Monatsbudget:</span> <span className="font-medium">{currentHousehold.monthlyBudget} €</span></div>
              )}
            </div>
          </div>

          {/* Members */}
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900 dark:text-white">Mitglieder ({members.length})</h2>
              <button onClick={handleInvite} className="btn-primary flex items-center gap-2 text-sm">
                <Plus size={16} /> Einladen
              </button>
            </div>
            {inviteLink && (
              <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 rounded-xl flex items-center gap-2">
                <span className="text-sm text-green-700 dark:text-green-300 truncate">{inviteLink}</span>
                <button onClick={() => { navigator.clipboard?.writeText(inviteLink); toast.success('Kopiert!'); }}>
                  <Copy size={14} className="text-green-600" />
                </button>
              </div>
            )}
            <div className="space-y-3">
              {members.map(m => (
                <div key={m.id} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-slate-700 last:border-0">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-[var(--primary)] flex items-center justify-center text-white font-bold text-sm">
                      {m.User?.name?.charAt(0)}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white text-sm">{m.User?.name}</p>
                      <p className="text-xs text-gray-500">{m.User?.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${m.role === 'admin' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                      {m.role}
                    </span>
                    {m.userId !== user?.id && (
                      <button onClick={() => handleRemoveMember(m.userId)} className="text-gray-400 hover:text-red-500">
                        <UserMinus size={16} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
