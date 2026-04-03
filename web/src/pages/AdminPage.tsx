import { format } from "date-fns";
import {
  BarChart2,
  Bot,
  Copy,
  CreditCard,
  Database,
  Eye,
  EyeOff,
  Globe,
  Home,
  Key,
  Play,
  Plus,
  RefreshCw,
  Search,
  Shield,
  Trash2,
  Users,
  Wifi,
} from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { adminAPI } from "../services/api";
import { useAuthStore } from "../store/authStore";

export default function AdminPage() {
  const { user } = useAuthStore();
  const [tab, setTab] = useState<
    "stats" | "users" | "households" | "invites" | "ai" | "backup"
  >("stats");
  const [stats, setStats] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [households, setHouseholds] = useState<any[]>([]);
  const [inviteCodes, setInviteCodes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // AI settings state
  const [aiSettings, setAiSettings] = useState<{
    hasApiKey: boolean;
    maskedApiKey: string | null;
    aiKeyPublic: boolean;
  }>({ hasApiKey: false, maskedApiKey: null, aiKeyPublic: false });
  const [aiKeyInput, setAiKeyInput] = useState("");
  const [showAiKey, setShowAiKey] = useState(false);
  const [aiSaving, setAiSaving] = useState(false);

  // Backup state
  const [backupConfig, setBackupConfig] = useState<any>(null);
  const [backupForm, setBackupForm] = useState({
    sftpHost: "",
    sftpPort: "22",
    sftpUser: "",
    sftpPassword: "",
    sftpPath: "/backups",
    scheduleLabel: "daily",
    isActive: false,
  });
  const [showSftpPw, setShowSftpPw] = useState(false);
  const [backupSaving, setBackupSaving] = useState(false);
  const [backupTesting, setBackupTesting] = useState(false);
  const [backupRunning, setBackupRunning] = useState(false);
  const [sshPublicKey, setSshPublicKey] = useState<string | null>(null);
  const [sshKeyLoading, setSshKeyLoading] = useState(false);
  const [sshKeyRegenerating, setSshKeyRegenerating] = useState(false);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restorePreview, setRestorePreview] = useState<any>(null);
  const [restorePreviewing, setRestorePreviewing] = useState(false);
  const [restoreConfirmText, setRestoreConfirmText] = useState("");
  const [restoring, setRestoring] = useState(false);
  const [householdSearch, setHouseholdSearch] = useState("");
  const [userSearch, setUserSearch] = useState("");

  const SCHEDULES: Record<string, { label: string; cron: string }> = {
    daily: { label: "Täglich (02:00)", cron: "0 2 * * *" },
    weekly: { label: "Wöchentlich (So, 02:00)", cron: "0 2 * * 0" },
    monthly: { label: "Monatlich (1., 02:00)", cron: "0 2 1 * *" },
    disabled: { label: "Deaktiviert", cron: "" },
  };

  const hasAccess = user?.role === "superadmin" || user?.role === "admin";

  useEffect(() => {
    setLoading(true);
    Promise.all([
      adminAPI.getStats(),
      adminAPI.getUsers(),
      adminAPI.getHouseholds(),
      adminAPI.getInviteCodes(),
      adminAPI.getAiSettings(),
      adminAPI.getBackupConfig(),
    ])
      .then(([s, u, h, i, ai, bk]) => {
        setStats(s.data);
        setUsers(u.data.users);
        setHouseholds(h.data.households);
        setInviteCodes(i.data.codes);
        setAiSettings(ai.data);
        if (bk.data.hasConfig) {
          const c = bk.data.config;
          setBackupConfig(c);
          setBackupForm({
            sftpHost: c.sftpHost || "",
            sftpPort: String(c.sftpPort || 22),
            sftpUser: c.sftpUser || "",
            sftpPassword: "",
            sftpPath: c.sftpPath || "/backups",
            scheduleLabel: c.scheduleLabel || "daily",
            isActive: c.isActive,
          });
        }
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (tab === "backup") {
      loadSshKey();
    }
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadSshKey = async () => {
    if (sshPublicKey) {
      return;
    }
    setSshKeyLoading(true);
    try {
      const { data } = await adminAPI.getSshPublicKey();
      setSshPublicKey(data.publicKey);
    } catch {
      toast.error("SSH-Key konnte nicht geladen werden");
    } finally {
      setSshKeyLoading(false);
    }
  };

  const handleRestoreFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0] || null;
    setRestoreFile(file);
    setRestorePreview(null);
    setRestoreConfirmText("");
    if (!file) {
      return;
    }
    setRestorePreviewing(true);
    try {
      const { data } = await adminAPI.previewRestore(file);
      setRestorePreview(data);
    } catch (err: any) {
      toast.error(
        err.response?.data?.error || "Datei konnte nicht gelesen werden"
      );
      setRestoreFile(null);
    } finally {
      setRestorePreviewing(false);
    }
  };

  const handleRestore = async () => {
    if (!restoreFile) {
      return;
    }
    setRestoring(true);
    try {
      const { data } = await adminAPI.restoreBackup(restoreFile);
      toast.success(
        `Wiederherstellung abgeschlossen: ${data.restored.transactions} Buchungen, ${data.restored.users} Benutzer`
      );
      setRestoreFile(null);
      setRestorePreview(null);
      setRestoreConfirmText("");
      // Reload page data
      window.location.reload();
    } catch (err: any) {
      toast.error(
        err.response?.data?.error || "Wiederherstellung fehlgeschlagen"
      );
    } finally {
      setRestoring(false);
    }
  };

  const handleRegenerateSshKey = async () => {
    if (
      !confirm(
        "Wirklich einen neuen SSH-Key generieren? Der alte Key wird danach nicht mehr funktionieren — du musst den neuen Key auf deinem Homeserver eintragen."
      )
    ) {
      return;
    }
    setSshKeyRegenerating(true);
    try {
      const { data } = await adminAPI.regenerateSshKey();
      setSshPublicKey(data.publicKey);
      toast.success(
        "Neuer SSH-Key generiert — bitte auf dem Homeserver eintragen!"
      );
    } catch {
      toast.error("Fehler beim Generieren");
    } finally {
      setSshKeyRegenerating(false);
    }
  };

  const handleSaveAiSettings = async () => {
    setAiSaving(true);
    try {
      const { data } = await adminAPI.saveAiSettings({
        apiKey: aiKeyInput,
        aiKeyPublic: aiSettings.aiKeyPublic,
      });
      setAiSettings(data);
      setAiKeyInput("");
      toast.success("KI-Einstellungen gespeichert");
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Fehler beim Speichern");
    } finally {
      setAiSaving(false);
    }
  };

  const handleDeleteAiKey = async () => {
    if (!confirm("Globalen API-Key wirklich löschen?")) {
      return;
    }
    try {
      const { data } = await adminAPI.saveAiSettings({
        apiKey: "",
        aiKeyPublic: false,
      });
      setAiSettings(data);
      setAiKeyInput("");
      toast.success("Key gelöscht");
    } catch {
      toast.error("Fehler");
    }
  };

  const handleToggleAiGrant = async (u: any) => {
    try {
      const { data } = await adminAPI.toggleAiGrant(u.id);
      setUsers((prev) =>
        prev.map((x) =>
          x.id === u.id ? { ...x, aiKeyGranted: data.user.aiKeyGranted } : x
        )
      );
      toast.success(
        data.user.aiKeyGranted ? "KI-Zugriff gewährt" : "KI-Zugriff entzogen"
      );
    } catch {
      toast.error("Fehler");
    }
  };

  const handleToggleUser = async (u: any) => {
    try {
      await adminAPI.updateUser(u.id, { isActive: !u.isActive });
      setUsers((prev) =>
        prev.map((x) => (x.id === u.id ? { ...x, isActive: !x.isActive } : x))
      );
      toast.success(u.isActive ? "Benutzer deaktiviert" : "Benutzer aktiviert");
    } catch {
      toast.error("Fehler");
    }
  };

  const handleDeleteUser = async (id: string) => {
    if (!confirm("Benutzer wirklich löschen?")) {
      return;
    }
    try {
      await adminAPI.deleteUser(id);
      setUsers((prev) => prev.filter((u) => u.id !== id));
      toast.success("Gelöscht");
    } catch {
      toast.error("Fehler");
    }
  };

  const handleToggleSubscription = async (u: any) => {
    const next = !u.subscriptionActive;
    try {
      const { data } = await adminAPI.setSubscription(u.id, next);
      setUsers((prev) =>
        prev.map((x) =>
          x.id === u.id
            ? {
                ...x,
                subscriptionActive: data.user.subscriptionActive,
                isActive: data.user.isActive,
              }
            : x
        )
      );
      toast.success(next ? "Abo aktiviert" : "Abo deaktiviert");
    } catch {
      toast.error("Fehler");
    }
  };

  const handleCreateInvite = async () => {
    try {
      const { data } = await adminAPI.createInviteCode({
        maxUses: 1,
        expiresIn: 24 * 30,
      });
      setInviteCodes((prev) => [data.invite, ...prev]);
      navigator.clipboard?.writeText(data.invite.code);
      toast.success(`Code erstellt & kopiert: ${data.invite.code}`);
    } catch {
      toast.error("Fehler");
    }
  };

  const handleSaveBackup = async () => {
    setBackupSaving(true);
    try {
      const sched = SCHEDULES[backupForm.scheduleLabel] ?? SCHEDULES.disabled;
      const { data } = await adminAPI.saveBackupConfig({
        ...backupForm,
        sftpPort: Number.parseInt(backupForm.sftpPort, 10) || 22,
        schedule: sched.cron,
        isActive:
          backupForm.scheduleLabel !== "disabled" && backupForm.isActive,
      });
      setBackupConfig(data.config);
      setBackupForm((f) => ({ ...f, sftpPassword: "" }));
      toast.success("Backup-Einstellungen gespeichert");
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Fehler");
    } finally {
      setBackupSaving(false);
    }
  };

  const handleTestBackup = async () => {
    setBackupTesting(true);
    try {
      const { data } = await adminAPI.testBackup({
        ...backupForm,
        sftpPort: Number.parseInt(backupForm.sftpPort, 10) || 22,
      });
      toast.success(data.message);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Verbindung fehlgeschlagen");
    } finally {
      setBackupTesting(false);
    }
  };

  const handleRunBackup = async () => {
    if (!confirm("Backup jetzt ausführen?")) {
      return;
    }
    setBackupRunning(true);
    try {
      const { data } = await adminAPI.runBackup();
      toast.success(data.message);
      const { data: bk } = await adminAPI.getBackupConfig();
      if (bk.hasConfig) {
        setBackupConfig(bk.config);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Backup fehlgeschlagen");
    } finally {
      setBackupRunning(false);
    }
  };

  const tabs = [
    { id: "stats", label: "Übersicht", icon: BarChart2 },
    { id: "users", label: `Benutzer (${users.length})`, icon: Users },
    {
      id: "households",
      label: `Haushaltsbücher (${households.length})`,
      icon: Home,
    },
    { id: "invites", label: "Einladungen", icon: Shield },
    { id: "ai", label: "KI-Verwaltung", icon: Bot },
    { id: "backup", label: "Backup", icon: Database },
  ];

  if (!hasAccess) {
    return (
      <div className="flex h-full items-center justify-center text-gray-500">
        Kein Zugriff
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <h1 className="flex items-center gap-3 font-bold text-2xl text-gray-900 dark:text-white">
        <Shield className="text-[var(--primary)]" /> Administration
      </h1>

      {/* Tabs */}
      <div className="flex gap-2 border-gray-200 border-b dark:border-slate-700">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 font-medium text-sm transition-all ${
              tab === id
                ? "border-[var(--primary)] text-[var(--primary)]"
                : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
            key={id}
            onClick={() => setTab(id as any)}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-[var(--primary)] border-b-2" />
        </div>
      ) : (
        <>
          {tab === "stats" && stats && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {[
                {
                  label: "Benutzer gesamt",
                  value: stats.userCount,
                  icon: Users,
                },
                {
                  label: "Haushaltsbücher",
                  value: stats.householdCount,
                  icon: Home,
                },
                {
                  label: "Buchungen",
                  value: stats.transactionCount,
                  icon: BarChart2,
                },
              ].map(({ label, value, icon: Icon }) => (
                <div className="card flex items-center gap-4 p-5" key={label}>
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--primary)]/10">
                    <Icon className="text-[var(--primary)]" size={22} />
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs uppercase">{label}</p>
                    <p className="font-bold text-3xl text-gray-900 dark:text-white">
                      {value}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === "users" && (
            <div className="space-y-4">
              <div className="relative">
                <Search
                  className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400"
                  size={16}
                />
                <input
                  className="input w-full"
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Benutzer suchen (Name, E-Mail)..."
                  style={{ paddingLeft: "2.25rem" }}
                  value={userSearch}
                />
              </div>
              <div className="card overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-slate-700">
                    <tr>
                      {[
                        "Name",
                        "E-Mail",
                        "Registriert / Testabo",
                        "Rolle",
                        "Status",
                        "Abonnement",
                        "KI-Zugriff",
                        "",
                      ].map((h) => (
                        <th
                          className="px-4 py-3 text-left font-semibold text-gray-500 text-xs uppercase tracking-wide"
                          key={h}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                    {users
                      .filter((u) => {
                        if (!userSearch) {
                          return true;
                        }
                        const q = userSearch.toLowerCase();
                        return (
                          u.name?.toLowerCase().includes(q) ||
                          u.email?.toLowerCase().includes(q)
                        );
                      })
                      .map((u) => (
                        <tr
                          className="hover:bg-pink-50/50 dark:hover:bg-slate-700/50"
                          key={u.id}
                        >
                          <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                            {u.name}
                          </td>
                          <td className="px-4 py-3 text-gray-600 text-sm dark:text-gray-400">
                            {u.email}
                          </td>
                          <td className="px-4 py-3 text-gray-600 text-xs dark:text-gray-400">
                            <div>
                              {u.inviteUsedAt
                                ? format(new Date(u.inviteUsedAt), "dd.MM.yyyy")
                                : u.createdAt
                                  ? format(new Date(u.createdAt), "dd.MM.yyyy")
                                  : "—"}
                            </div>
                            {u.trialEndsAt &&
                              !u.subscriptionActive &&
                              (() => {
                                const daysLeft = Math.ceil(
                                  (new Date(u.trialEndsAt).getTime() -
                                    Date.now()) /
                                    (1000 * 60 * 60 * 24)
                                );
                                return (
                                  <div
                                    className={`text-xs ${daysLeft <= 2 ? "font-semibold text-red-500" : daysLeft <= 5 ? "font-semibold text-orange-500" : "text-gray-400"}`}
                                  >
                                    {daysLeft > 0
                                      ? `noch ${daysLeft} Tag${daysLeft === 1 ? "" : "e"}`
                                      : "abgelaufen"}{" "}
                                    (
                                    {format(
                                      new Date(u.trialEndsAt),
                                      "dd.MM.yy"
                                    )}
                                    )
                                  </div>
                                );
                              })()}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`rounded-full px-2 py-0.5 font-medium text-xs ${u.role === "superadmin" ? "bg-yellow-100 text-yellow-800" : u.role === "admin" ? "bg-blue-100 text-blue-800" : "bg-gray-100 text-gray-700"}`}
                            >
                              {u.role}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <button
                              className={`rounded-full px-2 py-0.5 font-medium text-xs ${u.isActive ? "bg-green-100 text-green-700 hover:bg-green-200" : "bg-red-100 text-red-700 hover:bg-red-200"}`}
                              onClick={() => handleToggleUser(u)}
                              title={u.isActive ? "Deaktivieren" : "Aktivieren"}
                            >
                              {u.isActive ? "Aktiv" : "Deaktiviert"}
                            </button>
                          </td>
                          <td className="px-4 py-3">
                            <button
                              className={`flex items-center gap-1 rounded-full px-2 py-0.5 font-medium text-xs ${u.subscriptionActive ? "bg-green-100 text-green-700 hover:bg-green-200" : u.subscriptionType === "trial" ? "bg-blue-100 text-blue-700 hover:bg-blue-200" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
                              onClick={() => handleToggleSubscription(u)}
                              title={
                                u.subscriptionActive
                                  ? "Abo deaktivieren"
                                  : "Abo aktivieren (Testabo → Monatsabo)"
                              }
                            >
                              <CreditCard size={11} />
                              {u.subscriptionActive
                                ? "Monatsabo"
                                : u.subscriptionType === "trial"
                                  ? "Testabo"
                                  : "Kein Abo"}
                            </button>
                          </td>
                          <td className="px-4 py-3">
                            <button
                              className={`flex items-center gap-1 rounded-full px-2 py-0.5 font-medium text-xs ${u.aiKeyGranted ? "bg-purple-100 text-purple-700 hover:bg-purple-200" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
                              onClick={() => handleToggleAiGrant(u)}
                              title={
                                u.aiKeyGranted
                                  ? "KI-Zugriff entziehen"
                                  : "KI-Zugriff gewähren"
                              }
                            >
                              <Bot size={11} />{" "}
                              {u.aiKeyGranted ? "Gewährt" : "Kein Zugriff"}
                            </button>
                          </td>
                          <td className="px-4 py-3">
                            <button
                              className="text-gray-400 hover:text-red-500"
                              onClick={() => handleDeleteUser(u.id)}
                            >
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

          {tab === "households" && (
            <div className="space-y-4">
              <div className="relative">
                <Search
                  className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400"
                  size={16}
                />
                <input
                  className="input w-full"
                  onChange={(e) => setHouseholdSearch(e.target.value)}
                  placeholder="Haushaltsbuch suchen (Name)..."
                  style={{ paddingLeft: "2.25rem" }}
                  value={householdSearch}
                />
              </div>
              {households
                .filter((h) => {
                  if (!householdSearch) {
                    return true;
                  }
                  const q = householdSearch.toLowerCase();
                  return h.name?.toLowerCase().includes(q);
                })
                .map((h) => (
                  <div className="card p-5" key={h.id}>
                    <div className="mb-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--primary)]/10 font-bold text-[var(--primary)] text-sm">
                          <Home size={16} />
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900 dark:text-white">
                            {h.name}
                          </p>
                          <p className="text-gray-500 text-xs">
                            {h.HouseholdMembers?.length ?? "?"} Mitglied(er)
                            {h.currency ? ` · ${h.currency}` : ""}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {h.aiEnabled && (
                          <span className="rounded-full bg-purple-100 px-2 py-0.5 font-medium text-purple-700 text-xs">
                            KI
                          </span>
                        )}
                      </div>
                    </div>
                    {h.HouseholdMembers && h.HouseholdMembers.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {h.HouseholdMembers.map((m: any) => (
                          <span
                            className="flex items-center gap-1.5 rounded-xl bg-gray-50 px-3 py-1.5 text-gray-700 text-sm dark:bg-slate-700 dark:text-gray-300"
                            key={m.userId || m.id}
                          >
                            <Users
                              className="text-[var(--primary)]"
                              size={13}
                            />
                            {m.User?.name || "—"}
                            <span className="ml-1 text-gray-400 text-xs">
                              ({m.role})
                            </span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              {households.length === 0 && (
                <p className="py-8 text-center text-gray-500 text-sm">
                  Keine Haushaltsbücher gefunden
                </p>
              )}
            </div>
          )}

          {tab === "ai" && (
            <div className="max-w-2xl space-y-6">
              <div className="card space-y-5 p-6">
                <h2 className="flex items-center gap-2 font-semibold text-gray-900 dark:text-white">
                  <Bot className="text-[var(--primary)]" size={18} /> Globaler
                  Anthropic API-Key
                </h2>
                <p className="text-gray-500 text-sm dark:text-gray-400">
                  Dieser zentrale Key wird verwendet, wenn ein Haushalt keinen
                  eigenen Key konfiguriert hat. Du kannst festlegen, ob alle
                  Benutzer ihn nutzen dürfen oder nur explizit freigegebene.
                </p>

                {/* Current key status */}
                <div className="rounded-xl bg-gray-50 p-4 dark:bg-slate-700">
                  <p className="font-medium text-gray-700 text-sm dark:text-gray-300">
                    {aiSettings.hasApiKey ? (
                      <span className="text-green-600 dark:text-green-400">
                        ✓ Key hinterlegt: {aiSettings.maskedApiKey}
                      </span>
                    ) : (
                      <span className="text-gray-500">
                        Kein globaler Key hinterlegt
                      </span>
                    )}
                  </p>
                </div>

                {/* New key input */}
                <div>
                  <label className="mb-1 block font-medium text-gray-700 text-sm dark:text-gray-300">
                    {aiSettings.hasApiKey
                      ? "Neuen Key eingeben (zum Ersetzen)"
                      : "Anthropic API-Key"}
                  </label>
                  <div className="relative">
                    <input
                      className="input pr-10"
                      onChange={(e) => setAiKeyInput(e.target.value)}
                      placeholder="sk-ant-api03-..."
                      type={showAiKey ? "text" : "password"}
                      value={aiKeyInput}
                    />
                    <button
                      className="absolute top-1/2 right-3 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      onClick={() => setShowAiKey(!showAiKey)}
                      type="button"
                    >
                      {showAiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                {/* Public toggle */}
                <div className="flex items-center justify-between rounded-xl bg-gray-50 p-4 dark:bg-slate-700">
                  <div className="flex items-center gap-2">
                    <Globe className="text-[var(--primary)]" size={16} />
                    <div>
                      <p className="font-medium text-gray-900 text-sm dark:text-white">
                        Für alle Benutzer freigeben
                      </p>
                      <p className="text-gray-500 text-xs">
                        Wenn deaktiviert, nur für explizit freigegebene Benutzer
                      </p>
                    </div>
                  </div>
                  <button
                    className={`relative h-6 w-12 overflow-hidden rounded-full transition-colors ${aiSettings.aiKeyPublic ? "bg-[var(--primary)]" : "bg-gray-300 dark:bg-slate-500"}`}
                    onClick={() =>
                      setAiSettings((s) => ({
                        ...s,
                        aiKeyPublic: !s.aiKeyPublic,
                      }))
                    }
                  >
                    <span
                      className={`absolute top-1 left-0 h-4 w-4 rounded-full bg-white shadow transition-transform ${aiSettings.aiKeyPublic ? "translate-x-7" : "translate-x-1"}`}
                    />
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  {aiSettings.hasApiKey && (
                    <button
                      className="text-red-500 text-sm hover:underline"
                      onClick={handleDeleteAiKey}
                    >
                      Key löschen
                    </button>
                  )}
                  <button
                    className="btn-primary ml-auto flex items-center gap-2 disabled:opacity-50"
                    disabled={aiSaving}
                    onClick={handleSaveAiSettings}
                  >
                    {aiSaving ? (
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    ) : (
                      <Bot size={16} />
                    )}
                    Einstellungen speichern
                  </button>
                </div>
              </div>

              {/* Per-user grants (only relevant when not public) */}
              {!aiSettings.aiKeyPublic && (
                <div className="card p-6">
                  <h3 className="mb-1 flex items-center gap-2 font-semibold text-gray-900 dark:text-white">
                    <Users size={16} /> KI-Zugriff pro Benutzer
                  </h3>
                  <p className="mb-4 text-gray-500 text-sm dark:text-gray-400">
                    Klicke auf einen Benutzer, um den KI-Zugriff zu gewähren
                    oder zu entziehen.
                  </p>
                  <div className="space-y-2">
                    {users.map((u) => (
                      <div
                        className="flex items-center justify-between border-gray-100 border-b py-2 last:border-0 dark:border-slate-700"
                        key={u.id}
                      >
                        <div>
                          <p className="font-medium text-gray-900 text-sm dark:text-white">
                            {u.name}
                          </p>
                          <p className="text-gray-500 text-xs">{u.email}</p>
                        </div>
                        <button
                          className={`flex items-center gap-1.5 rounded-full px-3 py-1 font-medium text-xs transition-colors ${u.aiKeyGranted ? "bg-purple-100 text-purple-700 hover:bg-purple-200" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
                          onClick={() => handleToggleAiGrant(u)}
                        >
                          <Bot size={12} />{" "}
                          {u.aiKeyGranted ? "Zugriff aktiv" : "Kein Zugriff"}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === "backup" && (
            <div className="max-w-2xl space-y-6">
              {/* SSH Key Setup Card */}
              <div className="card space-y-4 p-6">
                <h2 className="flex items-center gap-2 font-semibold text-gray-900 dark:text-white">
                  <Key className="text-[var(--primary)]" size={18} />{" "}
                  SSH-Key-Authentifizierung
                </h2>
                <p className="text-gray-500 text-sm dark:text-gray-400">
                  Mit einem SSH-Key kannst du dich ohne Passwort sicher mit
                  deinem Homeserver verbinden. Einmal eingerichtet, reicht es,{" "}
                  <strong>kein Passwort</strong> im Formular einzutragen — der
                  Key wird automatisch verwendet.
                </p>

                {/* Public key display */}
                {!sshPublicKey && (
                  <button
                    className="flex items-center gap-2 rounded-xl bg-[var(--primary)]/10 px-4 py-2 font-medium text-[var(--primary)] text-sm transition-colors hover:bg-[var(--primary)]/20 disabled:opacity-50"
                    disabled={sshKeyLoading}
                    onClick={loadSshKey}
                  >
                    {sshKeyLoading ? (
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" />
                    ) : (
                      <Key size={15} />
                    )}
                    SSH-Key anzeigen
                  </button>
                )}

                {sshPublicKey && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="font-medium text-gray-600 text-xs dark:text-gray-400">
                        Öffentlicher Schlüssel (Public Key)
                      </label>
                      <div className="flex gap-2">
                        <button
                          className="flex items-center gap-1 text-[var(--primary)] text-xs hover:underline"
                          onClick={() => {
                            navigator.clipboard?.writeText(sshPublicKey);
                            toast.success("Key kopiert!");
                          }}
                        >
                          <Copy size={12} /> Kopieren
                        </button>
                        <button
                          className="flex items-center gap-1 text-gray-400 text-xs hover:text-red-500 disabled:opacity-50"
                          disabled={sshKeyRegenerating}
                          onClick={handleRegenerateSshKey}
                        >
                          <RefreshCw size={12} /> Neu generieren
                        </button>
                      </div>
                    </div>
                    <div className="select-all break-all rounded-xl border border-gray-200 bg-gray-50 p-3 font-mono text-xs dark:border-slate-700 dark:bg-slate-800">
                      {sshPublicKey}
                    </div>
                  </div>
                )}

                {/* Step-by-step instructions */}
                <details className="group">
                  <summary className="flex cursor-pointer select-none items-center gap-1 font-medium text-[var(--primary)] text-sm hover:underline">
                    <span className="inline-block transition-transform group-open:rotate-90">
                      ▶
                    </span>
                    Schritt-für-Schritt-Anleitung: SSH-Key auf dem Homeserver
                    einrichten
                  </summary>
                  <div className="mt-4 space-y-4 text-gray-700 text-sm dark:text-gray-300">
                    <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
                      <p className="mb-1 font-semibold text-blue-800 dark:text-blue-300">
                        Was passiert hier?
                      </p>
                      <p className="text-blue-700 text-xs dark:text-blue-400">
                        Der App-Server bekommt einen eindeutigen "Schlüssel".
                        Deinem Backup-Server sagst du einmalig: "Lass diesen
                        Schlüssel rein". Danach können Backups automatisch
                        übertragen werden — ohne Passwort.
                      </p>
                    </div>

                    <ol className="list-none space-y-4">
                      <li className="flex gap-3">
                        <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-[var(--primary)] font-bold text-white text-xs">
                          1
                        </span>
                        <div>
                          <p className="font-semibold">
                            Öffentlichen Key kopieren
                          </p>
                          <p className="mt-0.5 text-gray-500 text-xs">
                            Klicke oben auf <strong>„Kopieren"</strong> neben
                            dem Public Key. Der Key beginnt immer mit{" "}
                            <code className="rounded bg-gray-100 px-1 dark:bg-slate-700">
                              ssh-ed25519
                            </code>
                            .
                          </p>
                        </div>
                      </li>

                      <li className="flex gap-3">
                        <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-[var(--primary)] font-bold text-white text-xs">
                          2
                        </span>
                        <div>
                          <p className="font-semibold">
                            Auf dem Backup-Server anmelden
                          </p>
                          <p className="mt-0.5 text-gray-500 text-xs">
                            Öffne ein Terminal und verbinde dich mit deinem
                            Backup-Server (ersetze die Platzhalter durch deine
                            eigenen Werte):
                          </p>
                          <pre className="mt-1 overflow-x-auto rounded-lg bg-slate-800 p-2 text-green-400 text-xs">
                            ssh BENUTZER@IP-ADRESSE
                          </pre>
                        </div>
                      </li>

                      <li className="flex gap-3">
                        <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-[var(--primary)] font-bold text-white text-xs">
                          3
                        </span>
                        <div>
                          <p className="font-semibold">
                            Ordner für SSH-Keys erstellen (falls noch nicht
                            vorhanden)
                          </p>
                          <pre className="mt-1 overflow-x-auto rounded-lg bg-slate-800 p-2 text-green-400 text-xs">
                            mkdir -p ~/.ssh && chmod 700 ~/.ssh
                          </pre>
                        </div>
                      </li>

                      <li className="flex gap-3">
                        <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-[var(--primary)] font-bold text-white text-xs">
                          4
                        </span>
                        <div>
                          <p className="font-semibold">
                            Public Key in die authorized_keys-Datei eintragen
                          </p>
                          <p className="mt-0.5 text-gray-500 text-xs">
                            Führe diesen Befehl aus und ersetze{" "}
                            <code className="rounded bg-gray-100 px-1 dark:bg-slate-700">
                              HIER_DEN_KEY_EINFÜGEN
                            </code>{" "}
                            durch den kopierten Key (alles in einer Zeile!):
                          </p>
                          <pre className="mt-1 overflow-x-auto whitespace-pre-wrap rounded-lg bg-slate-800 p-2 text-green-400 text-xs">
                            echo "HIER_DEN_KEY_EINFÜGEN" {">>"}{" "}
                            ~/.ssh/authorized_keys
                          </pre>
                          <p className="mt-1 text-gray-500 text-xs">
                            Oder öffne die Datei direkt mit einem Texteditor und
                            füge den Key als neue Zeile ein:
                          </p>
                          <pre className="mt-1 overflow-x-auto rounded-lg bg-slate-800 p-2 text-green-400 text-xs">
                            nano ~/.ssh/authorized_keys
                          </pre>
                        </div>
                      </li>

                      <li className="flex gap-3">
                        <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-[var(--primary)] font-bold text-white text-xs">
                          5
                        </span>
                        <div>
                          <p className="font-semibold">Berechtigungen setzen</p>
                          <pre className="mt-1 overflow-x-auto rounded-lg bg-slate-800 p-2 text-green-400 text-xs">
                            chmod 600 ~/.ssh/authorized_keys
                          </pre>
                        </div>
                      </li>

                      <li className="flex gap-3">
                        <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-[var(--primary)] font-bold text-white text-xs">
                          6
                        </span>
                        <div>
                          <p className="font-semibold">
                            Backup-Ordner erstellen
                          </p>
                          <p className="mt-0.5 text-gray-500 text-xs">
                            Erstelle den Ordner, in dem die Backups gespeichert
                            werden sollen (beliebiger Name):
                          </p>
                          <pre className="mt-1 overflow-x-auto rounded-lg bg-slate-800 p-2 text-green-400 text-xs">
                            mkdir -p ~/backups
                          </pre>
                        </div>
                      </li>

                      <li className="flex gap-3">
                        <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-[var(--primary)] font-bold text-white text-xs">
                          7
                        </span>
                        <div>
                          <p className="font-semibold">Verbindung testen</p>
                          <p className="mt-0.5 text-gray-500 text-xs">
                            Trage unten im Formular Host, Benutzer und Pfad ein
                            — das Passwort-Feld kannst du{" "}
                            <strong>leer lassen</strong>. Klicke dann auf{" "}
                            <strong>„Verbindung testen"</strong>.
                          </p>
                          <div className="mt-1 rounded-lg border border-amber-200 bg-amber-50 p-2 text-amber-700 text-xs dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-400">
                            <strong>Remote-Pfad:</strong> muss absolut sein,
                            z.B. <code>/home/benutzer/backups</code> — nicht nur{" "}
                            <code>backups</code>
                          </div>
                        </div>
                      </li>
                    </ol>
                  </div>
                </details>
              </div>

              <div className="card space-y-5 p-6">
                <h2 className="flex items-center gap-2 font-semibold text-gray-900 dark:text-white">
                  <Database className="text-[var(--primary)]" size={18} />{" "}
                  Globales Backup (SFTP)
                </h2>
                <p className="text-gray-500 text-sm dark:text-gray-400">
                  Sichere alle Daten automatisch auf deinen Heimserver via SFTP.
                  Das Backup wird als komprimiertes JSON gespeichert.
                </p>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div className="md:col-span-2">
                    <label className="mb-1 block font-medium text-gray-600 text-xs dark:text-gray-400">
                      SFTP Host
                    </label>
                    <input
                      className="input"
                      onChange={(e) =>
                        setBackupForm((f) => ({
                          ...f,
                          sftpHost: e.target.value,
                        }))
                      }
                      placeholder="192.168.2.204"
                      type="text"
                      value={backupForm.sftpHost}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block font-medium text-gray-600 text-xs dark:text-gray-400">
                      Port
                    </label>
                    <input
                      className="input"
                      onChange={(e) =>
                        setBackupForm((f) => ({
                          ...f,
                          sftpPort: e.target.value,
                        }))
                      }
                      type="number"
                      value={backupForm.sftpPort}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block font-medium text-gray-600 text-xs dark:text-gray-400">
                      Benutzer
                    </label>
                    <input
                      className="input"
                      onChange={(e) =>
                        setBackupForm((f) => ({
                          ...f,
                          sftpUser: e.target.value,
                        }))
                      }
                      type="text"
                      value={backupForm.sftpUser}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block font-medium text-gray-600 text-xs dark:text-gray-400">
                      {backupConfig?.hasPassword
                        ? "Neues Passwort (leer = unverändert)"
                        : "Passwort"}
                    </label>
                    <div className="relative">
                      <input
                        className="input pr-9"
                        onChange={(e) =>
                          setBackupForm((f) => ({
                            ...f,
                            sftpPassword: e.target.value,
                          }))
                        }
                        type={showSftpPw ? "text" : "password"}
                        value={backupForm.sftpPassword}
                      />
                      <button
                        className="absolute top-1/2 right-3 -translate-y-1/2 text-gray-400"
                        onClick={() => setShowSftpPw(!showSftpPw)}
                        type="button"
                      >
                        {showSftpPw ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block font-medium text-gray-600 text-xs dark:text-gray-400">
                      Remote-Pfad
                    </label>
                    <input
                      className="input"
                      onChange={(e) =>
                        setBackupForm((f) => ({
                          ...f,
                          sftpPath: e.target.value,
                        }))
                      }
                      placeholder="/backups"
                      type="text"
                      value={backupForm.sftpPath}
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-2 block font-medium text-gray-600 text-xs dark:text-gray-400">
                    Automatischer Zeitplan
                  </label>
                  <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                    {Object.entries(SCHEDULES).map(([key, { label }]) => (
                      <button
                        className={`rounded-xl border px-3 py-2 font-medium text-xs transition-all ${backupForm.scheduleLabel === key ? "border-transparent bg-[var(--primary)] text-white" : "border-gray-200 text-gray-600 hover:border-[var(--primary)] dark:border-slate-600 dark:text-gray-300"}`}
                        key={key}
                        onClick={() =>
                          setBackupForm((f) => ({
                            ...f,
                            scheduleLabel: key,
                            isActive: key !== "disabled",
                          }))
                        }
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {backupConfig && (
                  <div
                    className={`rounded-xl p-3 font-medium text-xs ${backupConfig.lastRunStatus === "success" ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400" : backupConfig.lastRunStatus === "error" ? "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400" : "bg-gray-50 text-gray-500 dark:bg-slate-700"}`}
                  >
                    {backupConfig.lastRunAt
                      ? `Letztes Backup: ${format(new Date(backupConfig.lastRunAt), "dd.MM.yyyy HH:mm")} — ${backupConfig.lastRunMessage}`
                      : "Noch kein Backup ausgeführt"}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    className="flex items-center gap-2 rounded-xl bg-gray-100 px-4 py-2 font-medium text-sm transition-colors hover:bg-gray-200 disabled:opacity-50 dark:bg-slate-700 dark:hover:bg-slate-600"
                    disabled={backupTesting || !backupForm.sftpHost}
                    onClick={handleTestBackup}
                  >
                    {backupTesting ? (
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-500 border-t-transparent" />
                    ) : (
                      <Wifi size={15} />
                    )}
                    Verbindung testen
                  </button>
                  <button
                    className="flex items-center gap-2 rounded-xl bg-gray-100 px-4 py-2 font-medium text-sm transition-colors hover:bg-gray-200 disabled:opacity-50 dark:bg-slate-700 dark:hover:bg-slate-600"
                    disabled={backupRunning || !backupConfig?.sftpHost}
                    onClick={handleRunBackup}
                  >
                    {backupRunning ? (
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-500 border-t-transparent" />
                    ) : (
                      <Play size={15} />
                    )}
                    Jetzt sichern
                  </button>
                  <button
                    className="btn-primary ml-auto flex items-center gap-2 disabled:opacity-50"
                    disabled={backupSaving}
                    onClick={handleSaveBackup}
                  >
                    {backupSaving ? (
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    ) : (
                      <Database size={15} />
                    )}
                    Einstellungen speichern
                  </button>
                </div>
              </div>

              {/* Restore card */}
              <div className="card space-y-4 border border-red-200 p-6 dark:border-red-900">
                <h2 className="flex items-center gap-2 font-semibold text-gray-900 dark:text-white">
                  <Database className="text-red-500" size={18} /> Backup
                  wiederherstellen
                </h2>
                <p className="text-gray-500 text-sm dark:text-gray-400">
                  Stellt alle Daten aus einer Backup-Datei wieder her.{" "}
                  <strong className="text-red-600 dark:text-red-400">
                    Alle aktuellen Daten werden dabei vollständig überschrieben.
                  </strong>
                </p>

                <div>
                  <label className="mb-1 block font-medium text-gray-600 text-xs dark:text-gray-400">
                    Backup-Datei auswählen (.json.gz oder .json)
                  </label>
                  <input
                    accept=".json,.gz,.json.gz"
                    className="block w-full text-gray-500 text-sm file:mr-3 file:rounded-xl file:border-0 file:bg-gray-100 file:px-4 file:py-2 file:font-medium file:text-gray-700 file:text-sm hover:file:bg-gray-200 dark:file:bg-slate-700 dark:file:text-gray-300"
                    onChange={handleRestoreFileChange}
                    type="file"
                  />
                </div>

                {restorePreviewing && (
                  <div className="flex items-center gap-2 text-gray-500 text-sm">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-400 border-t-transparent" />
                    Datei wird analysiert…
                  </div>
                )}

                {restorePreview && (
                  <div className="space-y-3">
                    <div className="space-y-2 rounded-xl bg-gray-50 p-4 text-sm dark:bg-slate-800">
                      <p className="font-semibold text-gray-700 dark:text-gray-300">
                        Inhalt der Backup-Datei:
                      </p>
                      <p className="text-gray-500 text-xs">
                        Erstellt am:{" "}
                        <strong>
                          {new Date(restorePreview.exportedAt).toLocaleString(
                            "de-DE"
                          )}
                        </strong>
                      </p>
                      <div className="mt-2 grid grid-cols-3 gap-2">
                        {[
                          {
                            label: "Benutzer",
                            value: restorePreview.counts.users,
                          },
                          {
                            label: "Haushaltsbücher",
                            value: restorePreview.counts.households,
                          },
                          {
                            label: "Buchungen",
                            value: restorePreview.counts.transactions,
                          },
                          {
                            label: "Kategorien",
                            value: restorePreview.counts.categories,
                          },
                          {
                            label: "Budgets",
                            value: restorePreview.counts.budgets,
                          },
                          {
                            label: "Einladungen",
                            value: restorePreview.counts.inviteCodes,
                          },
                        ].map(({ label, value }) => (
                          <div
                            className="rounded-lg bg-white p-2 text-center dark:bg-slate-700"
                            key={label}
                          >
                            <p className="font-bold text-gray-900 text-lg dark:text-white">
                              {value}
                            </p>
                            <p className="text-gray-500 text-xs">{label}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-3 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
                      <p className="font-semibold text-red-700 text-sm dark:text-red-400">
                        ⚠️ Achtung: Diese Aktion kann nicht rückgängig gemacht
                        werden!
                      </p>
                      <p className="text-red-600 text-xs dark:text-red-400">
                        Alle aktuellen Buchungen, Benutzer und Einstellungen
                        werden gelöscht und durch den Backup-Stand ersetzt.
                        Benutzer müssen danach ihr Passwort zurücksetzen
                        (Passwort-Reset per E-Mail).
                      </p>
                      <div>
                        <label className="mb-1 block font-medium text-red-700 text-xs dark:text-red-400">
                          Tippe <strong>WIEDERHERSTELLEN</strong> zur
                          Bestätigung:
                        </label>
                        <input
                          className="input border-red-300 focus:border-red-500 dark:border-red-700"
                          onChange={(e) =>
                            setRestoreConfirmText(e.target.value)
                          }
                          placeholder="WIEDERHERSTELLEN"
                          type="text"
                          value={restoreConfirmText}
                        />
                      </div>
                      <button
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 font-medium text-sm text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
                        disabled={
                          restoreConfirmText !== "WIEDERHERSTELLEN" || restoring
                        }
                        onClick={handleRestore}
                      >
                        {restoring ? (
                          <>
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />{" "}
                            Wird wiederhergestellt…
                          </>
                        ) : (
                          <>
                            <Database size={15} /> Jetzt wiederherstellen
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === "invites" && (
            <>
              <div className="mb-2 flex items-start gap-4 rounded-xl bg-blue-50 p-4 dark:bg-blue-900/20">
                <div className="text-blue-700 text-sm dark:text-blue-300">
                  <p className="mb-1 font-medium">
                    Einladungscodes für neue Haushalte
                  </p>
                  <p className="text-xs opacity-80">
                    Jeder Code ermöglicht die Registrierung eines neuen
                    Benutzers, der automatisch seinen eigenen Haushalt erhält
                    und dessen Admin wird. Für Mitglieder-Einladungen in einen
                    bestehenden Haushalt → Haushalt-Seite verwenden.
                  </p>
                </div>
              </div>
              <button
                className="btn-primary flex items-center gap-2"
                onClick={handleCreateInvite}
              >
                <Plus size={16} /> Code für neuen Haushalt erstellen
              </button>
              <div className="card overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-slate-700">
                    <tr>
                      {[
                        "Code",
                        "Typ",
                        "Genutzt / Max",
                        "Erstellt",
                        "Läuft ab",
                      ].map((h) => (
                        <th
                          className="px-4 py-3 text-left font-semibold text-gray-500 text-xs uppercase tracking-wide"
                          key={h}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                    {inviteCodes.map((code) => (
                      <tr
                        className={`hover:bg-pink-50/50 dark:hover:bg-slate-700/50 ${code.useCount >= code.maxUses ? "opacity-50" : ""}`}
                        key={code.id}
                      >
                        <td className="px-4 py-3 font-bold font-mono text-[var(--primary)] text-sm">
                          {code.code}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-full px-2 py-0.5 font-medium text-xs ${code.type === "new_household" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}`}
                          >
                            {code.type === "new_household"
                              ? "Neuer Haushalt"
                              : "Mitglied"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600 text-sm dark:text-gray-400">
                          {code.useCount} / {code.maxUses}
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-sm">
                          {format(new Date(code.createdAt), "dd.MM.yy")}
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-sm">
                          {code.expiresAt
                            ? format(new Date(code.expiresAt), "dd.MM.yy")
                            : "∞"}
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
