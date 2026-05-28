import { Pencil, Plus, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { accountAPI } from "../services/api";
import { useAuthStore } from "../store/authStore";

interface Account {
  balance: number;
  color: string;
  icon: string;
  id: string;
  isActive: boolean;
  name: string;
  sortOrder: number;
  startingBalance: number;
  type: "asset" | "liability";
}

const DEFAULT_FORM = {
  name: "",
  type: "asset" as "asset" | "liability",
  icon: "💳",
  color: "#3B82F6",
  startingBalance: "0",
  isActive: true,
};

const ICON_PRESETS = [
  "🏦",
  "💳",
  "💰",
  "💵",
  "💶",
  "🏠",
  "🚗",
  "💼",
  "📊",
  "📈",
  "📉",
  "🔒",
  "🪙",
  "💎",
  "🏧",
];
const COLOR_PRESETS = [
  "#3B82F6",
  "#6366F1",
  "#8B5CF6",
  "#EC4899",
  "#EF4444",
  "#F97316",
  "#EAB308",
  "#22C55E",
  "#06B6D4",
  "#6B7280",
];

export default function AccountsPage() {
  const { currentHousehold } = useAuthStore();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);

  const fmt = (n: number) =>
    new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency: currentHousehold?.currency || "EUR",
    }).format(n);

  const load = async () => {
    if (!currentHousehold) {
      return;
    }
    setLoading(true);
    try {
      const { data } = await accountAPI.getAll(currentHousehold.id);
      setAccounts(data.accounts || []);
    } catch (err: any) {
      toast.error(
        err.response?.data?.error || "Konten konnten nicht geladen werden"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentHousehold]);

  const openCreate = () => {
    setEditingId(null);
    setForm(DEFAULT_FORM);
    setModalOpen(true);
  };

  const openEdit = (a: Account) => {
    setEditingId(a.id);
    setForm({
      name: a.name,
      type: a.type,
      icon: a.icon,
      color: a.color,
      startingBalance: String(a.startingBalance),
      isActive: a.isActive,
    });
    setModalOpen(true);
  };

  const save = async () => {
    if (!(currentHousehold && form.name.trim())) {
      toast.error("Name ist Pflicht");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        householdId: currentHousehold.id,
        name: form.name.trim(),
        type: form.type,
        icon: form.icon,
        color: form.color,
        startingBalance: Number.parseFloat(form.startingBalance) || 0,
        isActive: form.isActive,
      };
      if (editingId) {
        await accountAPI.update(editingId, payload);
        toast.success("Konto aktualisiert");
      } else {
        await accountAPI.create(payload);
        toast.success("Konto angelegt");
      }
      setModalOpen(false);
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Fehler beim Speichern");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (a: Account) => {
    if (!confirm(`Konto "${a.name}" wirklich löschen?`)) {
      return;
    }
    try {
      await accountAPI.delete(a.id);
      toast.success("Konto gelöscht");
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Fehler beim Löschen");
    }
  };

  const assets = accounts.filter((a) => a.type === "asset");
  const liabilities = accounts.filter((a) => a.type === "liability");
  const totalAssets = assets.reduce((s, a) => s + a.balance, 0);
  const totalLiabilities = liabilities.reduce((s, a) => s + a.balance, 0);
  const netWorth = totalAssets - totalLiabilities;

  const renderAccountCard = (a: Account) => (
    <div
      className="card flex items-center gap-4 p-4 transition-all hover:shadow-md"
      key={a.id}
    >
      <div
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-2xl"
        style={{ background: `${a.color}20`, color: a.color }}
      >
        {a.icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-gray-900 dark:text-white">
          {a.name}
          {!a.isActive && (
            <span className="ml-2 text-gray-400 text-xs">(inaktiv)</span>
          )}
        </div>
        <div className="text-gray-500 text-xs">
          {a.type === "asset" ? "Aktivkonto" : "Passivkonto / Schulden"}
          {a.startingBalance !== 0 && (
            <> · Startsaldo {fmt(a.startingBalance)}</>
          )}
        </div>
      </div>
      <div
        className={`shrink-0 text-right font-bold text-lg ${
          a.type === "liability"
            ? a.balance > 0
              ? "text-[var(--expense)]"
              : "text-green-600"
            : a.balance >= 0
              ? "text-green-600"
              : "text-[var(--expense)]"
        }`}
      >
        {fmt(a.balance)}
      </div>
      <div className="flex shrink-0 gap-2">
        <button
          className="text-gray-400 transition-colors hover:text-[var(--primary)]"
          onClick={() => openEdit(a)}
          title="Bearbeiten"
          type="button"
        >
          <Pencil size={16} />
        </button>
        <button
          className="text-gray-400 transition-colors hover:text-red-500"
          onClick={() => remove(a)}
          title="Löschen"
          type="button"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-bold text-2xl text-gray-900 dark:text-white">
          Konten
        </h1>
        <button
          className="btn-primary flex items-center gap-2"
          onClick={openCreate}
        >
          <Plus size={18} /> Neues Konto
        </button>
      </div>

      {/* Vermögensübersicht */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="card p-4">
          <div className="text-gray-500 text-xs uppercase tracking-wide">
            Aktiva (Vermögen)
          </div>
          <div className="mt-1 font-bold text-green-600 text-xl">
            {fmt(totalAssets)}
          </div>
        </div>
        <div className="card p-4">
          <div className="text-gray-500 text-xs uppercase tracking-wide">
            Passiva (Schulden)
          </div>
          <div className="mt-1 font-bold text-[var(--expense)] text-xl">
            {fmt(totalLiabilities)}
          </div>
        </div>
        <div className="card p-4">
          <div className="text-gray-500 text-xs uppercase tracking-wide">
            Reinvermögen
          </div>
          <div
            className={`mt-1 font-bold text-xl ${
              netWorth >= 0 ? "text-green-600" : "text-[var(--expense)]"
            }`}
          >
            {fmt(netWorth)}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-12">
          <div className="h-8 w-8 animate-spin rounded-full border-[var(--primary)] border-b-2" />
        </div>
      ) : (
        <>
          {assets.length > 0 && (
            <section className="space-y-3">
              <h2 className="font-semibold text-gray-900 dark:text-white">
                Aktivkonten
              </h2>
              {assets.map(renderAccountCard)}
            </section>
          )}
          {liabilities.length > 0 && (
            <section className="space-y-3">
              <h2 className="font-semibold text-gray-900 dark:text-white">
                Passivkonten
              </h2>
              {liabilities.map(renderAccountCard)}
            </section>
          )}
          {accounts.length === 0 && (
            <div className="card py-12 text-center text-gray-400">
              <p>Noch keine Konten angelegt.</p>
              <p className="text-sm">
                Klick auf „Neues Konto" oben rechts, um zu starten.
              </p>
            </div>
          )}
        </>
      )}

      {/* Anlegen/Bearbeiten-Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-bold text-gray-900 text-lg dark:text-white">
                {editingId ? "Konto bearbeiten" : "Neues Konto"}
              </h3>
              <button
                className="text-gray-400 hover:text-gray-600"
                onClick={() => setModalOpen(false)}
                type="button"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex gap-2">
                {(["asset", "liability"] as const).map((t) => (
                  <button
                    className={`flex-1 rounded-xl py-2 font-medium text-sm transition-all ${
                      form.type === t
                        ? "bg-[var(--primary)] text-white"
                        : "bg-gray-100 text-gray-700 dark:bg-slate-700 dark:text-gray-300"
                    }`}
                    key={t}
                    onClick={() => setForm((f) => ({ ...f, type: t }))}
                    type="button"
                  >
                    {t === "asset"
                      ? "🏦 Aktivkonto"
                      : "💳 Passivkonto / Schulden"}
                  </button>
                ))}
              </div>

              <div>
                <label className="mb-1 block font-medium text-gray-700 text-sm dark:text-gray-300">
                  Name *
                </label>
                <input
                  autoFocus
                  className="input"
                  onChange={(e) =>
                    setForm((f) => ({ ...f, name: e.target.value }))
                  }
                  placeholder={
                    form.type === "asset"
                      ? "z.B. Girokonto, Bargeld"
                      : "z.B. Kreditkarte VISA, Darlehen Auto"
                  }
                  type="text"
                  value={form.name}
                />
              </div>

              <div>
                <label className="mb-1 block font-medium text-gray-700 text-sm dark:text-gray-300">
                  Startsaldo
                  <span className="ml-1 text-gray-400 text-xs">
                    {form.type === "liability"
                      ? "(offene Schuld zu Beginn)"
                      : "(Stand am Tag der Anlage)"}
                  </span>
                </label>
                <input
                  className="input"
                  onChange={(e) =>
                    setForm((f) => ({ ...f, startingBalance: e.target.value }))
                  }
                  step="0.01"
                  type="number"
                  value={form.startingBalance}
                />
              </div>

              <div>
                <label className="mb-1 block font-medium text-gray-700 text-sm dark:text-gray-300">
                  Symbol
                </label>
                <div className="flex flex-wrap gap-2">
                  {ICON_PRESETS.map((emoji) => (
                    <button
                      className={`rounded-xl border-2 p-2 text-2xl transition-all ${
                        form.icon === emoji
                          ? "border-[var(--primary)] bg-[var(--primary)]/10"
                          : "border-transparent hover:bg-gray-100 dark:hover:bg-slate-700"
                      }`}
                      key={emoji}
                      onClick={() => setForm((f) => ({ ...f, icon: emoji }))}
                      type="button"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1 block font-medium text-gray-700 text-sm dark:text-gray-300">
                  Farbe
                </label>
                <div className="flex items-center gap-3">
                  <input
                    className="h-10 w-16 cursor-pointer rounded-lg border border-gray-300"
                    onChange={(e) =>
                      setForm((f) => ({ ...f, color: e.target.value }))
                    }
                    type="color"
                    value={form.color}
                  />
                  <div className="flex flex-wrap gap-2">
                    {COLOR_PRESETS.map((c) => (
                      <button
                        className={`h-8 w-8 rounded-full border-2 transition-all ${
                          form.color === c
                            ? "border-gray-900 dark:border-white"
                            : "border-transparent"
                        }`}
                        key={c}
                        onClick={() => setForm((f) => ({ ...f, color: c }))}
                        style={{ background: c }}
                        type="button"
                      />
                    ))}
                  </div>
                </div>
              </div>

              {editingId && (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    checked={form.isActive}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, isActive: e.target.checked }))
                    }
                    type="checkbox"
                  />
                  <span className="text-gray-700 dark:text-gray-300">
                    Aktiv (in Buchungen auswählbar)
                  </span>
                </label>
              )}

              <div className="flex items-center gap-3 rounded-xl bg-gray-50 p-3 dark:bg-slate-700">
                <span
                  className="flex h-10 w-10 items-center justify-center rounded-xl text-xl"
                  style={{ background: `${form.color}20`, color: form.color }}
                >
                  {form.icon}
                </span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {form.name || "Vorschau"}
                </span>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                className="btn-secondary"
                onClick={() => setModalOpen(false)}
                type="button"
              >
                Abbrechen
              </button>
              <button
                className="btn-primary disabled:opacity-50"
                disabled={saving || !form.name.trim()}
                onClick={save}
                type="button"
              >
                {saving
                  ? "Speichere..."
                  : editingId
                    ? "Aktualisieren"
                    : "Anlegen"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
