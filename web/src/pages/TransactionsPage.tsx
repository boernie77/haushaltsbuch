import React, { useState, useEffect, useRef } from 'react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { Plus, Search, Trash2, Edit, Upload, Filter } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/authStore';
import { transactionAPI, categoryAPI, ocrAPI, paperlessAPI } from '../services/api';

export default function TransactionsPage() {
  const { currentHousehold } = useAuthStore();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const now = new Date();

  const [form, setForm] = useState({
    amount: '', description: '', merchant: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    type: 'expense', categoryId: '',
    receiptFile: null as File | null,
  });

  const load = async () => {
    if (!currentHousehold) return;
    try {
      const { data } = await transactionAPI.getAll({
        householdId: currentHousehold.id,
        month: now.getMonth() + 1, year: now.getFullYear(),
        type: typeFilter !== 'all' ? typeFilter : undefined,
        search: search || undefined
      });
      setTransactions(data.transactions);
    } finally { setLoading(false); }
  };

  useEffect(() => {
    load();
    if (currentHousehold) {
      categoryAPI.getAll(currentHousehold.id).then(({ data }) => setCategories(data.categories));
    }
  }, [currentHousehold, typeFilter]);

  const handleSearch = (e: React.FormEvent) => { e.preventDefault(); load(); };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setForm(f => ({ ...f, receiptFile: file }));
    setOcrLoading(true);
    try {
      const fd = new FormData();
      fd.append('receipt', file);
      const { data } = await ocrAPI.analyze(URL.createObjectURL(file));
      const r = data.result;
      setForm(f => ({
        ...f,
        amount: r.amount?.toString() || f.amount,
        merchant: r.merchant || f.merchant,
        description: r.description || f.description,
        date: r.date || f.date,
        categoryId: r.categoryId || f.categoryId,
      }));
      toast.success(`✅ KI erkannte: ${r.confidence}% Sicherheit`);
    } catch { toast.error('OCR fehlgeschlagen – bitte manuell eingeben'); }
    finally { setOcrLoading(false); }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.amount || !currentHousehold) return;
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => {
        if (k === 'receiptFile' && v) fd.append('receipt', v as File);
        else if (k !== 'receiptFile' && v) fd.append(k, v as string);
      });
      fd.append('householdId', currentHousehold.id);
      const { data } = await transactionAPI.create(fd);
      if (data.budgetWarning) toast.error(`⚠️ Budget zu ${data.budgetWarning[0].percentage}% ausgeschöpft!`, { duration: 6000 });
      toast.success('Gespeichert');
      setShowForm(false);
      setForm({ amount: '', description: '', merchant: '', date: format(new Date(), 'yyyy-MM-dd'), type: 'expense', categoryId: '', receiptFile: null });
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Fehler beim Speichern');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Buchung löschen?')) return;
    try { await transactionAPI.delete(id); toast.success('Gelöscht'); load(); }
    catch { toast.error('Fehler beim Löschen'); }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Buchungen</h1>
        <button className="btn-primary flex items-center gap-2" onClick={() => setShowForm(true)}>
          <Plus size={18} /> Neue Buchung
        </button>
      </div>

      {/* Filters */}
      <div className="card p-4 flex flex-wrap gap-3">
        <form onSubmit={handleSearch} className="flex gap-2 flex-1 min-w-48">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input
              className="input pl-9"
              placeholder="Suchen..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <button type="submit" className="btn-primary px-3">Suchen</button>
        </form>
        <div className="flex gap-2">
          {['all', 'expense', 'income'].map(f => (
            <button
              key={f}
              onClick={() => setTypeFilter(f)}
              className={`px-3 py-2 rounded-xl text-sm font-medium transition-all ${typeFilter === f ? 'bg-[var(--primary)] text-white' : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300'}`}
            >
              {f === 'all' ? 'Alle' : f === 'expense' ? '💸 Ausgaben' : '💰 Einnahmen'}
            </button>
          ))}
        </div>
      </div>

      {/* Add Form */}
      {showForm && (
        <div className="card p-6">
          <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Neue Buchung</h2>
          <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2 flex gap-2">
              {['expense', 'income'].map(t => (
                <button key={t} type="button"
                  onClick={() => setForm(f => ({ ...f, type: t }))}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${form.type === t ? 'bg-[var(--primary)] text-white' : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300'}`}>
                  {t === 'expense' ? '💸 Ausgabe' : '💰 Einnahme'}
                </button>
              ))}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Betrag (€) *</label>
              <input type="number" step="0.01" className="input" value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Datum</label>
              <input type="date" className="input" value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Beschreibung</label>
              <input type="text" className="input" value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Händler</label>
              <input type="text" className="input" value={form.merchant}
                onChange={e => setForm(f => ({ ...f, merchant: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Kategorie</label>
              <select className="input" value={form.categoryId}
                onChange={e => setForm(f => ({ ...f, categoryId: e.target.value }))}>
                <option value="">-- Wählen --</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.nameDE || c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Quittung {ocrLoading && <span className="text-[var(--primary)] animate-pulse">KI analysiert...</span>}
              </label>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
              <button type="button" onClick={() => fileInputRef.current?.click()}
                className="w-full border-2 border-dashed border-gray-300 dark:border-slate-600 rounded-xl py-3 text-sm text-gray-500 hover:border-[var(--primary)] hover:text-[var(--primary)] transition-all">
                📷 Quittung hochladen / fotografieren
                {form.receiptFile && <span className="block text-xs mt-1 text-green-600">✓ {form.receiptFile.name}</span>}
              </button>
            </div>
            <div className="md:col-span-2 flex gap-3 justify-end">
              <button type="button" onClick={() => setShowForm(false)}
                className="px-4 py-2 rounded-xl bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 text-sm font-medium">
                Abbrechen
              </button>
              <button type="submit" className="btn-primary">Speichern</button>
            </div>
          </form>
        </div>
      )}

      {/* Transaction List */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center p-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--primary)]" />
          </div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <div className="text-5xl mb-4">📭</div>
            <p>Keine Buchungen gefunden</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-slate-700">
              <tr>
                {['Datum', 'Kategorie', 'Beschreibung', 'Betrag', ''].map(h => (
                  <th key={h} className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
              {transactions.map(t => (
                <tr key={t.id} className="hover:bg-pink-50/50 dark:hover:bg-slate-700/50 transition-colors">
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                    {format(new Date(t.date), 'dd.MM.yyyy')}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-2 text-sm">
                      <span className="text-base">{t.Category?.icon || '📦'}</span>
                      <span className="text-gray-700 dark:text-gray-300">{t.Category?.nameDE || t.Category?.name || '—'}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 max-w-48 truncate">
                    {t.description || t.merchant || '—'}
                  </td>
                  <td className={`px-4 py-3 text-sm font-bold ${t.type === 'income' ? 'text-green-600' : 'text-[var(--expense)]'}`}>
                    {t.type === 'income' ? '+' : '-'}{parseFloat(t.amount).toFixed(2)} €
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => handleDelete(t.id)}
                      className="text-gray-400 hover:text-red-500 transition-colors">
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
