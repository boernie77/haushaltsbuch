import React, { useState, useEffect, useRef } from 'react';
import { Plus, UserMinus, Copy, Bot, Eye, EyeOff, ExternalLink, Download, Upload, Database } from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { useAuthStore } from '../store/authStore';
import { householdAPI, backupAPI } from '../services/api';

export default function HouseholdPage() {
  const { currentHousehold, user, setCurrentHousehold, households, setHouseholds } = useAuthStore();
  const [members, setMembers] = useState<any[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', description: '', currency: 'EUR', monthlyBudget: '', budgetWarningAt: '80' });

  // Backup state
  const [exportFormat, setExportFormat] = useState<'json' | 'csv'>('json');
  const [importing, setImporting] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  const handleExport = async () => {
    if (!currentHousehold) return;
    try {
      const { data } = await backupAPI.export(currentHousehold.id, exportFormat);
      const date = new Date().toISOString().split('T')[0];
      const filename = `haushalt-export-${date}.${exportFormat}`;
      const url = URL.createObjectURL(new Blob([data], { type: exportFormat === 'csv' ? 'text/csv' : 'application/json' }));
      const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
      toast.success(`Export gestartet: ${filename}`);
    } catch { toast.error('Export fehlgeschlagen'); }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentHousehold) return;
    setImporting(true);
    try {
      const { data } = await backupAPI.import(currentHousehold.id, file);
      toast.success(`Import: ${data.imported} neu, ${data.skipped} bereits vorhanden${data.errors?.length ? `, ${data.errors.length} Fehler` : ''}`);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Import fehlgeschlagen');
    } finally {
      setImporting(false);
      if (importRef.current) importRef.current.value = '';
    }
  };

  // AI Settings state
  const [aiSettings, setAiSettings] = useState<{ aiEnabled: boolean; hasApiKey: boolean; maskedApiKey: string | null }>({
    aiEnabled: false, hasApiKey: false, maskedApiKey: null
  });
  const [aiKeyInput, setAiKeyInput] = useState('');
  const [showAiKey, setShowAiKey] = useState(false);
  const [aiSaving, setAiSaving] = useState(false);

  useEffect(() => {
    if (currentHousehold) {
      householdAPI.getMembers(currentHousehold.id).then(({ data }) => setMembers(data.members));
      householdAPI.getAiSettings(currentHousehold.id).then(({ data }) => setAiSettings(data)).catch(() => {});
    }
  }, [currentHousehold]);

  const handleSaveAi = async () => {
    if (!currentHousehold) return;
    setAiSaving(true);
    try {
      const { data } = await householdAPI.saveAiSettings(currentHousehold.id, {
        aiEnabled: aiSettings.aiEnabled,
        apiKey: aiKeyInput,
      });
      setAiSettings(data);
      setAiKeyInput('');
      toast.success(data.aiEnabled ? '✅ KI-Analyse aktiviert!' : 'KI-Analyse deaktiviert');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Fehler beim Speichern');
    } finally {
      setAiSaving(false);
    }
  };

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
          {/* AI Settings */}
          <div className="card p-6">
            <h2 className="font-semibold text-gray-900 dark:text-white mb-1 flex items-center gap-2">
              <Bot size={18} className="text-[var(--primary)]" /> KI-Quittungsanalyse
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
              Claude AI erkennt automatisch Betrag, Händler und Kategorie aus Quittungsfotos.
              Benötigt einen eigenen API-Key von{' '}
              <a href="https://console.anthropic.com" target="_blank" rel="noreferrer"
                className="text-[var(--primary)] hover:underline inline-flex items-center gap-1">
                console.anthropic.com <ExternalLink size={12} />
              </a>
              {' '}(ca. 0,003 € pro Quittung).
            </p>

            {/* Enable Toggle */}
            <div className="flex items-center justify-between p-4 rounded-xl bg-gray-50 dark:bg-slate-700 mb-4">
              <div>
                <p className="font-medium text-gray-900 dark:text-white text-sm">KI-Analyse aktivieren</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {aiSettings.hasApiKey
                    ? `Gespeicherter Key: ${aiSettings.maskedApiKey}`
                    : 'Noch kein API-Key hinterlegt'}
                </p>
              </div>
              <button
                onClick={() => setAiSettings(s => ({ ...s, aiEnabled: !s.aiEnabled }))}
                className={`relative w-12 h-6 rounded-full transition-colors ${aiSettings.aiEnabled ? 'bg-[var(--primary)]' : 'bg-gray-300 dark:bg-slate-500'}`}
              >
                <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${aiSettings.aiEnabled ? 'translate-x-7' : 'translate-x-1'}`} />
              </button>
            </div>

            {/* API Key Input */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {aiSettings.hasApiKey ? 'Neuen API-Key eingeben (zum Ersetzen)' : 'Anthropic API-Key'}
              </label>
              <div className="relative">
                <input
                  type={showAiKey ? 'text' : 'password'}
                  className="input pr-10"
                  placeholder="sk-ant-api03-..."
                  value={aiKeyInput}
                  onChange={e => setAiKeyInput(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowAiKey(!showAiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showAiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {aiSettings.hasApiKey && !aiKeyInput && (
                <p className="text-xs text-gray-500 mt-1">Leer lassen, um den gespeicherten Key beizubehalten.</p>
              )}
            </div>

            <div className="flex items-center justify-between">
              <button
                onClick={() => {
                  if (confirm('API-Key wirklich löschen und KI deaktivieren?')) {
                    setAiKeyInput('');
                    setAiSettings(s => ({ ...s, aiEnabled: false }));
                    householdAPI.saveAiSettings(currentHousehold.id, { aiEnabled: false, apiKey: '' })
                      .then(() => { setAiSettings({ aiEnabled: false, hasApiKey: false, maskedApiKey: null }); toast.success('Key gelöscht'); })
                      .catch(() => toast.error('Fehler'));
                  }
                }}
                className={`text-sm text-red-500 hover:underline ${!aiSettings.hasApiKey ? 'invisible' : ''}`}
              >
                Key löschen
              </button>
              <button
                onClick={handleSaveAi}
                disabled={aiSaving}
                className="btn-primary flex items-center gap-2 disabled:opacity-50"
              >
                {aiSaving ? <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" /> : <Bot size={16} />}
                Einstellungen speichern
              </button>
            </div>
          </div>
          {/* Backup */}
          <div className="card p-6">
            <h2 className="font-semibold text-gray-900 dark:text-white mb-1 flex items-center gap-2">
              <Database size={18} className="text-[var(--primary)]" /> Datensicherung
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
              Exportiere alle Transaktionen als JSON oder CSV. JSON-Exporte können vollständig wiederhergestellt werden.
            </p>

            {/* Export */}
            <div className="flex items-center gap-3 mb-4">
              <select value={exportFormat} onChange={e => setExportFormat(e.target.value as 'json' | 'csv')}
                className="input flex-none w-28 text-sm">
                <option value="json">JSON</option>
                <option value="csv">CSV</option>
              </select>
              <button onClick={handleExport} className="btn-primary flex items-center gap-2 text-sm">
                <Download size={15} /> Exportieren
              </button>
            </div>

            {/* Import */}
            <div className="border-t border-gray-100 dark:border-slate-700 pt-4">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Wiederherstellen</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                Bereits vorhandene Transaktionen werden nicht überschrieben (Duplikaterkennung aktiv).
              </p>
              <input ref={importRef} type="file" accept=".json,.csv" className="hidden" onChange={handleImport} />
              <button onClick={() => importRef.current?.click()} disabled={importing}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-100 dark:bg-slate-700 text-sm font-medium hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors disabled:opacity-50">
                {importing
                  ? <div className="animate-spin h-4 w-4 border-2 border-[var(--primary)] border-t-transparent rounded-full" />
                  : <Upload size={15} />}
                {importing ? 'Importiere…' : 'Datei wählen & importieren'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
