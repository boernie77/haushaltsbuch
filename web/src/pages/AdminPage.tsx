import React, { useState, useEffect } from 'react';
import { Users, Home, BarChart2, Shield, Plus, Trash2, Ban, CheckCircle, Bot, Eye, EyeOff, Globe, Database, Search, Play, Wifi, Key, Copy, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { useAuthStore } from '../store/authStore';
import { adminAPI } from '../services/api';

export default function AdminPage() {
  const { user } = useAuthStore();
  const [tab, setTab] = useState<'stats' | 'users' | 'households' | 'invites' | 'ai' | 'backup'>('stats');
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

  // Backup state
  const [backupConfig, setBackupConfig] = useState<any>(null);
  const [backupForm, setBackupForm] = useState({ sftpHost: '', sftpPort: '22', sftpUser: '', sftpPassword: '', sftpPath: '/backups', scheduleLabel: 'daily', isActive: false });
  const [showSftpPw, setShowSftpPw] = useState(false);
  const [backupSaving, setBackupSaving] = useState(false);
  const [backupTesting, setBackupTesting] = useState(false);
  const [backupRunning, setBackupRunning] = useState(false);
  const [sshPublicKey, setSshPublicKey] = useState<string | null>(null);
  const [sshKeyLoading, setSshKeyLoading] = useState(false);
  const [sshKeyRegenerating, setSshKeyRegenerating] = useState(false);
  const [householdSearch, setHouseholdSearch] = useState('');
  const [userSearch, setUserSearch] = useState('');

  const SCHEDULES: Record<string, { label: string; cron: string }> = {
    daily:    { label: 'Täglich (02:00)',          cron: '0 2 * * *'   },
    weekly:   { label: 'Wöchentlich (So, 02:00)',  cron: '0 2 * * 0'   },
    monthly:  { label: 'Monatlich (1., 02:00)',    cron: '0 2 1 * *'   },
    disabled: { label: 'Deaktiviert',              cron: ''             },
  };

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
      adminAPI.getAiSettings(),
      adminAPI.getBackupConfig(),
    ]).then(([s, u, h, i, ai, bk]) => {
      setStats(s.data);
      setUsers(u.data.users);
      setHouseholds(h.data.households);
      setInviteCodes(i.data.codes);
      setAiSettings(ai.data);
      if (bk.data.hasConfig) {
        const c = bk.data.config;
        setBackupConfig(c);
        setBackupForm({
          sftpHost: c.sftpHost || '', sftpPort: String(c.sftpPort || 22),
          sftpUser: c.sftpUser || '', sftpPassword: '',
          sftpPath: c.sftpPath || '/backups',
          scheduleLabel: c.scheduleLabel || 'daily', isActive: c.isActive,
        });
      }
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => { if (tab === 'backup') loadSshKey(); }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadSshKey = async () => {
    if (sshPublicKey) return;
    setSshKeyLoading(true);
    try {
      const { data } = await adminAPI.getSshPublicKey();
      setSshPublicKey(data.publicKey);
    } catch { toast.error('SSH-Key konnte nicht geladen werden'); }
    finally { setSshKeyLoading(false); }
  };

  const handleRegenerateSshKey = async () => {
    if (!confirm('Wirklich einen neuen SSH-Key generieren? Der alte Key wird danach nicht mehr funktionieren — du musst den neuen Key auf deinem Homeserver eintragen.')) return;
    setSshKeyRegenerating(true);
    try {
      const { data } = await adminAPI.regenerateSshKey();
      setSshPublicKey(data.publicKey);
      toast.success('Neuer SSH-Key generiert — bitte auf dem Homeserver eintragen!');
    } catch { toast.error('Fehler beim Generieren'); }
    finally { setSshKeyRegenerating(false); }
  };

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
      const { data } = await adminAPI.createInviteCode({ maxUses: 1, expiresIn: 24 * 30 });
      setInviteCodes(prev => [data.invite, ...prev]);
      navigator.clipboard?.writeText(data.invite.code);
      toast.success(`Code erstellt & kopiert: ${data.invite.code}`);
    } catch { toast.error('Fehler'); }
  };

  const handleSaveBackup = async () => {
    setBackupSaving(true);
    try {
      const sched = SCHEDULES[backupForm.scheduleLabel] ?? SCHEDULES.disabled;
      const { data } = await adminAPI.saveBackupConfig({
        ...backupForm, sftpPort: parseInt(backupForm.sftpPort) || 22,
        schedule: sched.cron, isActive: backupForm.scheduleLabel !== 'disabled' && backupForm.isActive,
      });
      setBackupConfig(data.config);
      setBackupForm(f => ({ ...f, sftpPassword: '' }));
      toast.success('Backup-Einstellungen gespeichert');
    } catch (err: any) { toast.error(err.response?.data?.message || 'Fehler'); }
    finally { setBackupSaving(false); }
  };

  const handleTestBackup = async () => {
    setBackupTesting(true);
    try {
      const { data } = await adminAPI.testBackup({ ...backupForm, sftpPort: parseInt(backupForm.sftpPort) || 22 });
      toast.success(data.message);
    } catch (err: any) { toast.error(err.response?.data?.message || 'Verbindung fehlgeschlagen'); }
    finally { setBackupTesting(false); }
  };

  const handleRunBackup = async () => {
    if (!confirm('Backup jetzt ausführen?')) return;
    setBackupRunning(true);
    try {
      const { data } = await adminAPI.runBackup();
      toast.success(data.message);
      const { data: bk } = await adminAPI.getBackupConfig();
      if (bk.hasConfig) setBackupConfig(bk.config);
    } catch (err: any) { toast.error(err.response?.data?.message || 'Backup fehlgeschlagen'); }
    finally { setBackupRunning(false); }
  };

  const tabs = [
    { id: 'stats', label: 'Übersicht', icon: BarChart2 },
    { id: 'users', label: `Benutzer (${users.length})`, icon: Users },
    { id: 'households', label: `Haushaltsbücher (${households.length})`, icon: Home },
    { id: 'invites', label: 'Einladungen', icon: Shield },
    { id: 'ai', label: 'KI-Verwaltung', icon: Bot },
    { id: 'backup', label: 'Backup', icon: Database },
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
                { label: 'Haushaltsbücher', value: stats.householdCount, icon: Home },
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
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <input className="input w-full" style={{ paddingLeft: '2.25rem' }} placeholder="Benutzer suchen (Name, E-Mail)..." value={userSearch}
                  onChange={e => setUserSearch(e.target.value)} />
              </div>
            <div className="card overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-slate-700">
                  <tr>
                    {['Name', 'E-Mail', 'Haushaltsbücher', 'Rolle', 'Status', 'KI-Zugriff', ''].map(h => (
                      <th key={h} className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                  {users.filter(u => {
                    if (!userSearch) return true;
                    const q = userSearch.toLowerCase();
                    return u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q);
                  }).map(u => (
                    <tr key={u.id} className="hover:bg-pink-50/50 dark:hover:bg-slate-700/50">
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{u.name}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{u.email}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                        {(u.households || []).join(', ') || '—'}
                      </td>
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
            </div>
          )}

          {tab === 'households' && (
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <input className="input w-full" style={{ paddingLeft: '2.25rem' }} placeholder="Haushaltsbuch suchen (Name)..." value={householdSearch}
                  onChange={e => setHouseholdSearch(e.target.value)} />
              </div>
              {households.filter(h => {
                if (!householdSearch) return true;
                const q = householdSearch.toLowerCase();
                return h.name?.toLowerCase().includes(q);
              }).map(h => (
                <div key={h.id} className="card p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-[var(--primary)]/10 flex items-center justify-center text-[var(--primary)] font-bold text-sm">
                        <Home size={16} />
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900 dark:text-white">{h.name}</p>
                        <p className="text-xs text-gray-500">
                          {h.HouseholdMembers?.length ?? '?'} Mitglied(er)
                          {h.currency ? ` · ${h.currency}` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {h.aiEnabled && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">KI</span>}
                    </div>
                  </div>
                  {h.HouseholdMembers && h.HouseholdMembers.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {h.HouseholdMembers.map((m: any) => (
                        <span key={m.userId || m.id} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gray-50 dark:bg-slate-700 text-sm text-gray-700 dark:text-gray-300">
                          <Users size={13} className="text-[var(--primary)]" />
                          {m.User?.name || '—'}
                          <span className="text-xs text-gray-400 ml-1">({m.role})</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {households.length === 0 && <p className="text-sm text-gray-500 text-center py-8">Keine Haushaltsbücher gefunden</p>}
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
                    className={`relative w-12 h-6 rounded-full transition-colors overflow-hidden ${aiSettings.aiKeyPublic ? 'bg-[var(--primary)]' : 'bg-gray-300 dark:bg-slate-500'}`}>
                    <span className={`absolute top-1 left-0 w-4 h-4 bg-white rounded-full shadow transition-transform ${aiSettings.aiKeyPublic ? 'translate-x-7' : 'translate-x-1'}`} />
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

          {tab === 'backup' && (
            <div className="space-y-6 max-w-2xl">

              {/* SSH Key Setup Card */}
              <div className="card p-6 space-y-4">
                <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <Key size={18} className="text-[var(--primary)]" /> SSH-Key-Authentifizierung
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Mit einem SSH-Key kannst du dich ohne Passwort sicher mit deinem Homeserver verbinden.
                  Einmal eingerichtet, reicht es, <strong>kein Passwort</strong> im Formular einzutragen — der Key wird automatisch verwendet.
                </p>

                {/* Public key display */}
                {!sshPublicKey && (
                  <button onClick={loadSshKey} disabled={sshKeyLoading}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--primary)]/10 text-[var(--primary)] text-sm font-medium hover:bg-[var(--primary)]/20 disabled:opacity-50 transition-colors">
                    {sshKeyLoading
                      ? <div className="animate-spin h-4 w-4 border-2 border-[var(--primary)] border-t-transparent rounded-full" />
                      : <Key size={15} />}
                    SSH-Key anzeigen
                  </button>
                )}

                {sshPublicKey && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Öffentlicher Schlüssel (Public Key)</label>
                      <div className="flex gap-2">
                        <button onClick={() => { navigator.clipboard?.writeText(sshPublicKey); toast.success('Key kopiert!'); }}
                          className="flex items-center gap-1 text-xs text-[var(--primary)] hover:underline">
                          <Copy size={12} /> Kopieren
                        </button>
                        <button onClick={handleRegenerateSshKey} disabled={sshKeyRegenerating}
                          className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-500 disabled:opacity-50">
                          <RefreshCw size={12} /> Neu generieren
                        </button>
                      </div>
                    </div>
                    <div className="font-mono text-xs p-3 rounded-xl bg-gray-50 dark:bg-slate-800 break-all border border-gray-200 dark:border-slate-700 select-all">
                      {sshPublicKey}
                    </div>
                  </div>
                )}

                {/* Step-by-step instructions */}
                <details className="group">
                  <summary className="cursor-pointer text-sm font-medium text-[var(--primary)] hover:underline flex items-center gap-1 select-none">
                    <span className="group-open:rotate-90 inline-block transition-transform">▶</span>
                    Schritt-für-Schritt-Anleitung: SSH-Key auf dem Homeserver einrichten
                  </summary>
                  <div className="mt-4 space-y-4 text-sm text-gray-700 dark:text-gray-300">

                    <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                      <p className="font-semibold text-blue-800 dark:text-blue-300 mb-1">Was passiert hier?</p>
                      <p className="text-blue-700 dark:text-blue-400 text-xs">
                        Der App-Server bekommt einen eindeutigen "Schlüssel". Deinem Backup-Server sagst du einmalig:
                        "Lass diesen Schlüssel rein". Danach können Backups automatisch übertragen werden — ohne Passwort.
                      </p>
                    </div>

                    <ol className="space-y-4 list-none">
                      <li className="flex gap-3">
                        <span className="flex-shrink-0 w-7 h-7 rounded-full bg-[var(--primary)] text-white text-xs font-bold flex items-center justify-center">1</span>
                        <div>
                          <p className="font-semibold">Öffentlichen Key kopieren</p>
                          <p className="text-xs text-gray-500 mt-0.5">Klicke oben auf <strong>„Kopieren"</strong> neben dem Public Key. Der Key beginnt immer mit <code className="bg-gray-100 dark:bg-slate-700 px-1 rounded">ssh-ed25519</code>.</p>
                        </div>
                      </li>

                      <li className="flex gap-3">
                        <span className="flex-shrink-0 w-7 h-7 rounded-full bg-[var(--primary)] text-white text-xs font-bold flex items-center justify-center">2</span>
                        <div>
                          <p className="font-semibold">Auf dem Backup-Server anmelden</p>
                          <p className="text-xs text-gray-500 mt-0.5">Öffne ein Terminal und verbinde dich mit deinem Backup-Server (ersetze die Platzhalter durch deine eigenen Werte):</p>
                          <pre className="mt-1 p-2 rounded-lg bg-slate-800 text-green-400 text-xs overflow-x-auto">ssh BENUTZER@IP-ADRESSE</pre>
                        </div>
                      </li>

                      <li className="flex gap-3">
                        <span className="flex-shrink-0 w-7 h-7 rounded-full bg-[var(--primary)] text-white text-xs font-bold flex items-center justify-center">3</span>
                        <div>
                          <p className="font-semibold">Ordner für SSH-Keys erstellen (falls noch nicht vorhanden)</p>
                          <pre className="mt-1 p-2 rounded-lg bg-slate-800 text-green-400 text-xs overflow-x-auto">mkdir -p ~/.ssh && chmod 700 ~/.ssh</pre>
                        </div>
                      </li>

                      <li className="flex gap-3">
                        <span className="flex-shrink-0 w-7 h-7 rounded-full bg-[var(--primary)] text-white text-xs font-bold flex items-center justify-center">4</span>
                        <div>
                          <p className="font-semibold">Public Key in die authorized_keys-Datei eintragen</p>
                          <p className="text-xs text-gray-500 mt-0.5">Führe diesen Befehl aus und ersetze <code className="bg-gray-100 dark:bg-slate-700 px-1 rounded">HIER_DEN_KEY_EINFÜGEN</code> durch den kopierten Key (alles in einer Zeile!):</p>
                          <pre className="mt-1 p-2 rounded-lg bg-slate-800 text-green-400 text-xs overflow-x-auto whitespace-pre-wrap">echo "HIER_DEN_KEY_EINFÜGEN" {'>>'}  ~/.ssh/authorized_keys</pre>
                          <p className="text-xs text-gray-500 mt-1">Oder öffne die Datei direkt mit einem Texteditor und füge den Key als neue Zeile ein:</p>
                          <pre className="mt-1 p-2 rounded-lg bg-slate-800 text-green-400 text-xs overflow-x-auto">nano ~/.ssh/authorized_keys</pre>
                        </div>
                      </li>

                      <li className="flex gap-3">
                        <span className="flex-shrink-0 w-7 h-7 rounded-full bg-[var(--primary)] text-white text-xs font-bold flex items-center justify-center">5</span>
                        <div>
                          <p className="font-semibold">Berechtigungen setzen</p>
                          <pre className="mt-1 p-2 rounded-lg bg-slate-800 text-green-400 text-xs overflow-x-auto">chmod 600 ~/.ssh/authorized_keys</pre>
                        </div>
                      </li>

                      <li className="flex gap-3">
                        <span className="flex-shrink-0 w-7 h-7 rounded-full bg-[var(--primary)] text-white text-xs font-bold flex items-center justify-center">6</span>
                        <div>
                          <p className="font-semibold">Backup-Ordner erstellen</p>
                          <p className="text-xs text-gray-500 mt-0.5">Erstelle den Ordner, in dem die Backups gespeichert werden sollen (beliebiger Name):</p>
                          <pre className="mt-1 p-2 rounded-lg bg-slate-800 text-green-400 text-xs overflow-x-auto">mkdir -p ~/backups</pre>
                        </div>
                      </li>

                      <li className="flex gap-3">
                        <span className="flex-shrink-0 w-7 h-7 rounded-full bg-[var(--primary)] text-white text-xs font-bold flex items-center justify-center">7</span>
                        <div>
                          <p className="font-semibold">Verbindung testen</p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            Trage unten im Formular Host, Benutzer und Pfad ein — das Passwort-Feld kannst du <strong>leer lassen</strong>.
                            Klicke dann auf <strong>„Verbindung testen"</strong>.
                          </p>
                          <div className="mt-1 p-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-400">
                            <strong>Remote-Pfad:</strong> muss absolut sein, z.B. <code>/home/benutzer/backups</code> — nicht nur <code>backups</code>
                          </div>
                        </div>
                      </li>
                    </ol>
                  </div>
                </details>
              </div>

              <div className="card p-6 space-y-5">
                <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <Database size={18} className="text-[var(--primary)]" /> Globales Backup (SFTP)
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Sichere alle Daten automatisch auf deinen Heimserver via SFTP. Das Backup wird als komprimiertes JSON gespeichert.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">SFTP Host</label>
                    <input type="text" className="input" placeholder="192.168.2.204" value={backupForm.sftpHost}
                      onChange={e => setBackupForm(f => ({ ...f, sftpHost: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Port</label>
                    <input type="number" className="input" value={backupForm.sftpPort}
                      onChange={e => setBackupForm(f => ({ ...f, sftpPort: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Benutzer</label>
                    <input type="text" className="input" value={backupForm.sftpUser}
                      onChange={e => setBackupForm(f => ({ ...f, sftpUser: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      {backupConfig?.hasPassword ? 'Neues Passwort (leer = unverändert)' : 'Passwort'}
                    </label>
                    <div className="relative">
                      <input type={showSftpPw ? 'text' : 'password'} className="input pr-9"
                        value={backupForm.sftpPassword}
                        onChange={e => setBackupForm(f => ({ ...f, sftpPassword: e.target.value }))} />
                      <button type="button" onClick={() => setShowSftpPw(!showSftpPw)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                        {showSftpPw ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Remote-Pfad</label>
                    <input type="text" className="input" placeholder="/backups" value={backupForm.sftpPath}
                      onChange={e => setBackupForm(f => ({ ...f, sftpPath: e.target.value }))} />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Automatischer Zeitplan</label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {Object.entries(SCHEDULES).map(([key, { label }]) => (
                      <button key={key} onClick={() => setBackupForm(f => ({ ...f, scheduleLabel: key, isActive: key !== 'disabled' }))}
                        className={`px-3 py-2 rounded-xl text-xs font-medium border transition-all ${backupForm.scheduleLabel === key ? 'bg-[var(--primary)] text-white border-transparent' : 'border-gray-200 dark:border-slate-600 text-gray-600 dark:text-gray-300 hover:border-[var(--primary)]'}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {backupConfig && (
                  <div className={`p-3 rounded-xl text-xs font-medium ${backupConfig.lastRunStatus === 'success' ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400' : backupConfig.lastRunStatus === 'error' ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400' : 'bg-gray-50 dark:bg-slate-700 text-gray-500'}`}>
                    {backupConfig.lastRunAt
                      ? `Letztes Backup: ${format(new Date(backupConfig.lastRunAt), 'dd.MM.yyyy HH:mm')} — ${backupConfig.lastRunMessage}`
                      : 'Noch kein Backup ausgeführt'}
                  </div>
                )}

                <div className="flex items-center gap-3 flex-wrap">
                  <button onClick={handleTestBackup} disabled={backupTesting || !backupForm.sftpHost}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-100 dark:bg-slate-700 text-sm font-medium disabled:opacity-50 hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors">
                    {backupTesting ? <div className="animate-spin h-4 w-4 border-2 border-gray-500 border-t-transparent rounded-full" /> : <Wifi size={15} />}
                    Verbindung testen
                  </button>
                  <button onClick={handleRunBackup} disabled={backupRunning || !backupConfig?.sftpHost}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-100 dark:bg-slate-700 text-sm font-medium disabled:opacity-50 hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors">
                    {backupRunning ? <div className="animate-spin h-4 w-4 border-2 border-gray-500 border-t-transparent rounded-full" /> : <Play size={15} />}
                    Jetzt sichern
                  </button>
                  <button onClick={handleSaveBackup} disabled={backupSaving}
                    className="btn-primary flex items-center gap-2 ml-auto disabled:opacity-50">
                    {backupSaving ? <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" /> : <Database size={15} />}
                    Einstellungen speichern
                  </button>
                </div>
              </div>
            </div>
          )}

          {tab === 'invites' && (
            <>
              <div className="flex items-start gap-4 p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 mb-2">
                <div className="text-sm text-blue-700 dark:text-blue-300">
                  <p className="font-medium mb-1">Einladungscodes für neue Haushalte</p>
                  <p className="text-xs opacity-80">Jeder Code ermöglicht die Registrierung eines neuen Benutzers, der automatisch seinen eigenen Haushalt erhält und dessen Admin wird. Für Mitglieder-Einladungen in einen bestehenden Haushalt → Haushalt-Seite verwenden.</p>
                </div>
              </div>
              <button onClick={handleCreateInvite} className="btn-primary flex items-center gap-2">
                <Plus size={16} /> Code für neuen Haushalt erstellen
              </button>
              <div className="card overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-slate-700">
                    <tr>
                      {['Code', 'Typ', 'Genutzt / Max', 'Erstellt', 'Läuft ab'].map(h => (
                        <th key={h} className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                    {inviteCodes.map(code => (
                      <tr key={code.id} className={`hover:bg-pink-50/50 dark:hover:bg-slate-700/50 ${code.useCount >= code.maxUses ? 'opacity-50' : ''}`}>
                        <td className="px-4 py-3 font-mono text-sm font-bold text-[var(--primary)]">{code.code}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${code.type === 'new_household' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                            {code.type === 'new_household' ? 'Neuer Haushalt' : 'Mitglied'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{code.useCount} / {code.maxUses}</td>
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
