import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Save, RefreshCw, FileText, Users, Tag, Star, Search, UserCheck, UserX, Plus, Check, AlertCircle, Loader } from 'lucide-react';
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
  const [search, setSearch] = useState({ doctype: '', correspondent: '', tag: '', user: '' });
  const [newItem, setNewItem] = useState({ doctype: '', correspondent: '', tag: '', tagColor: '#6B7280' });
  const [checkResult, setCheckResult] = useState<Record<string, { exists: boolean; checking: boolean }>>({
    doctype: { exists: false, checking: false },
    correspondent: { exists: false, checking: false },
    tag: { exists: false, checking: false },
  });
  const checkTimers = useRef<Record<string, any>>({});
  const [creating, setCreating] = useState<Record<string, boolean>>({});

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

  const toggleUserEnabled = async (id: string, current: boolean) => {
    if (!currentHousehold) return;
    try {
      await paperlessAPI.toggleFavorite({ type: 'user', id, isFavorite: !current, isEnabled: !current } as any);
      setData((prev: any) => ({
        ...prev,
        users: (prev.users || []).map((u: any) => u.id === id ? { ...u, isEnabled: !current } : u),
      }));
    } catch {
      toast.error('Fehler beim Speichern');
    }
  };

  const handleNameChange = (type: 'doctype' | 'correspondent' | 'tag', value: string) => {
    setNewItem(n => ({ ...n, [type]: value }));
    setCheckResult(r => ({ ...r, [type]: { exists: false, checking: !!value.trim() } }));
    clearTimeout(checkTimers.current[type]);
    if (!value.trim() || !currentHousehold) return;
    checkTimers.current[type] = setTimeout(async () => {
      try {
        const { data: d } = await paperlessAPI.check(currentHousehold.id, type, value.trim());
        setCheckResult(r => ({ ...r, [type]: { exists: d.exists, checking: false } }));
      } catch {
        setCheckResult(r => ({ ...r, [type]: { exists: false, checking: false } }));
      }
    }, 350);
  };

  const handleCreate = async (type: 'doctype' | 'correspondent' | 'tag') => {
    if (!currentHousehold || !newItem[type].trim()) return;
    setCreating(c => ({ ...c, [type]: true }));
    try {
      if (type === 'doctype') await paperlessAPI.createDocType({ householdId: currentHousehold.id, name: newItem[type].trim() });
      else if (type === 'correspondent') await paperlessAPI.createCorrespondent({ householdId: currentHousehold.id, name: newItem[type].trim() });
      else await paperlessAPI.createTag({ householdId: currentHousehold.id, name: newItem[type].trim(), color: newItem.tagColor });
      setNewItem(n => ({ ...n, [type]: '' }));
      setCheckResult(r => ({ ...r, [type]: { exists: false, checking: false } }));
      await loadData(currentHousehold.id);
      toast.success('Erstellt!');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Fehler beim Erstellen');
    } finally {
      setCreating(c => ({ ...c, [type]: false }));
    }
  };

  const CreateForm = ({ type, placeholder, extra }: { type: 'doctype' | 'correspondent' | 'tag'; placeholder: string; extra?: React.ReactNode }) => {
    const cr = checkResult[type];
    const val = newItem[type];
    return (
      <div className="mt-3 pt-3 border-t border-gray-100 dark:border-slate-700">
        <div className="flex gap-2 items-center">
          <div className="relative flex-1">
            <input
              type="text"
              className="input py-1.5 text-sm pr-8"
              placeholder={placeholder}
              value={val}
              onChange={e => handleNameChange(type, e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !cr.exists && val.trim() && handleCreate(type)}
            />
            {val.trim() && (
              <span className="absolute right-2 top-1/2 -translate-y-1/2">
                {cr.checking ? <Loader size={13} className="animate-spin text-gray-400" /> :
                  cr.exists ? <AlertCircle size={13} className="text-amber-500" /> :
                  <Check size={13} className="text-green-500" />}
              </span>
            )}
          </div>
          {extra}
          <button
            onClick={() => handleCreate(type)}
            disabled={!val.trim() || cr.exists || cr.checking || creating[type]}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[var(--primary)] text-white text-xs font-medium disabled:opacity-40 hover:opacity-90 transition-opacity shrink-0"
          >
            {creating[type] ? <Loader size={12} className="animate-spin" /> : <Plus size={12} />}
            {cr.exists ? 'Existiert' : 'Erstellen'}
          </button>
        </div>
        {val.trim() && cr.exists && (
          <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
            <AlertCircle size={11} /> Bereits vorhanden — wird beim Speichern verknüpft statt neu angelegt.
          </p>
        )}
      </div>
    );
  };

  const FavoriteList = ({ items, type, searchKey, renderItem }: { items: any[], type: string, searchKey: keyof typeof search, renderItem: (item: any) => React.ReactNode }) => {
    const q = search[searchKey].toLowerCase();
    const filtered = q ? items.filter((i: any) => i.name.toLowerCase().includes(q)) : items;
    return (<>
      <div className="relative mb-2">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          className="input pl-7 py-1.5 text-sm"
          placeholder="Suchen..."
          value={search[searchKey]}
          onChange={e => setSearch(s => ({ ...s, [searchKey]: e.target.value }))}
        />
      </div>
      <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
      {filtered.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-4">{q ? 'Keine Treffer' : 'Noch keine Daten — zuerst synchronisieren'}</p>
      )}
      {filtered.map((item: any) => (
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
    </>);
  };

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
              searchKey="doctype"
              renderItem={(item) => (
                <span className="text-sm text-gray-700 dark:text-gray-300">{item.name}</span>
              )}
            />
            {connected && <CreateForm type="doctype" placeholder="Neuer Dokumententyp..." />}
          </div>

          <div className="card p-5">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
              <Users size={16} className="text-[var(--primary)]" /> Korrespondenten
              <span className="text-xs text-gray-400 font-normal">({data.correspondents.length})</span>
            </h3>
            <FavoriteList
              items={data.correspondents}
              type="correspondent"
              searchKey="correspondent"
              renderItem={(item) => (
                <span className="text-sm text-gray-700 dark:text-gray-300">{item.name}</span>
              )}
            />
            {connected && <CreateForm type="correspondent" placeholder="Neuer Absender..." />}
          </div>

          <div className="card p-5">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
              <Tag size={16} className="text-[var(--primary)]" /> Tags
              <span className="text-xs text-gray-400 font-normal">({data.tags.length})</span>
            </h3>
            <FavoriteList
              items={data.tags}
              type="tag"
              searchKey="tag"
              renderItem={(item) => (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium text-white"
                  style={{ background: item.color || '#9CA3AF' }}>
                  {item.name}
                </span>
              )}
            />
            {connected && (
              <CreateForm type="tag" placeholder="Neuer Tag..." extra={
                <input type="color" value={newItem.tagColor} onChange={e => setNewItem(n => ({ ...n, tagColor: e.target.value }))}
                  className="w-8 h-8 rounded cursor-pointer border border-gray-200 dark:border-slate-600 shrink-0" title="Farbe wählen" />
              } />
            )}
          </div>
        </div>
      )}

      {/* Paperless-Benutzer */}
      {data && data.users && data.users.length > 0 && (
        <div className="card p-5">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-1 flex items-center gap-2">
            <Users size={16} className="text-[var(--primary)]" /> Paperless-Benutzer
            <span className="text-xs text-gray-400 font-normal">({data.users.length})</span>
          </h3>
          <p className="text-xs text-gray-400 mb-3">Deaktivierte Benutzer stehen beim Upload nicht zur Auswahl (z.B. Admin-Konten).</p>
          <div className="relative mb-2">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" className="input pl-7 py-1.5 text-sm" placeholder="Suchen..."
              value={search.user} onChange={e => setSearch(s => ({ ...s, user: e.target.value }))} />
          </div>
          <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
            {data.users
              .filter((u: any) => !search.user || u.fullName?.toLowerCase().includes(search.user.toLowerCase()) || u.username?.toLowerCase().includes(search.user.toLowerCase()))
              .map((u: any) => (
                <div key={u.id} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700/50">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className={`text-sm ${u.isEnabled ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400 line-through'}`}>
                      {u.fullName || u.username}
                    </span>
                    {u.fullName && u.username !== u.fullName && (
                      <span className="text-xs text-gray-400">@{u.username}</span>
                    )}
                  </div>
                  <button
                    onClick={() => toggleUserEnabled(u.id, u.isEnabled)}
                    className={`ml-2 shrink-0 transition-colors ${u.isEnabled ? 'text-green-500 hover:text-red-400' : 'text-gray-300 hover:text-green-500'}`}
                    title={u.isEnabled ? 'Deaktivieren (nicht mehr zur Auswahl)' : 'Aktivieren (zur Auswahl beim Upload)'}
                  >
                    {u.isEnabled ? <UserCheck size={16} /> : <UserX size={16} />}
                  </button>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
