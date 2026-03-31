import React, { useState, useEffect, useRef } from 'react';
import { format } from 'date-fns';
import { Plus, Search, Trash2, FileText, Tag, X, Receipt, ZoomIn, RefreshCw, Repeat, Pencil, ArrowRightLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/authStore';
import { transactionAPI, categoryAPI, ocrAPI, paperlessAPI, recurringAPI, householdAPI } from '../services/api';

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
    isRecurring: false,
    recurringInterval: 'monthly',
    targetHouseholdId: '',
  });
  const [splits, setSplits] = useState<{ categoryId: string; amount: string; description: string }[]>([]);
  const [duplicates, setDuplicates] = useState<any[]>([]);
  const [dupChecked, setDupChecked] = useState(false);
  const [allHouseholds, setAllHouseholds] = useState<any[]>([]);

  // Paperless Upload Dialog
  const [paperlessDialog, setPaperlessDialog] = useState<{ transactionId: string; title: string } | null>(null);
  const [paperlessData, setPaperlessData] = useState<any>(null);
  const [paperlessForm, setPaperlessForm] = useState({ documentTypeId: '', correspondentId: '', tagIds: [] as string[], title: '', ownerPaperlessUserId: '', viewPaperlessUserIds: [] as string[] });
  const [uploading, setUploading] = useState(false);
  const [receiptModal, setReceiptModal] = useState<string | null>(null);

  const [recurring, setRecurring] = useState<any[]>([]);
  const [moveDialog, setMoveDialog] = useState<{ id: string; description: string } | null>(null);
  const [moveTargetId, setMoveTargetId] = useState('');

  const [paperlessUsers, setPaperlessUsers] = useState<any[]>([]);

  const API_BASE = (import.meta.env.VITE_API_URL || '/api').replace('/api', '');

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
      paperlessAPI.getData(currentHousehold.id).then(({ data }) => {
        setPaperlessData(data);
        setPaperlessUsers((data.users || []).filter((u: any) => u.isEnabled));
      }).catch(() => {});
      recurringAPI.getAll(currentHousehold.id).then(({ data }) => setRecurring(data.recurring || [])).catch(() => {});
      householdAPI.getAll().then(({ data }) => setAllHouseholds(data.households || [])).catch(() => {});
    }
  }, [currentHousehold, typeFilter]);

  const handleSearch = (e: React.FormEvent) => { e.preventDefault(); load(); };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setForm(f => ({ ...f, receiptFile: file }));
    setOcrLoading(true);
    try {
      const { data } = await ocrAPI.analyze(file);
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

  const checkDuplicates = async () => {
    if (!form.amount || !form.date || !currentHousehold) return;
    try {
      const { data } = await transactionAPI.duplicateCheck({
        householdId: currentHousehold.id,
        amount: form.amount,
        date: form.date,
        description: form.description,
        merchant: form.merchant,
      });
      setDuplicates(data.duplicates || []);
      setDupChecked(true);
    } catch {}
  };

  const resetForm = () => {
    setForm({ amount: '', description: '', merchant: '', date: format(new Date(), 'yyyy-MM-dd'), type: 'expense', categoryId: '', receiptFile: null, isRecurring: false, recurringInterval: 'monthly', targetHouseholdId: '' });
    setSplits([]);
    setDuplicates([]);
    setDupChecked(false);
  };

  const openEdit = (t: any) => {
    setForm({
      amount: parseFloat(t.amount).toFixed(2),
      description: t.description || '',
      merchant: t.merchant || '',
      date: format(new Date(t.date), 'yyyy-MM-dd'),
      type: t.type,
      categoryId: t.categoryId || '',
      receiptFile: null,
      isRecurring: t.isRecurring || false,
      recurringInterval: t.recurringInterval || 'monthly',
      targetHouseholdId: t.targetHouseholdId || '',
    });
    setEditingId(t.id);
    setShowForm(true);
    setDuplicates([]);
    setDupChecked(false);
    setSplits([]);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.amount || !currentHousehold) return;
    try {
      if (editingId) {
        // Update existing
        await transactionAPI.update(editingId, {
          amount: parseFloat(form.amount),
          description: form.description,
          merchant: form.merchant,
          date: form.date,
          type: form.type,
          categoryId: form.categoryId || null,
          tags: [],
          isRecurring: form.isRecurring,
          recurringInterval: form.isRecurring ? form.recurringInterval : null,
        });
        toast.success('Buchung aktualisiert');
      } else {
        // Create new
        const fd = new FormData();
        Object.entries(form).forEach(([k, v]) => {
          if (k === 'receiptFile' && v) fd.append('receipt', v as File);
          else if (!['receiptFile', 'isRecurring', 'recurringInterval', 'targetHouseholdId'].includes(k) && v) fd.append(k, v as string);
        });
        if (form.isRecurring) {
          fd.append('isRecurring', 'true');
          fd.append('recurringInterval', form.recurringInterval);
        }
        if (form.type === 'transfer' && form.targetHouseholdId) fd.append('targetHouseholdId', form.targetHouseholdId);
        if (splits.length > 0) fd.append('splits', JSON.stringify(splits.map(s => ({ ...s, amount: parseFloat(s.amount) }))));
        fd.append('householdId', currentHousehold.id);
        const { data } = await transactionAPI.create(fd);
        if (data.budgetWarning) toast.error(`⚠️ Budget zu ${data.budgetWarning[0].percentage}% ausgeschöpft!`, { duration: 6000 });
        toast.success('Gespeichert');
      }
      setShowForm(false);
      setEditingId(null);
      resetForm();
      load();
      recurringAPI.getAll(currentHousehold.id).then(({data}) => setRecurring(data.recurring || []));
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Fehler beim Speichern');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Buchung löschen?')) return;
    try { await transactionAPI.delete(id); toast.success('Gelöscht'); load(); }
    catch { toast.error('Fehler beim Löschen'); }
  };

  const handleMove = async () => {
    if (!moveDialog || !moveTargetId) return;
    try {
      const { data } = await transactionAPI.move(moveDialog.id, moveTargetId);
      if (data.warning) toast(data.warning, { icon: '⚠️', duration: 5000 });
      else toast.success('Buchung verschoben');
      setMoveDialog(null);
      setMoveTargetId('');
      load();
    } catch { toast.error('Fehler beim Verschieben'); }
  };

  const openPaperlessDialog = (t: any) => {
    setPaperlessForm({ documentTypeId: '', correspondentId: '', tagIds: [], title: t.description || t.merchant || '', ownerPaperlessUserId: '', viewPaperlessUserIds: [] });
    setPaperlessDialog({ transactionId: t.id, title: t.description || t.merchant || 'Quittung' });
  };

  const handlePaperlessUpload = async () => {
    if (!paperlessDialog) return;
    setUploading(true);
    try {
      await paperlessAPI.upload({
        transactionId: paperlessDialog.transactionId,
        documentTypeId: paperlessForm.documentTypeId || undefined,
        correspondentId: paperlessForm.correspondentId || undefined,
        tagIds: paperlessForm.tagIds.length ? JSON.stringify(paperlessForm.tagIds) : undefined,
        title: paperlessForm.title || undefined,
        ownerPaperlessUserId: paperlessForm.ownerPaperlessUserId || undefined,
        viewPaperlessUserIds: paperlessForm.viewPaperlessUserIds?.length ? JSON.stringify(paperlessForm.viewPaperlessUserIds) : undefined,
      });
      toast.success('Zu Paperless hochgeladen!');
      setPaperlessDialog(null);
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Upload fehlgeschlagen');
    } finally { setUploading(false); }
  };

  const favDocTypes = paperlessData?.documentTypes?.filter((x: any) => x.isFavorite) || [];
  const favCorrespondents = paperlessData?.correspondents?.filter((x: any) => x.isFavorite) || [];
  const favTags = paperlessData?.tags?.filter((x: any) => x.isFavorite) || [];
  const hasPaperless = favDocTypes.length > 0 || favCorrespondents.length > 0 || favTags.length > 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Buchungen</h1>
        <button className="btn-primary flex items-center gap-2" onClick={() => { setEditingId(null); resetForm(); setShowForm(true); }}>
          <Plus size={18} /> Neue Buchung
        </button>
      </div>

      {/* Filters */}
      <div className="card p-4 flex flex-wrap gap-3">
        <form onSubmit={handleSearch} className="flex gap-2 flex-1">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input className="input w-full" style={{ paddingLeft: '2.25rem' }} placeholder="Suchen..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <button type="submit" className="btn-primary px-3 shrink-0">Suchen</button>
        </form>
        <div className="flex gap-2">
          {['all', 'expense', 'income', 'recurring'].map(f => (
            <button key={f} onClick={() => setTypeFilter(f)}
              className={`px-3 py-2 rounded-xl text-sm font-medium transition-all ${typeFilter === f ? 'bg-[var(--primary)] text-white' : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300'}`}>
              {f === 'all' ? 'Alle' : f === 'expense' ? '💸 Ausgaben' : f === 'income' ? '💰 Einnahmen' : '🔄 Wiederkehrend'}
            </button>
          ))}
        </div>
      </div>

      {/* Add Form */}
      {showForm && (
        <div className="card p-6">
          <h2 className="font-semibold text-gray-900 dark:text-white mb-4">{editingId ? 'Buchung bearbeiten' : 'Neue Buchung'}</h2>
          <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2 flex gap-2">
              {[['expense', '💸 Ausgabe'], ['income', '💰 Einnahme'], ['transfer', '🔄 Umbuchung']].map(([t, label]) => (
                <button key={t} type="button" onClick={() => setForm(f => ({ ...f, type: t }))}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${form.type === t ? 'bg-[var(--primary)] text-white' : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300'}`}>
                  {label}
                </button>
              ))}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Betrag (€) *</label>
              <input type="number" step="0.01" className="input" value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} onBlur={checkDuplicates} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Datum</label>
              <input type="date" className="input" value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))} onBlur={checkDuplicates} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Beschreibung</label>
              <input type="text" className="input" value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))} onBlur={checkDuplicates} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Händler</label>
              <input type="text" className="input" value={form.merchant}
                onChange={e => setForm(f => ({ ...f, merchant: e.target.value }))} />
            </div>
            {form.type !== 'transfer' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Kategorie</label>
                <select className="input" value={form.categoryId} onChange={e => setForm(f => ({ ...f, categoryId: e.target.value }))}>
                  <option value="">-- Wählen --</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.nameDE || c.name}</option>)}
                </select>
              </div>
            )}
            {form.type === 'transfer' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Ziel-Haushalt</label>
                <select className="input" value={form.targetHouseholdId} onChange={e => setForm(f => ({ ...f, targetHouseholdId: e.target.value }))}>
                  <option value="">-- Wählen --</option>
                  {allHouseholds.filter(h => h.id !== currentHousehold?.id).map(h => (
                    <option key={h.id} value={h.id}>{h.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Duplikat-Warnung */}
            {dupChecked && duplicates.length > 0 && (
              <div className="md:col-span-2 bg-orange-50 dark:bg-orange-900/20 border border-orange-300 dark:border-orange-700 rounded-xl p-3">
                <p className="text-orange-700 dark:text-orange-300 text-sm font-medium mb-2">⚠️ Mögliche Duplikate gefunden:</p>
                {duplicates.map(d => (
                  <p key={d.id} className="text-xs text-orange-600 dark:text-orange-400">
                    {format(new Date(d.date), 'dd.MM.yyyy')} · {d.description || d.merchant || '—'} · {parseFloat(d.amount).toFixed(2)} €
                  </p>
                ))}
              </div>
            )}

            {/* Split-Buchungen */}
            {form.type === 'expense' && (
              <div className="md:col-span-2">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Aufteilen auf Kategorien (optional)</label>
                  <button type="button" onClick={() => setSplits(s => [...s, { categoryId: '', amount: '', description: '' }])}
                    className="text-xs text-[var(--primary)] hover:underline">+ Zeile hinzufügen</button>
                </div>
                {splits.map((split, i) => (
                  <div key={i} className="flex gap-2 mb-2">
                    <select className="input flex-1 text-sm" value={split.categoryId} onChange={e => setSplits(s => s.map((x, j) => j === i ? { ...x, categoryId: e.target.value } : x))}>
                      <option value="">Kategorie</option>
                      {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.nameDE || c.name}</option>)}
                    </select>
                    <input type="number" step="0.01" className="input w-24 text-sm" placeholder="Betrag" value={split.amount}
                      onChange={e => setSplits(s => s.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))} />
                    <input type="text" className="input flex-1 text-sm" placeholder="Notiz" value={split.description}
                      onChange={e => setSplits(s => s.map((x, j) => j === i ? { ...x, description: e.target.value } : x))} />
                    <button type="button" onClick={() => setSplits(s => s.filter((_, j) => j !== i))}
                      className="text-gray-400 hover:text-red-500 px-1">✕</button>
                  </div>
                ))}
              </div>
            )}
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
            {/* Wiederkehrende Buchung */}
            <div className="md:col-span-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.isRecurring}
                  onChange={e => setForm(f => ({ ...f, isRecurring: e.target.checked }))}
                  className="rounded" />
                <Repeat size={15} className="text-[var(--primary)]" />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Wiederkehrende Buchung</span>
              </label>
              {form.isRecurring && (
                <div className="mt-2 flex gap-2">
                  {['weekly', 'monthly', 'yearly'].map(iv => (
                    <button key={iv} type="button"
                      onClick={() => setForm(f => ({ ...f, recurringInterval: iv }))}
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${form.recurringInterval === iv ? 'bg-[var(--primary)] text-white' : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300'}`}>
                      {iv === 'weekly' ? 'Wöchentlich' : iv === 'monthly' ? 'Monatlich' : 'Jährlich'}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="md:col-span-2 flex gap-3 justify-end">
              <button type="button" onClick={() => { setShowForm(false); setEditingId(null); resetForm(); }}
                className="px-4 py-2 rounded-xl bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 text-sm font-medium">
                Abbrechen
              </button>
              <button type="submit" className="btn-primary">{editingId ? 'Aktualisieren' : 'Speichern'}</button>
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
        ) : typeFilter === 'recurring' ? (
          recurring.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <div className="text-5xl mb-4">🔄</div>
              <p>Keine wiederkehrenden Buchungen</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-slate-700">
                <tr>
                  {['Kategorie', 'Beschreibung', 'Betrag', 'Intervall', 'Nächste Buchung', ''].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                {recurring.map(r => (
                  <tr key={r.id} className="hover:bg-pink-50/50 dark:hover:bg-slate-700/50 transition-colors">
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-2 text-sm">
                        <span className="text-base">{r.Category?.icon || '📦'}</span>
                        <span className="text-gray-700 dark:text-gray-300">{r.Category?.nameDE || r.Category?.name || '—'}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 max-w-40 truncate">{r.description || r.merchant || '—'}</td>
                    <td className={`px-4 py-3 text-sm font-bold ${r.type === 'income' ? 'text-green-600' : 'text-[var(--expense)]'}`}>
                      {r.type === 'income' ? '+' : '-'}{parseFloat(r.amount).toFixed(2)} €
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {r.recurringInterval === 'weekly' ? 'Wöchentlich' : r.recurringInterval === 'monthly' ? 'Monatlich' : 'Jährlich'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {r.recurringNextDate ? format(new Date(r.recurringNextDate), 'dd.MM.yyyy') : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button onClick={() => openEdit(r)} className="text-gray-400 hover:text-[var(--primary)] transition-colors" title="Bearbeiten">
                          <Pencil size={15} />
                        </button>
                        <button onClick={async () => {
                          if (!confirm('Wiederkehrende Buchung beenden?')) return;
                          await recurringAPI.stop(r.id);
                          setRecurring(prev => prev.filter(x => x.id !== r.id));
                        }} className="text-gray-400 hover:text-red-500 transition-colors" title="Beenden">
                          <X size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : transactions.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <div className="text-5xl mb-4">📭</div>
            <p>Keine Buchungen gefunden</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-slate-700">
              <tr>
                {['Datum', 'Kategorie', 'Beschreibung', 'Händler', 'Betrag', ''].map(h => (
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
                  <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 max-w-40 truncate">{t.description || '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 max-w-32 truncate">{t.merchant || '—'}</td>
                  <td className={`px-4 py-3 text-sm font-bold ${t.type === 'income' ? 'text-green-600' : 'text-[var(--expense)]'}`}>
                    {t.type === 'income' ? '+' : '-'}{parseFloat(t.amount).toFixed(2)} €
                    {t.isRecurring && <span title="Wiederkehrend"><Repeat size={11} className="inline ml-1 opacity-40" /></span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => openEdit(t)} className="text-gray-400 hover:text-[var(--primary)] transition-colors" title="Bearbeiten">
                        <Pencil size={15} />
                      </button>
                      <button onClick={() => handleDelete(t.id)} className="text-gray-400 hover:text-red-500 transition-colors" title="Löschen">
                        <Trash2 size={16} />
                      </button>
                      {allHouseholds.length > 1 && (
                        <button onClick={() => { setMoveDialog({ id: t.id, description: t.description || t.merchant || 'Buchung' }); setMoveTargetId(''); }} className="text-gray-400 hover:text-blue-500 transition-colors" title="Verschieben">
                          <ArrowRightLeft size={16} />
                        </button>
                      )}
                      {t.receiptImage && (
                        <button onClick={() => setReceiptModal(API_BASE + t.receiptImage)} title="Quittung anzeigen" className="text-gray-400 hover:text-[var(--primary)] transition-colors">
                          <Receipt size={16} />
                        </button>
                      )}
                      {t.receiptImage && hasPaperless && (
                        <button onClick={() => openPaperlessDialog(t)} title={t.paperlessDocId ? 'Bereits in Paperless' : 'Zu Paperless hochladen'} className={`transition-colors ${t.paperlessDocId ? 'text-green-500' : 'text-gray-400 hover:text-[var(--primary)]'}`}>
                          <FileText size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Verschieben-Modal */}
      {moveDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setMoveDialog(null)}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Buchung verschieben</h3>
            <p className="text-sm text-gray-500 mb-4">„{moveDialog.description}" in einen anderen Haushalt verschieben:</p>
            <select className="input w-full mb-4" value={moveTargetId} onChange={e => setMoveTargetId(e.target.value)}>
              <option value="">— Haushalt wählen —</option>
              {allHouseholds.filter(h => h.id !== currentHousehold?.id).map(h => (
                <option key={h.id} value={h.id}>{h.name}</option>
              ))}
            </select>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setMoveDialog(null)} className="px-4 py-2 rounded-xl bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 text-sm font-medium">
                Abbrechen
              </button>
              <button onClick={handleMove} disabled={!moveTargetId} className="btn-primary disabled:opacity-50">
                Verschieben
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quittungs-Vollbild-Modal */}
      {receiptModal && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4"
          onClick={() => setReceiptModal(null)}>
          <div className="relative max-w-3xl max-h-full" onClick={e => e.stopPropagation()}>
            <button onClick={() => setReceiptModal(null)}
              className="absolute -top-10 right-0 text-white/70 hover:text-white flex items-center gap-1 text-sm">
              <X size={18} /> Schließen
            </button>
            <img src={receiptModal} alt="Quittung"
              className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl" />
            <a href={receiptModal} target="_blank" rel="noopener noreferrer"
              className="absolute bottom-3 right-3 bg-black/50 text-white text-xs px-3 py-1.5 rounded-full flex items-center gap-1 hover:bg-black/70">
              <ZoomIn size={12} /> Original öffnen
            </a>
          </div>
        </div>
      )}

      {/* Paperless Upload Dialog */}
      {paperlessDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <FileText size={18} className="text-[var(--primary)]" /> Zu Paperless hochladen
              </h2>
              <button onClick={() => setPaperlessDialog(null)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Titel</label>
                <input type="text" className="input" value={paperlessForm.title}
                  onChange={e => setPaperlessForm(f => ({ ...f, title: e.target.value }))} />
              </div>

              {favDocTypes.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Dokumententyp</label>
                  <select className="input" value={paperlessForm.documentTypeId}
                    onChange={e => setPaperlessForm(f => ({ ...f, documentTypeId: e.target.value }))}>
                    <option value="">— keiner —</option>
                    {favDocTypes.map((dt: any) => <option key={dt.id} value={dt.id}>{dt.name}</option>)}
                  </select>
                </div>
              )}

              {favCorrespondents.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Korrespondent</label>
                  <select className="input" value={paperlessForm.correspondentId}
                    onChange={e => setPaperlessForm(f => ({ ...f, correspondentId: e.target.value }))}>
                    <option value="">— keiner —</option>
                    {favCorrespondents.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              )}

              {favTags.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Tags</label>
                  <div className="flex flex-wrap gap-2">
                    {favTags.map((tag: any) => {
                      const selected = paperlessForm.tagIds.includes(tag.id);
                      return (
                        <button key={tag.id} type="button"
                          onClick={() => setPaperlessForm(f => ({
                            ...f,
                            tagIds: selected ? f.tagIds.filter(id => id !== tag.id) : [...f.tagIds, tag.id]
                          }))}
                          className={`px-3 py-1 rounded-full text-xs font-medium text-white transition-all border-2 ${selected ? 'border-white scale-105' : 'border-transparent opacity-70'}`}
                          style={{ background: tag.color || '#9CA3AF' }}>
                          <Tag size={10} className="inline mr-1" />{tag.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {paperlessUsers.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Eigentümer in Paperless</label>
                  <select className="input" value={paperlessForm.ownerPaperlessUserId || ''}
                    onChange={e => setPaperlessForm((f: any) => ({ ...f, ownerPaperlessUserId: e.target.value }))}>
                    <option value="">— Standard —</option>
                    {paperlessUsers.map((u: any) => <option key={u.id} value={u.paperlessId}>{u.fullName || u.username}</option>)}
                  </select>
                </div>
              )}
              {paperlessUsers.length > 1 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Sichtbar für</label>
                  <div className="flex flex-wrap gap-2">
                    {paperlessUsers.map((u: any) => {
                      const selected = (paperlessForm.viewPaperlessUserIds || []).includes(String(u.paperlessId));
                      return (
                        <button key={u.id} type="button"
                          onClick={() => setPaperlessForm((f: any) => ({
                            ...f,
                            viewPaperlessUserIds: selected
                              ? (f.viewPaperlessUserIds || []).filter((id: string) => id !== String(u.paperlessId))
                              : [...(f.viewPaperlessUserIds || []), String(u.paperlessId)]
                          }))}
                          className={`px-3 py-1 rounded-full text-xs font-medium transition-all border-2 ${selected ? 'bg-[var(--primary)] text-white border-[var(--primary)]' : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 border-transparent'}`}>
                          {u.fullName || u.username}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3 justify-end mt-6">
              <button onClick={() => setPaperlessDialog(null)}
                className="px-4 py-2 rounded-xl bg-gray-100 dark:bg-slate-700 text-sm font-medium">
                Abbrechen
              </button>
              <button onClick={handlePaperlessUpload} disabled={uploading} className="btn-primary flex items-center gap-2 disabled:opacity-50">
                {uploading ? <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" /> : <FileText size={16} />}
                Hochladen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
