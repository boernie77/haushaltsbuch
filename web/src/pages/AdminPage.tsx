import React, { useState, useEffect } from 'react';
import { Users, Home, BarChart2, Shield, Plus, Trash2, Ban, CheckCircle, Bot, Eye, EyeOff, Globe } from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { useAuthStore } from '../store/authStore';
import { adminAPI } from '../services/api';

export default function AdminPage() {
  const { user } = useAuthStore();
  const [tab, setTab] = useState<'stats' | 'users' | 'households' | 'invites' | 'ai'>('stats');
  const [stats, setStats] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [households, setHouseholds] = useState<any[]>([]);
  const [inviteCodes, setInviteCodes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // AI settings state
  const [aiSettings, setAiSettings] = useState<{ hasApiKey: boolean; maskedApiKey: string | null; aiKeyPublic: boolean }>({ hasApiKey: false, maskedApiKey: null, aiKeyPublic: false });
  const [aiKeyInput, setAiKeyInput] = useState('');
  const [showAiKey, setShowAiKey] = useState(false);
  const [aiSaving, setAiSaving] = useState(false);

  if (user?.role !== 'superadmin' && user?.role !== 'admin') {
    return <div className="flex items-center justify-center h-full text-gray-500">Kein Zugriff</div>;
  }

  useEffect(() => {
    setLoading(true);
    Promise.all([
      adminAPI.getStats(),
      adminAPI.getUsers(),
      adminAPI.getHouseholds(),
      adminAPI.getInviteCodes(),
      adminAPI.getAiSettings()
    ]).then(([s, u, h, i, ai]) => {
      setStats(s.data);
      setUsers(u.data.users);
      setHouseholds(h.data.households);
      setInviteCodes(i.data.codes);
      setAiSettings(ai.data);
    }).finally(() => setLoading(false));
  }, []);

  const handleSaveAiSettings = async () => {
    setAiSaving(true);
    try {
      const { data } = await adminAPI.saveAiSettings({ apiKey: aiKeyInput, aiKeyPublic: aiSettings.aiKeyPublic });
      setAiSettings(data);
      setAiKeyInput('');
      toast.success('KI-Einstellungen gespeichert');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Fehler beim Speichern');
    } finally {
      setAiSaving(false);
    }
  };

  const handleDeleteAiKey = async () => {
    if (!confirm('Globalen API-Key wirklich löschen?')) return;
    try {
      const { data } = await adminAPI.saveAiSettings({ apiKey: '', aiKeyPublic: false });
      setAiSettings(data);
      setAiKeyInput('');
      toast.success('Key gelöscht');
    } catch { toast.error('Fehler'); }
  };

  const handleToggleAiGrant = async (u: any) => {
    try {
      const { data } = await adminAPI.toggleAiGrant(u.id);
      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, aiKeyGranted: data.user.aiKeyGranted } : x));
      toast.success(data.user.aiKeyGranted ? 'KI-Zugriff gewährt' : 'KI-Zugriff entzogen');
    } catch { toast.error('Fehler'); }
  };

  const handleToggleUser = async (u: any) => {
    try {
      await adminAPI.updateUser(u.id, { isActive: !u.isActive });
      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, isActive: !x.isActive } : x));
      toast.success(u.isActive ? 'Benutzer deaktiviert' : 'Benutzer aktiviert');
    } catch { toast.error('Fehler'); }
  };

  const handleDeleteUser = async (id: string) => {
    if (!confirm('Benutzer wirklich löschen?')) return;
    try { await adminAPI.deleteUser(id); setUsers(prev => prev.filter(u => u.id !== id)); toast.success('Gelöscht'); }
    catch { toast.error('Fehler'); }
  };

  const handleCreateInvite = async () => {
    try {
      const { data } = await adminAPI.createInviteCode({ role: 'member', maxUses: 100, expiresIn: 24 * 30 });
      setInviteCodes(prev => [data.invite, ...prev]);
      toast.success(`Einladungscode: ${data.invite.code}`);
    } catch { toast.error('Fehler'); }
  };

  const tabs = [
    { id: 'stats', label: 'Übersicht', icon: BarChart2 },
    { id: 'users', label: `Benutzer (${users.length})`, icon: Users },
    { id: 'households', label: `Haushalte (${households.length})`, icon: Home },
    { id: 'invites', label: 'Einladungen', icon: Shield },
    { id: 'ai', label: 'KI-Verwaltung', icon: Bot },
  ];

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
        <Shield className="text-[var(--primary)]" /> Administration
      </h1>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200 dark:border-slate-700">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id as any)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-all border-b-2 -mb-px ${
              tab === id ? 'border-[var(--primary)] text-[var(--primary)]' : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}>
            <Icon size={16} />{label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--primary)]" /></div>
      ) : (
        <>
          {tab === 'stats' && stats && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { label: 'Benutzer gesamt', value: stats.userCount, icon: Users },
                { label: 'Haushalte', value: stats.householdCount, icon: Home },
                { label: 'Buchungen', value: stats.transactionCount, icon: BarChart2 },
              ].map(({ label, value, icon: Icon }) => (
                <div key={label} className="card p-5 flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-[var(--primary)]/10 flex items-center justify-center">
                    <Icon className="text-[var(--primary)]" size={22} />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase">{label}</p>
                    <p className="text-3xl font-bold text-gray-900 dark:text-white">{value}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'users' && (
            <div className="card overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-slate-700">
                  <tr>
                    {['Name', 'E-Mail', 'Rolle', 'Status', 'KI-Zugriff', 'Registriert', ''].map(h => (
                      <th key={h} className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                  {users.map(u => (
                    <tr key={u.id} className="hover:bg-pink-50/50 dark:hover:bg-slate-700/50">
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{u.name}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{u.email}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${u.role === 'superadmin' ? 'bg-yellow-100 text-yellow-800' : u.role === 'admin' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-700'}`}>
                          {u.role}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${u.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {u.isActive ? 'Aktiv' : 'Deaktiviert'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => handleToggleAiGrant(u)} title={u.aiKeyGranted ? 'KI-Zugriff entziehen' : 'KI-Zugriff gewähren'}
                          className={`px-2 py-0.5 rounded-full text-xs font-medium flex items-center gap-1 ${u.aiKeyGranted ? 'bg-purple-100 text-purple-700 hover:bg-purple-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                          <Bot size={11} /> {u.aiKeyGranted ? 'Gewährt' : 'Kein Zugriff'}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">{format(new Date(u.createdAt), 'dd.MM.yyyy')}</td>
                      <td className="px-4 py-3 flex gap-2">
                        <button onClick={() => handleToggleUser(u)} className="text-gray-400 hover:text-blue-500">
                          {u.isActive ? <Ban size={16} /> : <CheckCircle size={16} />}
                        </button>
                        <button onClick={() => handleDeleteUser(u.id)} className="text-gray-400 hover:text-red-500">
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'households' && (
            <div className="space-y-4">
              {households.map(h => (
                <div key={h.id} className="card p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-white">{h.name}</h3>
                      <p className="text-sm text-gray-500">{h.HouseholdMembers?.length} Mitglieder</p>
                    </div>
                    <div className="text-right text-sm text-gray-500">
                      {h.monthlyBudget && <p>Budget: {h.monthlyBudget} €/Monat</p>}
                      <p>{format(new Date(h.createdAt), 'dd.MM.yyyy')}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'ai' && (
            <div className="space-y-6 max-w-2xl">
              <div className="card p-6 space-y-5">
                <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <Bot size={18} className="text-[var(--primary)]" /> Globaler Anthropic API-Key
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Dieser zentrale Key wird verwendet, wenn ein Haushalt keinen eigenen Key konfiguriert hat.
                  Du kannst festlegen, ob alle Benutzer ihn nutzen dürfen oder nur explizit freigegebene.
                </p>

                {/* Current key status */}
                <div className="p-4 rounded-xl bg-gray-50 dark:bg-slate-700">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {aiSettings.hasApiKey ? (
                      <span className="text-green-600 dark:text-green-400">✓ Key hinterlegt: {aiSettings.maskedApiKey}</span>
                    ) : (
                      <span className="text-gray-500">Kein globaler Key hinterlegt</span>
                    )}
                  </p>
                </div>

                {/* New key input */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {aiSettings.hasApiKey ? 'Neuen Key eingeben (zum Ersetzen)' : 'Anthropic API-Key'}
                  </label>
                  <div className="relative">
                    <input
                      type={showAiKey ? 'text' : 'password'}
                      className="input pr-10"
                      placeholder="sk-ant-api03-..."
                      value={aiKeyInput}
                      onChange={e => setAiKeyInput(e.target.value)}
                    />
                    <button type="button" onClick={() => setShowAiKey(!showAiKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {showAiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                {/* Public toggle */}
                <div className="flex items-center justify-between p-4 rounded-xl bg-gray-50 dark:bg-slate-700">
                  <div className="flex items-center gap-2">
                    <Globe size={16} className="text-[var(--primary)]" />
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white text-sm">Für alle Benutzer freigeben</p>
                      <p className="text-xs text-gray-500">Wenn deaktiviert, nur für explizit freigegebene Benutzer</p>
                    </div>
                  </div>
                  <button onClick={() => setAiSettings(s => ({ ...s, aiKeyPublic: !s.aiKeyPublic }))}
                    className={`relative w-12 h-6 rounded-full transition-colors ${aiSettings.aiKeyPublic ? 'bg-[var(--primary)]' : 'bg-gray-300 dark:bg-slate-500'}`}>
                    <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${aiSettings.aiKeyPublic ? 'translate-x-7' : 'translate-x-1'}`} />
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  {aiSettings.hasApiKey && (
                    <button onClick={handleDeleteAiKey} className="text-sm text-red-500 hover:underline">
                      Key löschen
                    </button>
                  )}
                  <button onClick={handleSaveAiSettings} disabled={aiSaving}
                    className="btn-primary flex items-center gap-2 disabled:opacity-50 ml-auto">
                    {aiSaving ? <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" /> : <Bot size={16} />}
                    Einstellungen speichern
                  </button>
                </div>
              </div>

              {/* Per-user grants (only relevant when not public) */}
              {!aiSettings.aiKeyPublic && (
                <div className="card p-6">
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-1 flex items-center gap-2">
                    <Users size={16} /> KI-Zugriff pro Benutzer
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                    Klicke auf einen Benutzer, um den KI-Zugriff zu gewähren oder zu entziehen.
                  </p>
                  <div className="space-y-2">
                    {users.map(u => (
                      <div key={u.id} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-slate-700 last:border-0">
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">{u.name}</p>
                          <p className="text-xs text-gray-500">{u.email}</p>
                        </div>
                        <button onClick={() => handleToggleAiGrant(u)}
                          className={`px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1.5 transition-colors ${u.aiKeyGranted ? 'bg-purple-100 text-purple-700 hover:bg-purple-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                          <Bot size={12} /> {u.aiKeyGranted ? 'Zugriff aktiv' : 'Kein Zugriff'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'invites' && (
            <>
              <button onClick={handleCreateInvite} className="btn-primary flex items-center gap-2">
                <Plus size={16} /> Einladungscode erstellen
              </button>
              <div className="card overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-slate-700">
                    <tr>
                      {['Code', 'Rolle', 'Genutzt', 'Max', 'Erstellt', 'Läuft ab'].map(h => (
                        <th key={h} className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                    {inviteCodes.map(code => (
                      <tr key={code.id} className="hover:bg-pink-50/50 dark:hover:bg-slate-700/50">
                        <td className="px-4 py-3 font-mono text-sm font-bold text-[var(--primary)]">{code.code}</td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{code.role}</td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{code.useCount}</td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{code.maxUses}</td>
                        <td className="px-4 py-3 text-sm text-gray-500">{format(new Date(code.createdAt), 'dd.MM.yy')}</td>
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {code.expiresAt ? format(new Date(code.expiresAt), 'dd.MM.yy') : '∞'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
