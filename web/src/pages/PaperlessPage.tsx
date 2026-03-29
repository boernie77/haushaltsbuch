import React, { useState, useEffect } from 'react';
import { Save, RefreshCw, Plus, FileText, Users, Tag } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/authStore';
import { paperlessAPI } from '../services/api';

export default function PaperlessPage() {
  const { currentHousehold } = useAuthStore();
  const [config, setConfig] = useState({ baseUrl: '', apiToken: '' });
  const [data, setData] = useState<any>(null);
  const [connected, setConnected] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newItem, setNewItem] = useState({ type: '', name: '', color: '' });

  useEffect(() => {
    if (!currentHousehold) return;
    paperlessAPI.getConfig(currentHousehold.id).then(({ data: d }) => {
      if (d.config) { setConfig({ baseUrl: d.config.baseUrl, apiToken: '' }); setConnected(true); }
    }).catch(() => {});
    paperlessAPI.getData(currentHousehold.id).then(({ data: d }) => setData(d)).catch(() => {});
  }, [currentHousehold]);

  const handleSave = async () => {
    if (!config.baseUrl || !config.apiToken || !currentHousehold) return;
    setSaving(true);
    try {
      await paperlessAPI.saveConfig({ ...config, householdId: currentHousehold.id });
      setConnected(true);
      toast.success('Paperless verbunden!');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Verbindung fehlgeschlagen');
    } finally { setSaving(false); }
  };

  const handleSync = async () => {
    if (!currentHousehold) return;
    setSyncing(true);
    try {
      const { data: d } = await paperlessAPI.sync(currentHousehold.id);
      const { data: pd } = await paperlessAPI.getData(currentHousehold.id);
      setData(pd);
      toast.success(`Synchronisiert: ${d.synced.documentTypes} Typen, ${d.synced.correspondents} Korrespondenten, ${d.synced.tags} Tags`);
    } catch (err: any) {
      toast.error('Sync fehlgeschlagen: ' + err.response?.data?.error);
    } finally { setSyncing(false); }
  };

  const handleCreate = async () => {
    if (!newItem.name || !currentHousehold) return;
    try {
      if (newItem.type === 'doctype') await paperlessAPI.createDocType({ householdId: currentHousehold.id, name: newItem.name });
      else if (newItem.type === 'correspondent') await paperlessAPI.createCorrespondent({ householdId: currentHousehold.id, name: newItem.name });
      else if (newItem.type === 'tag') await paperlessAPI.createTag({ householdId: currentHousehold.id, name: newItem.name, color: newItem.color });
      const { data: pd } = await paperlessAPI.getData(currentHousehold.id);
      setData(pd);
      setNewItem({ type: '', name: '', color: '' });
      toast.success('Erstellt!');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Fehler');
    }
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Paperless-ngx Integration</h1>

      {/* Connection Config */}
      <div className="card p-6">
        <h2 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <FileText size={18} className="text-[var(--primary)]" /> Verbindung
          {connected && <span className="ml-2 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">● Verbunden</span>}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Paperless URL</label>
            <input type="url" className="input" placeholder="https://paperless.example.com"
              value={config.baseUrl} onChange={e => setConfig(c => ({ ...c, baseUrl: e.target.value }))} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">API Token</label>
            <input type="password" className="input" placeholder="Token aus Paperless Einstellungen"
              value={config.apiToken} onChange={e => setConfig(c => ({ ...c, apiToken: e.target.value }))} />
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2">
            <Save size={16} /> {saving ? 'Speichert...' : 'Verbinden'}
          </button>
          {connected && (
            <button onClick={handleSync} disabled={syncing} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-100 dark:bg-slate-700 text-sm font-medium">
              <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} />
              {syncing ? 'Synchronisiert...' : 'Daten synchronisieren'}
            </button>
          )}
        </div>
      </div>

      {/* Create new items */}
      <div className="card p-6">
        <h2 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <Plus size={18} className="text-[var(--primary)]" /> Neues Element erstellen
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <select className="input" value={newItem.type} onChange={e => setNewItem(n => ({ ...n, type: e.target.value }))}>
            <option value="">Typ wählen...</option>
            <option value="doctype">Dokumententyp</option>
            <option value="correspondent">Korrespondent</option>
            <option value="tag">Tag</option>
          </select>
          <input type="text" className="input" placeholder="Name" value={newItem.name}
            onChange={e => setNewItem(n => ({ ...n, name: e.target.value }))} />
          {newItem.type === 'tag' && (
            <input type="color" className="input h-10 cursor-pointer" value={newItem.color || '#E91E8C'}
              onChange={e => setNewItem(n => ({ ...n, color: e.target.value }))} />
          )}
          <button onClick={handleCreate} disabled={!newItem.type || !newItem.name} className="btn-primary disabled:opacity-50">
            Erstellen
          </button>
        </div>
      </div>

      {/* Data Overview */}
      {data && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Document Types */}
          <div className="card p-5">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
              <FileText size={16} className="text-[var(--primary)]" /> Dokumententypen ({data.documentTypes.length})
            </h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {data.documentTypes.map((dt: any) => (
                <div key={dt.id} className="flex items-center justify-between text-sm py-1.5 border-b border-gray-100 dark:border-slate-700">
                  <span className="text-gray-700 dark:text-gray-300">{dt.name}</span>
                  {dt.paperlessId && <span className="text-xs text-gray-400">#{dt.paperlessId}</span>}
                </div>
              ))}
            </div>
          </div>

          {/* Correspondents */}
          <div className="card p-5">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
              <Users size={16} className="text-[var(--primary)]" /> Korrespondenten ({data.correspondents.length})
            </h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {data.correspondents.map((c: any) => (
                <div key={c.id} className="flex items-center justify-between text-sm py-1.5 border-b border-gray-100 dark:border-slate-700">
                  <span className="text-gray-700 dark:text-gray-300">{c.name}</span>
                  {c.paperlessId && <span className="text-xs text-gray-400">#{c.paperlessId}</span>}
                </div>
              ))}
            </div>
          </div>

          {/* Tags */}
          <div className="card p-5">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
              <Tag size={16} className="text-[var(--primary)]" /> Tags ({data.tags.length})
            </h3>
            <div className="flex flex-wrap gap-2 max-h-64 overflow-y-auto">
              {data.tags.map((t: any) => (
                <span key={t.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium text-white"
                  style={{ background: t.color || '#9CA3AF' }}>
                  {t.name}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
