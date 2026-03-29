import React, { useState, useEffect } from 'react';
import { Users, Home, BarChart2, Shield, Plus, Trash2, Ban, CheckCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { useAuthStore } from '../store/authStore';
import { adminAPI } from '../services/api';

export default function AdminPage() {
  const { user } = useAuthStore();
  const [tab, setTab] = useState<'stats' | 'users' | 'households' | 'invites'>('stats');
  const [stats, setStats] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [households, setHouseholds] = useState<any[]>([]);
  const [inviteCodes, setInviteCodes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  if (user?.role !== 'superadmin' && user?.role !== 'admin') {
    return <div className="flex items-center justify-center h-full text-gray-500">Kein Zugriff</div>;
  }

  useEffect(() => {
    setLoading(true);
    Promise.all([
      adminAPI.getStats(),
      adminAPI.getUsers(),
      adminAPI.getHouseholds(),
      adminAPI.getInviteCodes()
    ]).then(([s, u, h, i]) => {
      setStats(s.data);
      setUsers(u.data.users);
      setHouseholds(h.data.households);
      setInviteCodes(i.data.codes);
    }).finally(() => setLoading(false));
  }, []);

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
                    {['Name', 'E-Mail', 'Rolle', 'Status', 'Registriert', ''].map(h => (
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
