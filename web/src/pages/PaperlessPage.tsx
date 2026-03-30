import React, { useState, useEffect } from 'react';
import { Save, RefreshCw, FileText, Users, Tag, Star } from 'lucide-react';
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

  const loadData = async (hid: string) => {
    const { data: d } = await paperlessAPI.getData(hid);
    setData(d);
  };

  useEffect(() => {
    if (!currentHousehold) return;
    paperlessAPI.getConfig(currentHousehold.id).then(({ data: d }) => {
      if (d.config) { setConfig({ baseUrl: d.config.baseUrl, apiToken: '' }); setConnected(true); }
    }).catch(() => {});
    loadData(currentHousehold.id).catch(() => {});
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
      await loadData(currentHousehold.id);
      toast.success(`Synchronisiert: ${d.synced.documentTypes} Typen, ${d.synced.correspondents} Korrespondenten, ${d.synced.tags} Tags`);
    } catch (err: any) {
      toast.error('Sync fehlgeschlagen: ' + (err.response?.data?.error || err.message));
    } finally { setSyncing(false); }
  };

  const toggleFavorite = async (type: string, id: string, current: boolean) => {
    if (!currentHousehold) return;
    try {
      await paperlessAPI.toggleFavorite({ type, id, isFavorite: !current });
      setData((prev: any) => {
        const key = type === 'doctype' ? 'documentTypes' : type === 'correspondent' ? 'correspondents' : 'tags';
        return { ...prev, [key]: prev[key].map((item: any) => item.id === id ? { ...item, isFavorite: !current } : item) };
      });
    } catch {
      toast.error('Fehler beim Speichern');
    }
  };

  const FavoriteList = ({ items, type, renderItem }: { items: any[], type: string, renderItem: (item: any) => React.ReactNode }) => (
    <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
      {items.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-4">Noch keine Daten — zuerst synchronisieren</p>
      )}
      {items.map((item: any) => (
        <div key={item.id} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700/50 group">
          <div className="flex-1 min-w-0">{renderItem(item)}</div>
          <button
            onClick={() => toggleFavorite(type, item.id, item.isFavorite)}
            className={`ml-2 shrink-0 transition-colors ${item.isFavorite ? 'text-yellow-400' : 'text-gray-300 hover:text-yellow-400'}`}
            title={item.isFavorite ? 'Aus Favoriten entfernen' : 'Als Favorit markieren'}
          >
            <Star size={15} fill={item.isFavorite ? 'currentColor' : 'none'} />
          </button>
        </div>
      ))}
    </div>
  );

  const favorites = data ? {
    documentTypes: data.documentTypes.filter((x: any) => x.isFavorite),
    correspondents: data.correspondents.filter((x: any) => x.isFavorite),
    tags: data.tags.filter((x: any) => x.isFavorite),
  } : null;

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Paperless-ngx Integration</h1>

      {/* Verbindung */}
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
            <button onClick={handleSync} disabled={syncing} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-100 dark:bg-slate-700 text-sm font-medium hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors">
              <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} />
              {syncing ? 'Synchronisiert...' : 'Von Paperless synchronisieren'}
            </button>
          )}
        </div>
        {connected && (
          <p className="text-xs text-gray-400 mt-2">
            Tipp: Synchronisiere zunächst alle Daten aus Paperless, dann markiere deine Favoriten mit ⭐ — diese stehen beim Quittungs-Upload zur Auswahl.
          </p>
        )}
      </div>

      {/* Favoriten-Übersicht */}
      {favorites && (favorites.documentTypes.length > 0 || favorites.correspondents.length > 0 || favorites.tags.length > 0) && (
        <div className="card p-5 border border-yellow-200 dark:border-yellow-800">
          <h2 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            <Star size={16} className="text-yellow-400" fill="currentColor" /> Aktive Favoriten
            <span className="text-xs text-gray-400 font-normal">(stehen beim Upload zur Auswahl)</span>
          </h2>
          <div className="flex flex-wrap gap-2">
            {favorites.documentTypes.map((x: any) => (
              <span key={x.id} className="px-2.5 py-1 rounded-full text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 flex items-center gap-1">
                <FileText size={10} /> {x.name}
              </span>
            ))}
            {favorites.correspondents.map((x: any) => (
              <span key={x.id} className="px-2.5 py-1 rounded-full text-xs bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 flex items-center gap-1">
                <Users size={10} /> {x.name}
              </span>
            ))}
            {favorites.tags.map((x: any) => (
              <span key={x.id} className="px-2.5 py-1 rounded-full text-xs text-white flex items-center gap-1"
                style={{ background: x.color || '#9CA3AF' }}>
                <Tag size={10} /> {x.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Alle Daten mit Stern-Buttons */}
      {data && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="card p-5">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
              <FileText size={16} className="text-[var(--primary)]" /> Dokumententypen
              <span className="text-xs text-gray-400 font-normal">({data.documentTypes.length})</span>
            </h3>
            <FavoriteList
              items={data.documentTypes}
              type="doctype"
              renderItem={(item) => (
                <span className="text-sm text-gray-700 dark:text-gray-300">{item.name}</span>
              )}
            />
          </div>

          <div className="card p-5">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
              <Users size={16} className="text-[var(--primary)]" /> Korrespondenten
              <span className="text-xs text-gray-400 font-normal">({data.correspondents.length})</span>
            </h3>
            <FavoriteList
              items={data.correspondents}
              type="correspondent"
              renderItem={(item) => (
                <span className="text-sm text-gray-700 dark:text-gray-300">{item.name}</span>
              )}
            />
          </div>

          <div className="card p-5">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
              <Tag size={16} className="text-[var(--primary)]" /> Tags
              <span className="text-xs text-gray-400 font-normal">({data.tags.length})</span>
            </h3>
            <FavoriteList
              items={data.tags}
              type="tag"
              renderItem={(item) => (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium text-white"
                  style={{ background: item.color || '#9CA3AF' }}>
                  {item.name}
                </span>
              )}
            />
          </div>
        </div>
      )}
    </div>
  );
}
