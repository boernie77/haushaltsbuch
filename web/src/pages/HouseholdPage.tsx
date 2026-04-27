import {
  Bot,
  Check,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Pencil,
  Plus,
  Trash2,
  UserMinus,
  X,
} from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { householdAPI } from "../services/api";
import { useAuthStore } from "../store/authStore";

export default function HouseholdPage() {
  const {
    currentHousehold,
    user,
    setCurrentHousehold,
    households,
    setHouseholds,
  } = useAuthStore();
  const [members, setMembers] = useState<any[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    description: "",
    currency: "EUR",
    monthlyBudget: "",
    budgetWarningAt: "80",
  });

  // Rename state
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState("");

  const handleDelete = async () => {
    if (!currentHousehold) {
      return;
    }
    if (
      !confirm(
        `Haushaltsbuch „${currentHousehold.name}" wirklich löschen?\n\nAlle Buchungen, Budgets und Einstellungen werden unwiderruflich gelöscht!`
      )
    ) {
      return;
    }
    try {
      await householdAPI.remove(currentHousehold.id);
      const remaining = households.filter((h) => h.id !== currentHousehold.id);
      setHouseholds(remaining);
      setCurrentHousehold(remaining[0] || null);
      toast.success("Haushaltsbuch gelöscht");
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Fehler beim Löschen");
    }
  };

  const handleRename = async () => {
    if (!(currentHousehold && newName.trim())) {
      return;
    }
    try {
      await householdAPI.update(currentHousehold.id, {
        name: newName.trim(),
      });
      setCurrentHousehold({ ...currentHousehold, name: newName.trim() });
      setHouseholds(
        households.map((h) =>
          h.id === currentHousehold.id ? { ...h, name: newName.trim() } : h
        )
      );
      setEditingName(false);
      toast.success("Name geändert");
    } catch {
      toast.error("Fehler beim Umbenennen");
    }
  };

  // Month start day
  const [monthStartDay, setMonthStartDay] = useState<number>(
    currentHousehold?.monthStartDay || 1
  );
  const [monthStartDaySaving, setMonthStartDaySaving] = useState(false);

  useEffect(() => {
    setMonthStartDay(currentHousehold?.monthStartDay || 1);
  }, [currentHousehold?.id]);

  const handleSaveMonthStartDay = async () => {
    if (!currentHousehold) {
      return;
    }
    const day = Math.max(1, Math.min(28, monthStartDay));
    setMonthStartDaySaving(true);
    try {
      await householdAPI.update(currentHousehold.id, { monthStartDay: day });
      setCurrentHousehold({ ...currentHousehold, monthStartDay: day });
      setHouseholds(
        households.map((h) =>
          h.id === currentHousehold.id ? { ...h, monthStartDay: day } : h
        )
      );
      toast.success("Monatsbeginn gespeichert");
    } catch {
      toast.error("Fehler beim Speichern");
    } finally {
      setMonthStartDaySaving(false);
    }
  };

  // AI Settings state
  const [aiSettings, setAiSettings] = useState<{
    aiEnabled: boolean;
    hasApiKey: boolean;
    maskedApiKey: string | null;
  }>({
    aiEnabled: false,
    hasApiKey: false,
    maskedApiKey: null,
  });
  const [aiKeyInput, setAiKeyInput] = useState("");
  const [showAiKey, setShowAiKey] = useState(false);
  const [aiSaving, setAiSaving] = useState(false);

  useEffect(() => {
    if (currentHousehold) {
      householdAPI
        .getMembers(currentHousehold.id)
        .then(({ data }) => setMembers(data.members));
      householdAPI
        .getAiSettings(currentHousehold.id)
        .then(({ data }) => setAiSettings(data))
        .catch(() => {});
    }
  }, [currentHousehold]);

  const handleSaveAi = async () => {
    if (!currentHousehold) {
      return;
    }
    setAiSaving(true);
    try {
      const { data } = await householdAPI.saveAiSettings(currentHousehold.id, {
        aiEnabled: aiSettings.aiEnabled,
        apiKey: aiKeyInput,
      });
      setAiSettings(data);
      setAiKeyInput("");
      toast.success(
        data.aiEnabled ? "✅ KI-Analyse aktiviert!" : "KI-Analyse deaktiviert"
      );
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Fehler beim Speichern");
    } finally {
      setAiSaving(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { data } = await householdAPI.create({
        ...form,
        monthlyBudget: form.monthlyBudget
          ? Number.parseFloat(form.monthlyBudget)
          : null,
      });
      const { data: hd } = await householdAPI.getAll();
      setHouseholds(hd.households);
      setCurrentHousehold(
        hd.households.find((h: any) => h.id === data.household.id) ||
          data.household
      );
      setShowCreateForm(false);
      toast.success("Haushalt erstellt!");
    } catch {
      toast.error("Fehler beim Erstellen");
    }
  };

  const handleInvite = async () => {
    if (!currentHousehold) {
      return;
    }
    try {
      const { data } = await householdAPI.createInvite(currentHousehold.id, {
        role: "member",
        expiresIn: 24 * 7,
        maxUses: 10,
      });
      setInviteLink(data.inviteLink);
      navigator.clipboard?.writeText(data.invite.code);
      toast.success(`Einladungscode: ${data.invite.code} (kopiert!)`);
    } catch {
      toast.error("Fehler");
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!(currentHousehold && confirm("Mitglied entfernen?"))) {
      return;
    }
    try {
      await householdAPI.removeMember(currentHousehold.id, userId);
      setMembers((prev) => prev.filter((m) => m.userId !== userId));
      toast.success("Entfernt");
    } catch {
      toast.error("Fehler");
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="font-bold text-2xl text-gray-900 dark:text-white">
          Haushalt verwalten
        </h1>
        <button
          className="btn-primary flex items-center gap-2"
          onClick={() => setShowCreateForm(true)}
        >
          <Plus size={18} /> Neues Haushaltsbuch
        </button>
      </div>

      {/* Household Selector */}
      {households.length > 1 && (
        <div className="card p-4">
          <p className="mb-2 font-medium text-gray-700 text-sm dark:text-gray-300">
            Aktiver Haushalt
          </p>
          <div className="flex flex-wrap gap-2">
            {households.map((h) => (
              <button
                className={`rounded-xl px-4 py-2 font-medium text-sm transition-all ${currentHousehold?.id === h.id ? "bg-[var(--primary)] text-white" : "bg-gray-100 text-gray-700 dark:bg-slate-700 dark:text-gray-300"}`}
                key={h.id}
                onClick={() => setCurrentHousehold(h)}
              >
                🏠 {h.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {showCreateForm && (
        <div className="card p-6">
          <h2 className="mb-4 font-semibold text-gray-900 dark:text-white">
            Neuen Haushalt erstellen
          </h2>
          <form
            className="grid grid-cols-1 gap-4 md:grid-cols-2"
            onSubmit={handleCreate}
          >
            <div className="md:col-span-2">
              <label className="mb-1 block font-medium text-gray-700 text-sm dark:text-gray-300">
                Name *
              </label>
              <input
                className="input"
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                required
                type="text"
                value={form.name}
              />
            </div>
            <div>
              <label className="mb-1 block font-medium text-gray-700 text-sm dark:text-gray-300">
                Monatliches Budget (€)
              </label>
              <input
                className="input"
                onChange={(e) =>
                  setForm((f) => ({ ...f, monthlyBudget: e.target.value }))
                }
                step="0.01"
                type="number"
                value={form.monthlyBudget}
              />
            </div>
            <div>
              <label className="mb-1 block font-medium text-gray-700 text-sm dark:text-gray-300">
                Warnung bei (%)
              </label>
              <input
                className="input"
                max="100"
                min="1"
                onChange={(e) =>
                  setForm((f) => ({ ...f, budgetWarningAt: e.target.value }))
                }
                type="number"
                value={form.budgetWarningAt}
              />
            </div>
            <div className="flex justify-end gap-3 md:col-span-2">
              <button
                className="rounded-xl bg-gray-100 px-4 py-2 text-sm dark:bg-slate-700"
                onClick={() => setShowCreateForm(false)}
                type="button"
              >
                Abbrechen
              </button>
              <button className="btn-primary" type="submit">
                Erstellen
              </button>
            </div>
          </form>
        </div>
      )}

      {currentHousehold && (
        <>
          {/* Household Info */}
          <div className="card p-6">
            <div className="mb-3 flex items-center gap-2">
              {editingName ? (
                <>
                  <input
                    autoFocus
                    className="input flex-1 font-semibold text-base"
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleRename();
                      }
                      if (e.key === "Escape") {
                        setEditingName(false);
                      }
                    }}
                    value={newName}
                  />
                  <button
                    className="rounded-lg bg-[var(--primary)] p-2 text-white hover:opacity-80"
                    onClick={handleRename}
                  >
                    <Check size={16} />
                  </button>
                  <button
                    className="rounded-lg bg-gray-100 p-2 text-gray-600 hover:bg-gray-200 dark:bg-slate-700 dark:text-gray-300"
                    onClick={() => setEditingName(false)}
                  >
                    <X size={16} />
                  </button>
                </>
              ) : (
                <>
                  <h2 className="font-semibold text-gray-900 dark:text-white">
                    🏠 {currentHousehold.name}
                  </h2>
                  <button
                    className="rounded-lg p-1.5 text-gray-400 hover:bg-pink-50 hover:text-[var(--primary)] dark:hover:bg-slate-700"
                    onClick={() => {
                      setNewName(currentHousehold.name);
                      setEditingName(true);
                    }}
                  >
                    <Pencil size={14} />
                  </button>
                </>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-gray-500">Währung:</span>{" "}
                <span className="font-medium">{currentHousehold.currency}</span>
              </div>
              {currentHousehold.monthlyBudget && (
                <div>
                  <span className="text-gray-500">Monatsbudget:</span>{" "}
                  <span className="font-medium">
                    {currentHousehold.monthlyBudget} €
                  </span>
                </div>
              )}
              {(currentHousehold.monthStartDay ?? 1) !== 1 && (
                <div>
                  <span className="text-gray-500">Monat beginnt am:</span>{" "}
                  <span className="font-medium">
                    {currentHousehold.monthStartDay}.
                  </span>
                </div>
              )}
            </div>
            {households.length > 1 && (
              <div className="mt-4 border-gray-100 border-t pt-4 dark:border-slate-700">
                <button
                  className="flex items-center gap-2 text-red-500 text-sm hover:text-red-600 hover:underline"
                  onClick={handleDelete}
                >
                  <Trash2 size={14} /> Haushaltsbuch löschen
                </button>
              </div>
            )}
          </div>

          {/* Month start day */}
          <div className="card p-6">
            <h2 className="mb-1 font-semibold text-gray-900 dark:text-white">
              Monatszeitraum
            </h2>
            <p className="mb-4 text-gray-500 text-sm dark:text-gray-400">
              Lege fest, an welchem Tag des Monats dein Budget-Monat beginnt.
              Nützlich z.B. wenn du am 27. Gehalt bekommst — dann startet der
              Budget-Monat April bereits am 27.03.
            </p>
            <div className="flex items-center gap-3">
              <label className="whitespace-nowrap text-gray-700 text-sm dark:text-gray-300">
                Monat beginnt am
              </label>
              <input
                className="input w-24"
                max={28}
                min={1}
                onChange={(e) =>
                  setMonthStartDay(
                    Math.max(
                      1,
                      Math.min(28, Number.parseInt(e.target.value, 10) || 1)
                    )
                  )
                }
                type="number"
                value={monthStartDay}
              />
              <span className="text-gray-500 text-sm">. des Monats</span>
              <button
                className="btn-primary ml-auto flex items-center gap-2 disabled:opacity-50"
                disabled={monthStartDaySaving}
                onClick={handleSaveMonthStartDay}
              >
                {monthStartDaySaving ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : null}
                Speichern
              </button>
            </div>
            {monthStartDay !== 1 && (
              <p className="mt-3 text-gray-400 text-xs">
                Zeitraum: {monthStartDay}. des Vormonats bis {monthStartDay - 1}
                . des Monats (z.B. April = {monthStartDay}.03. –{" "}
                {monthStartDay - 1}.04.)
              </p>
            )}
          </div>

          {/* Members */}
          <div className="card p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900 dark:text-white">
                Mitglieder ({members.length})
              </h2>
              <button
                className="btn-primary flex items-center gap-2 text-sm"
                onClick={handleInvite}
              >
                <Plus size={16} /> Einladen
              </button>
            </div>
            {inviteLink && (
              <div className="mb-4 flex items-center gap-2 rounded-xl bg-green-50 p-3 dark:bg-green-900/20">
                <span className="truncate text-green-700 text-sm dark:text-green-300">
                  {inviteLink}
                </span>
                <button
                  onClick={() => {
                    navigator.clipboard?.writeText(inviteLink);
                    toast.success("Kopiert!");
                  }}
                >
                  <Copy className="text-green-600" size={14} />
                </button>
              </div>
            )}
            <div className="space-y-3">
              {members.map((m) => (
                <div
                  className="flex items-center justify-between border-gray-100 border-b py-2 last:border-0 dark:border-slate-700"
                  key={m.id}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--primary)] font-bold text-sm text-white">
                      {m.User?.name?.charAt(0)}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 text-sm dark:text-white">
                        {m.User?.name}
                      </p>
                      <p className="text-gray-500 text-xs">{m.User?.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`rounded-full px-2 py-0.5 font-medium text-xs ${m.role === "admin" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"}`}
                    >
                      {m.role}
                    </span>
                    {m.userId !== user?.id && (
                      <button
                        className="text-gray-400 hover:text-red-500"
                        onClick={() => handleRemoveMember(m.userId)}
                      >
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
            <h2 className="mb-1 flex items-center gap-2 font-semibold text-gray-900 dark:text-white">
              <Bot className="text-[var(--primary)]" size={18} />{" "}
              KI-Quittungsanalyse
            </h2>
            <p className="mb-5 text-gray-500 text-sm dark:text-gray-400">
              Claude AI erkennt automatisch Betrag, Händler und Kategorie aus
              Quittungsfotos. Benötigt einen eigenen API-Key von{" "}
              <a
                className="inline-flex items-center gap-1 text-[var(--primary)] hover:underline"
                href="https://console.anthropic.com"
                rel="noreferrer"
                target="_blank"
              >
                console.anthropic.com <ExternalLink size={12} />
              </a>{" "}
              (ca. 0,003 € pro Quittung).
            </p>

            {/* Enable Toggle */}
            <div className="mb-4 flex items-center justify-between rounded-xl bg-gray-50 p-4 dark:bg-slate-700">
              <div>
                <p className="font-medium text-gray-900 text-sm dark:text-white">
                  KI-Analyse aktivieren
                </p>
                <p className="mt-0.5 text-gray-500 text-xs">
                  {aiSettings.hasApiKey
                    ? `Gespeicherter Key: ${aiSettings.maskedApiKey}`
                    : "Noch kein API-Key hinterlegt"}
                </p>
              </div>
              <button
                className={`relative h-6 w-12 overflow-hidden rounded-full transition-colors ${aiSettings.aiEnabled ? "bg-[var(--primary)]" : "bg-gray-300 dark:bg-slate-500"}`}
                onClick={() =>
                  setAiSettings((s) => ({ ...s, aiEnabled: !s.aiEnabled }))
                }
              >
                <span
                  className={`absolute top-1 left-0 h-4 w-4 rounded-full bg-white shadow transition-transform ${aiSettings.aiEnabled ? "translate-x-7" : "translate-x-1"}`}
                />
              </button>
            </div>

            {/* API Key Input */}
            <div className="mb-4">
              <label className="mb-1 block font-medium text-gray-700 text-sm dark:text-gray-300">
                {aiSettings.hasApiKey
                  ? "Neuen API-Key eingeben (zum Ersetzen)"
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
              {aiSettings.hasApiKey && !aiKeyInput && (
                <p className="mt-1 text-gray-500 text-xs">
                  Leer lassen, um den gespeicherten Key beizubehalten.
                </p>
              )}
            </div>

            <div className="flex items-center justify-between">
              <button
                className={`text-red-500 text-sm hover:underline ${aiSettings.hasApiKey ? "" : "invisible"}`}
                onClick={() => {
                  if (
                    confirm("API-Key wirklich löschen und KI deaktivieren?")
                  ) {
                    setAiKeyInput("");
                    setAiSettings((s) => ({ ...s, aiEnabled: false }));
                    householdAPI
                      .saveAiSettings(currentHousehold.id, {
                        aiEnabled: false,
                        apiKey: "",
                      })
                      .then(() => {
                        setAiSettings({
                          aiEnabled: false,
                          hasApiKey: false,
                          maskedApiKey: null,
                        });
                        toast.success("Key gelöscht");
                      })
                      .catch(() => toast.error("Fehler"));
                  }
                }}
              >
                Key löschen
              </button>
              <button
                className="btn-primary flex items-center gap-2 disabled:opacity-50"
                disabled={aiSaving}
                onClick={handleSaveAi}
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
        </>
      )}
    </div>
  );
}
