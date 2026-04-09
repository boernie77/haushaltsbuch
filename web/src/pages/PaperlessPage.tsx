import {
  AlertCircle,
  Check,
  FileText,
  Loader,
  Plus,
  RefreshCw,
  Save,
  Search,
  Star,
  Tag,
  UserCheck,
  Users,
  UserX,
} from "lucide-react";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { paperlessAPI } from "../services/api";
import { useAuthStore } from "../store/authStore";

export default function PaperlessPage() {
  const { currentHousehold } = useAuthStore();
  const [config, setConfig] = useState({ baseUrl: "", apiToken: "" });
  const [data, setData] = useState<any>(null);
  const [connected, setConnected] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState({
    doctype: "",
    correspondent: "",
    tag: "",
    user: "",
  });
  const [newItem, setNewItem] = useState({
    doctype: "",
    correspondent: "",
    tag: "",
    tagColor: "#6B7280",
  });
  const [checkResult, setCheckResult] = useState<
    Record<string, { exists: boolean; checking: boolean }>
  >({
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
    if (!currentHousehold) {
      return;
    }
    paperlessAPI
      .getConfig(currentHousehold.id)
      .then(({ data: d }) => {
        if (d.config) {
          setConfig({ baseUrl: d.config.baseUrl, apiToken: "" });
          setConnected(true);
        }
      })
      .catch(() => {});
    loadData(currentHousehold.id).catch(() => {});
  }, [currentHousehold]);

  const handleSave = async () => {
    if (!(config.baseUrl && config.apiToken && currentHousehold)) {
      return;
    }
    setSaving(true);
    try {
      await paperlessAPI.saveConfig({
        ...config,
        householdId: currentHousehold.id,
      });
      setConnected(true);
      toast.success("Paperless verbunden!");
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Verbindung fehlgeschlagen");
    } finally {
      setSaving(false);
    }
  };

  const handleSync = async () => {
    if (!currentHousehold) {
      return;
    }
    setSyncing(true);
    try {
      const { data: d } = await paperlessAPI.sync(currentHousehold.id);
      await loadData(currentHousehold.id);
      toast.success(
        `Synchronisiert: ${d.synced.documentTypes} Typen, ${d.synced.correspondents} Korrespondenten, ${d.synced.tags} Tags`
      );
    } catch (err: any) {
      toast.error(
        `Sync fehlgeschlagen: ${err.response?.data?.error || err.message}`
      );
    } finally {
      setSyncing(false);
    }
  };

  const toggleFavorite = async (type: string, id: string, current: boolean) => {
    if (!currentHousehold) {
      return;
    }
    try {
      await paperlessAPI.toggleFavorite({ type, id, isFavorite: !current });
      setData((prev: any) => {
        const key =
          type === "doctype"
            ? "documentTypes"
            : type === "correspondent"
              ? "correspondents"
              : "tags";
        return {
          ...prev,
          [key]: prev[key].map((item: any) =>
            item.id === id ? { ...item, isFavorite: !current } : item
          ),
        };
      });
    } catch {
      toast.error("Fehler beim Speichern");
    }
  };

  const toggleUserEnabled = async (id: string, current: boolean) => {
    if (!currentHousehold) {
      return;
    }
    try {
      await paperlessAPI.toggleFavorite({
        type: "user",
        id,
        isFavorite: !current,
        isEnabled: !current,
      } as any);
      setData((prev: any) => ({
        ...prev,
        users: (prev.users || []).map((u: any) =>
          u.id === id ? { ...u, isEnabled: !current } : u
        ),
      }));
    } catch {
      toast.error("Fehler beim Speichern");
    }
  };

  const handleNameChange = (
    type: "doctype" | "correspondent" | "tag",
    value: string
  ) => {
    setNewItem((n) => ({ ...n, [type]: value }));
    setCheckResult((r) => ({
      ...r,
      [type]: { exists: false, checking: !!value.trim() },
    }));
    clearTimeout(checkTimers.current[type]);
    if (!(value.trim() && currentHousehold)) {
      return;
    }
    checkTimers.current[type] = setTimeout(async () => {
      try {
        const { data: d } = await paperlessAPI.check(
          currentHousehold.id,
          type,
          value.trim()
        );
        setCheckResult((r) => ({
          ...r,
          [type]: { exists: d.exists, checking: false },
        }));
      } catch {
        setCheckResult((r) => ({
          ...r,
          [type]: { exists: false, checking: false },
        }));
      }
    }, 350);
  };

  const handleCreate = async (type: "doctype" | "correspondent" | "tag") => {
    if (!(currentHousehold && newItem[type].trim())) {
      return;
    }
    setCreating((c) => ({ ...c, [type]: true }));
    try {
      if (type === "doctype") {
        await paperlessAPI.createDocType({
          householdId: currentHousehold.id,
          name: newItem[type].trim(),
        });
      } else if (type === "correspondent") {
        await paperlessAPI.createCorrespondent({
          householdId: currentHousehold.id,
          name: newItem[type].trim(),
        });
      } else {
        await paperlessAPI.createTag({
          householdId: currentHousehold.id,
          name: newItem[type].trim(),
          color: newItem.tagColor,
        });
      }
      setNewItem((n) => ({ ...n, [type]: "" }));
      setCheckResult((r) => ({
        ...r,
        [type]: { exists: false, checking: false },
      }));
      await loadData(currentHousehold.id);
      toast.success("Erstellt!");
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Fehler beim Erstellen");
    } finally {
      setCreating((c) => ({ ...c, [type]: false }));
    }
  };

  const renderCreateForm = (
    type: "doctype" | "correspondent" | "tag",
    placeholder: string,
    extra?: React.ReactNode
  ) => {
    const cr = checkResult[type];
    const val = newItem[type];
    return (
      <div className="mt-3 border-gray-100 border-t pt-3 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              className="input py-1.5 pr-8 text-sm"
              onChange={(e) => handleNameChange(type, e.target.value)}
              onKeyDown={(e) =>
                e.key === "Enter" &&
                !cr.exists &&
                val.trim() &&
                handleCreate(type)
              }
              placeholder={placeholder}
              type="text"
              value={val}
            />
            {val.trim() && (
              <span className="absolute top-1/2 right-2 -translate-y-1/2">
                {cr.checking ? (
                  <Loader className="animate-spin text-gray-400" size={13} />
                ) : cr.exists ? (
                  <AlertCircle className="text-amber-500" size={13} />
                ) : (
                  <Check className="text-green-500" size={13} />
                )}
              </span>
            )}
          </div>
          {extra}
          <button
            className="flex shrink-0 items-center gap-1 rounded-xl bg-[var(--primary)] px-3 py-1.5 font-medium text-white text-xs transition-opacity hover:opacity-90 disabled:opacity-40"
            disabled={!val.trim() || cr.exists || cr.checking || creating[type]}
            onClick={() => handleCreate(type)}
          >
            {creating[type] ? (
              <Loader className="animate-spin" size={12} />
            ) : (
              <Plus size={12} />
            )}
            {cr.exists ? "Existiert" : "Erstellen"}
          </button>
        </div>
        {val.trim() && cr.exists && (
          <p className="mt-1 flex items-center gap-1 text-amber-600 text-xs">
            <AlertCircle size={11} /> Bereits vorhanden — wird beim Speichern
            verknüpft statt neu angelegt.
          </p>
        )}
      </div>
    );
  };

  const renderFavoriteList = (
    items: any[],
    type: string,
    searchKey: keyof typeof search,
    renderItem: (item: any) => React.ReactNode
  ) => {
    const q = search[searchKey].toLowerCase();
    const filtered = q
      ? items.filter((i: any) => i.name.toLowerCase().includes(q))
      : items;
    return (
      <>
        <div className="relative mb-2">
          <Search
            className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400"
            size={13}
          />
          <input
            className="input py-1.5 text-sm"
            onChange={(e) =>
              setSearch((s) => ({ ...s, [searchKey]: e.target.value }))
            }
            placeholder="Suchen..."
            style={{ paddingLeft: "2rem" }}
            type="text"
            value={search[searchKey]}
          />
        </div>
        <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
          {filtered.length === 0 && (
            <p className="py-4 text-center text-gray-400 text-sm">
              {q
                ? "Keine Treffer"
                : "Noch keine Daten — zuerst synchronisieren"}
            </p>
          )}
          {filtered.map((item: any) => (
            <div
              className="group flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-slate-700/50"
              key={item.id}
            >
              <div className="min-w-0 flex-1">{renderItem(item)}</div>
              <button
                className={`ml-2 shrink-0 transition-colors ${item.isFavorite ? "text-yellow-400" : "text-gray-300 hover:text-yellow-400"}`}
                onClick={() => toggleFavorite(type, item.id, item.isFavorite)}
                title={
                  item.isFavorite
                    ? "Aus Favoriten entfernen"
                    : "Als Favorit markieren"
                }
              >
                <Star
                  fill={item.isFavorite ? "currentColor" : "none"}
                  size={15}
                />
              </button>
            </div>
          ))}
        </div>
      </>
    );
  };

  const favorites = data
    ? {
        documentTypes: data.documentTypes.filter((x: any) => x.isFavorite),
        correspondents: data.correspondents.filter((x: any) => x.isFavorite),
        tags: data.tags.filter((x: any) => x.isFavorite),
      }
    : null;

  return (
    <div className="space-y-6 p-6">
      <h1 className="font-bold text-2xl text-gray-900 dark:text-white">
        Paperless-ngx Integration
      </h1>

      {/* Verbindung */}
      <div className="card p-6">
        <h2 className="mb-4 flex items-center gap-2 font-semibold text-gray-900 dark:text-white">
          <FileText className="text-[var(--primary)]" size={18} /> Verbindung
          {connected && (
            <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-green-700 text-xs">
              ● Verbunden
            </span>
          )}
        </h2>
        <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block font-medium text-gray-700 text-sm dark:text-gray-300">
              Paperless URL
            </label>
            <input
              className="input"
              onChange={(e) =>
                setConfig((c) => ({ ...c, baseUrl: e.target.value }))
              }
              placeholder="https://paperless.example.com"
              type="url"
              value={config.baseUrl}
            />
          </div>
          <div>
            <label className="mb-1 block font-medium text-gray-700 text-sm dark:text-gray-300">
              API Token
            </label>
            <input
              className="input"
              onChange={(e) =>
                setConfig((c) => ({ ...c, apiToken: e.target.value }))
              }
              placeholder="Token aus Paperless Einstellungen"
              type="password"
              value={config.apiToken}
            />
          </div>
        </div>
        <div className="flex gap-3">
          <button
            className="btn-primary flex items-center gap-2"
            disabled={saving}
            onClick={handleSave}
          >
            <Save size={16} /> {saving ? "Speichert..." : "Verbinden"}
          </button>
          {connected && (
            <button
              className="flex items-center gap-2 rounded-xl bg-gray-100 px-4 py-2 font-medium text-sm transition-colors hover:bg-gray-200 dark:bg-slate-700 dark:hover:bg-slate-600"
              disabled={syncing}
              onClick={handleSync}
            >
              <RefreshCw className={syncing ? "animate-spin" : ""} size={16} />
              {syncing ? "Synchronisiert..." : "Von Paperless synchronisieren"}
            </button>
          )}
        </div>
        {connected && (
          <p className="mt-2 text-gray-400 text-xs">
            Tipp: Synchronisiere zunächst alle Daten aus Paperless, dann
            markiere deine Favoriten mit ⭐ — diese stehen beim Quittungs-Upload
            zur Auswahl.
          </p>
        )}
      </div>

      {/* Favoriten-Übersicht */}
      {favorites &&
        (favorites.documentTypes.length > 0 ||
          favorites.correspondents.length > 0 ||
          favorites.tags.length > 0) && (
          <div className="card border border-yellow-200 p-5 dark:border-yellow-800">
            <h2 className="mb-3 flex items-center gap-2 font-semibold text-gray-900 dark:text-white">
              <Star className="text-yellow-400" fill="currentColor" size={16} />{" "}
              Aktive Favoriten
              <span className="font-normal text-gray-400 text-xs">
                (stehen beim Upload zur Auswahl)
              </span>
            </h2>
            <div className="flex flex-wrap gap-2">
              {favorites.documentTypes.map((x: any) => (
                <span
                  className="flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-1 text-blue-700 text-xs dark:bg-blue-900/40 dark:text-blue-300"
                  key={x.id}
                >
                  <FileText size={10} /> {x.name}
                </span>
              ))}
              {favorites.correspondents.map((x: any) => (
                <span
                  className="flex items-center gap-1 rounded-full bg-purple-100 px-2.5 py-1 text-purple-700 text-xs dark:bg-purple-900/40 dark:text-purple-300"
                  key={x.id}
                >
                  <Users size={10} /> {x.name}
                </span>
              ))}
              {favorites.tags.map((x: any) => (
                <span
                  className="flex items-center gap-1 rounded-full px-2.5 py-1 text-white text-xs"
                  key={x.id}
                  style={{ background: x.color || "#9CA3AF" }}
                >
                  <Tag size={10} /> {x.name}
                </span>
              ))}
            </div>
          </div>
        )}

      {/* Alle Daten mit Stern-Buttons */}
      {data && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <div className="card p-5">
            <h3 className="mb-3 flex items-center gap-2 font-semibold text-gray-900 dark:text-white">
              <FileText className="text-[var(--primary)]" size={16} />{" "}
              Dokumententypen
              <span className="font-normal text-gray-400 text-xs">
                ({data.documentTypes.length})
              </span>
            </h3>
            {renderFavoriteList(
              data.documentTypes,
              "doctype",
              "doctype",
              (item) => (
                <span className="text-gray-700 text-sm dark:text-gray-300">
                  {item.name}
                </span>
              )
            )}
            {connected && renderCreateForm("doctype", "Neuer Dokumententyp...")}
          </div>

          <div className="card p-5">
            <h3 className="mb-3 flex items-center gap-2 font-semibold text-gray-900 dark:text-white">
              <Users className="text-[var(--primary)]" size={16} />{" "}
              Korrespondenten
              <span className="font-normal text-gray-400 text-xs">
                ({data.correspondents.length})
              </span>
            </h3>
            {renderFavoriteList(
              data.correspondents,
              "correspondent",
              "correspondent",
              (item) => (
                <span className="text-gray-700 text-sm dark:text-gray-300">
                  {item.name}
                </span>
              )
            )}
            {connected &&
              renderCreateForm("correspondent", "Neuer Korrespondent...")}
          </div>

          <div className="card p-5">
            <h3 className="mb-3 flex items-center gap-2 font-semibold text-gray-900 dark:text-white">
              <Tag className="text-[var(--primary)]" size={16} /> Tags
              <span className="font-normal text-gray-400 text-xs">
                ({data.tags.length})
              </span>
            </h3>
            {renderFavoriteList(data.tags, "tag", "tag", (item) => (
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-medium text-white text-xs"
                style={{ background: item.color || "#9CA3AF" }}
              >
                {item.name}
              </span>
            ))}
            {connected &&
              renderCreateForm(
                "tag",
                "Neuer Tag...",
                <input
                  className="h-8 w-8 shrink-0 cursor-pointer rounded border border-gray-200 dark:border-slate-600"
                  onChange={(e) =>
                    setNewItem((n) => ({ ...n, tagColor: e.target.value }))
                  }
                  title="Farbe wählen"
                  type="color"
                  value={newItem.tagColor}
                />
              )}
          </div>
        </div>
      )}

      {/* Paperless-Benutzer */}
      {data?.users && data.users.length > 0 && (
        <div className="card p-5">
          <h3 className="mb-1 flex items-center gap-2 font-semibold text-gray-900 dark:text-white">
            <Users className="text-[var(--primary)]" size={16} />{" "}
            Paperless-Benutzer
            <span className="font-normal text-gray-400 text-xs">
              ({data.users.length})
            </span>
          </h3>
          <p className="mb-3 text-gray-400 text-xs">
            Deaktivierte Benutzer stehen beim Upload nicht zur Auswahl (z.B.
            Admin-Konten).
          </p>
          <div className="relative mb-2">
            <Search
              className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400"
              size={13}
            />
            <input
              className="input py-1.5 text-sm"
              onChange={(e) =>
                setSearch((s) => ({ ...s, user: e.target.value }))
              }
              placeholder="Suchen..."
              style={{ paddingLeft: "2rem" }}
              type="text"
              value={search.user}
            />
          </div>
          <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
            {data.users
              .filter(
                (u: any) =>
                  !search.user ||
                  u.fullName
                    ?.toLowerCase()
                    .includes(search.user.toLowerCase()) ||
                  u.username?.toLowerCase().includes(search.user.toLowerCase())
              )
              .map((u: any) => (
                <div
                  className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-slate-700/50"
                  key={u.id}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <span
                      className={`text-sm ${u.isEnabled ? "text-gray-700 dark:text-gray-300" : "text-gray-400 line-through"}`}
                    >
                      {u.fullName || u.username}
                    </span>
                    {u.fullName && u.username !== u.fullName && (
                      <span className="text-gray-400 text-xs">
                        @{u.username}
                      </span>
                    )}
                  </div>
                  <button
                    className={`ml-2 shrink-0 transition-colors ${u.isEnabled ? "text-green-500 hover:text-red-400" : "text-gray-300 hover:text-green-500"}`}
                    onClick={() => toggleUserEnabled(u.id, u.isEnabled)}
                    title={
                      u.isEnabled
                        ? "Deaktivieren (nicht mehr zur Auswahl)"
                        : "Aktivieren (zur Auswahl beim Upload)"
                    }
                  >
                    {u.isEnabled ? (
                      <UserCheck size={16} />
                    ) : (
                      <UserX size={16} />
                    )}
                  </button>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
