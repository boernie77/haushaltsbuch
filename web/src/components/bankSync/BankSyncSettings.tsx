import { Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Link } from "react-router-dom";
import { bankSyncAPI } from "../../services/api";
import { type Category, categoryLabel } from "./types";

interface Settings {
  aiDescriptions: boolean;
  aiEnabled: boolean;
  aiKeyAvailable: boolean;
  aiModel: string;
  aiModels: { id: string; label: string }[];
  matchQuickEntries: boolean;
  rulesEnabled: boolean;
}

type RuleField = "any" | "counterparty" | "purpose" | "iban";

interface Rule {
  Category?: Category;
  categoryId: string;
  description: string | null;
  field: RuleField;
  id: string;
  maxAmount: string | null;
  minAmount: string | null;
  pattern: string;
}

interface RuleDraft {
  categoryId: string;
  description: string;
  field: RuleField;
  maxAmount: string;
  minAmount: string;
  pattern: string;
}

const EMPTY_DRAFT: RuleDraft = {
  categoryId: "",
  description: "",
  field: "counterparty",
  maxAmount: "",
  minAmount: "",
  pattern: "",
};

const FIELD_LABELS: Record<RuleField, string> = {
  any: "Empfänger, Zweck oder IBAN",
  counterparty: "Empfänger/Auftraggeber",
  purpose: "Verwendungszweck",
  iban: "IBAN",
};

interface ToggleRowProps {
  checked: boolean;
  description: string;
  disabled?: boolean;
  label: string;
  onChange: (value: boolean) => void;
}

function ToggleRow({
  checked,
  description,
  disabled,
  label,
  onChange,
}: ToggleRowProps) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 border-gray-100 border-b py-3 last:border-0 dark:border-slate-800">
      <span>
        <span className="block font-medium text-gray-900 text-sm dark:text-white">
          {label}
        </span>
        <span className="block text-gray-500 text-xs dark:text-gray-400">
          {description}
        </span>
      </span>
      <input
        checked={checked}
        className="mt-1 h-4 w-4 shrink-0"
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        type="checkbox"
      />
    </label>
  );
}

interface RuleFormProps {
  categories: Category[];
  draft: RuleDraft;
  editing: boolean;
  onCancel: () => void;
  onChange: (draft: RuleDraft) => void;
  onSubmit: () => void;
  saving: boolean;
}

function RuleForm({
  categories,
  draft,
  editing,
  onCancel,
  onChange,
  onSubmit,
  saving,
}: RuleFormProps) {
  const set = (patch: Partial<RuleDraft>) => onChange({ ...draft, ...patch });
  return (
    <form
      className="grid grid-cols-1 gap-3 rounded-xl border border-gray-200 p-3 md:grid-cols-6 dark:border-slate-700"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <label className="block text-xs md:col-span-2">
        <span className="mb-1 block font-medium text-gray-700 dark:text-gray-300">
          Wenn
        </span>
        <select
          className="input"
          onChange={(e) => set({ field: e.target.value as RuleField })}
          value={draft.field}
        >
          {Object.entries(FIELD_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-xs md:col-span-2">
        <span className="mb-1 block font-medium text-gray-700 dark:text-gray-300">
          enthält
        </span>
        <input
          className="input"
          onChange={(e) => set({ pattern: e.target.value })}
          placeholder="z. B. REWE"
          required
          value={draft.pattern}
        />
      </label>
      <label className="block text-xs">
        <span className="mb-1 block font-medium text-gray-700 dark:text-gray-300">
          Betrag ab (€)
        </span>
        <input
          className="input"
          inputMode="decimal"
          onChange={(e) => set({ minAmount: e.target.value })}
          placeholder="optional"
          value={draft.minAmount}
        />
      </label>
      <label className="block text-xs">
        <span className="mb-1 block font-medium text-gray-700 dark:text-gray-300">
          bis (€)
        </span>
        <input
          className="input"
          inputMode="decimal"
          onChange={(e) => set({ maxAmount: e.target.value })}
          placeholder="optional"
          value={draft.maxAmount}
        />
      </label>
      <label className="block text-xs md:col-span-3">
        <span className="mb-1 block font-medium text-gray-700 dark:text-gray-300">
          dann Kategorie
        </span>
        <select
          className="input"
          onChange={(e) => set({ categoryId: e.target.value })}
          required
          value={draft.categoryId}
        >
          <option value="">— wählen —</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {categoryLabel(c)}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-xs md:col-span-3">
        <span className="mb-1 block font-medium text-gray-700 dark:text-gray-300">
          und Beschreibung
        </span>
        <input
          className="input"
          onChange={(e) => set({ description: e.target.value })}
          placeholder="optional, z. B. Wocheneinkauf"
          value={draft.description}
        />
      </label>
      <div className="flex gap-2 md:col-span-6">
        <button
          className="btn-primary disabled:opacity-50"
          disabled={saving}
          type="submit"
        >
          {editing ? "Regel speichern" : "Regel anlegen"}
        </button>
        <button className="btn-secondary" onClick={onCancel} type="button">
          Abbrechen
        </button>
      </div>
    </form>
  );
}

function describeRule(rule: Rule) {
  const amountParts: string[] = [];
  if (rule.minAmount !== null) {
    amountParts.push(`ab ${rule.minAmount} €`);
  }
  if (rule.maxAmount !== null) {
    amountParts.push(`bis ${rule.maxAmount} €`);
  }
  const amount = amountParts.length ? `, ${amountParts.join(" ")}` : "";
  return `${FIELD_LABELS[rule.field]} enthält „${rule.pattern}“${amount}`;
}

interface Props {
  categories: Category[];
  householdId: string;
}

export default function BankSyncSettings({ categories, householdId }: Props) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [rules, setRules] = useState<Rule[]>([]);
  const [draft, setDraft] = useState<RuleDraft | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [savingRule, setSavingRule] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [settingsRes, rulesRes] = await Promise.all([
          bankSyncAPI.getSettings(householdId),
          bankSyncAPI.getRules(householdId),
        ]);
        setSettings(settingsRes.data);
        setRules(rulesRes.data.rules || []);
      } catch (err: any) {
        toast.error(err.response?.data?.error || "Einstellungen nicht ladbar");
      }
    };
    load();
  }, [householdId]);

  const updateSetting = async (patch: Partial<Settings>) => {
    if (!settings) {
      return;
    }
    const previous = settings;
    setSettings({ ...settings, ...patch });
    try {
      const { data } = await bankSyncAPI.updateSettings(householdId, patch);
      setSettings(data);
    } catch (err: any) {
      setSettings(previous);
      toast.error(err.response?.data?.error || "Speichern fehlgeschlagen");
    }
  };

  const startEdit = (rule: Rule) => {
    setEditingId(rule.id);
    setDraft({
      categoryId: rule.categoryId,
      description: rule.description || "",
      field: rule.field,
      maxAmount: rule.maxAmount ?? "",
      minAmount: rule.minAmount ?? "",
      pattern: rule.pattern,
    });
  };

  const closeForm = () => {
    setDraft(null);
    setEditingId(null);
  };

  const reloadRules = async () => {
    const { data } = await bankSyncAPI.getRules(householdId);
    setRules(data.rules || []);
  };

  const saveRule = async () => {
    if (!draft) {
      return;
    }
    setSavingRule(true);
    try {
      if (editingId) {
        await bankSyncAPI.updateRule(editingId, { ...draft });
      } else {
        await bankSyncAPI.createRule(householdId, { ...draft });
      }
      await reloadRules();
      closeForm();
      toast.success("Regel gespeichert");
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Speichern fehlgeschlagen");
    } finally {
      setSavingRule(false);
    }
  };

  const deleteRule = async (rule: Rule) => {
    if (!confirm(`Regel „${rule.pattern}“ löschen?`)) {
      return;
    }
    try {
      await bankSyncAPI.deleteRule(rule.id);
      setRules((prev) => prev.filter((r) => r.id !== rule.id));
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Löschen fehlgeschlagen");
    }
  };

  if (!settings) {
    return <div className="card p-4 text-gray-500 text-sm">Lade…</div>;
  }

  return (
    <div className="space-y-6">
      <div className="card p-4">
        <h2 className="mb-1 font-semibold text-gray-900 dark:text-white">
          Automatische Zuordnung
        </h2>
        <p className="mb-2 text-gray-500 text-xs dark:text-gray-400">
          Beim Import wird für jede Buchung ein Vorschlag für Kategorie und
          Beschreibung gesucht, in dieser Reihenfolge: Schnellerfassung → Regeln
          → gelernte Empfänger → KI. Du kannst jeden Vorschlag vor dem Import
          ändern.
        </p>
        <ToggleRow
          checked={settings.matchQuickEntries}
          description="Buchungen, die du in der App per Schnellerfassung angelegt hast, werden mit dem Bankumsatz verschmolzen (gleicher Betrag, Datum ±5 Tage). Deine Kategorie und Notiz bleiben erhalten."
          label="Schnellerfassungen abgleichen"
          onChange={(v) => updateSetting({ matchQuickEntries: v })}
        />
        <ToggleRow
          checked={settings.rulesEnabled}
          description="Deine eigenen Regeln (siehe unten) anwenden."
          label="Regeln anwenden"
          onChange={(v) => updateSetting({ rulesEnabled: v })}
        />
      </div>

      <div className="card p-4">
        <h2 className="mb-1 flex items-center gap-2 font-semibold text-gray-900 dark:text-white">
          <Sparkles size={16} /> KI-Vorschläge (Claude)
        </h2>
        <p className="mb-2 text-gray-500 text-xs dark:text-gray-400">
          Für Buchungen ohne Schnellerfassung, Regel oder gelernten Empfänger
          fragt der Import die KI. Dabei gehen nur Betrag, Empfängername,
          Verwendungszweck und deine Kategorienamen an Anthropic. Keine IBAN,
          kein Kontostand. Die KI läuft nur beim Import, nie im Hintergrund.
          Korrigierst oder bestätigst du einen KI-Vorschlag, merkt sich die App
          den Empfänger. Beim nächsten Mal ist dafür keine KI mehr nötig.
        </p>
        {!settings.aiKeyAvailable && (
          <p className="mb-2 rounded-lg bg-amber-50 p-2 text-amber-800 text-xs dark:bg-amber-950/30 dark:text-amber-300">
            Kein API-Key verfügbar. Hinterlege einen unter{" "}
            <Link className="underline" to="/household">
              Haushalt → KI-Einstellungen
            </Link>
            .
          </p>
        )}
        <ToggleRow
          checked={settings.aiEnabled}
          description="Kosten mit Haiku: etwa 1 Cent pro Import mit ~100 Buchungen."
          label="KI-Vorschläge aktivieren"
          onChange={(v) => updateSetting({ aiEnabled: v })}
        />
        <label className="flex items-center justify-between gap-4 border-gray-100 border-b py-3 dark:border-slate-800">
          <span>
            <span className="block font-medium text-gray-900 text-sm dark:text-white">
              KI-Modell
            </span>
            <span className="block text-gray-500 text-xs dark:text-gray-400">
              Haiku reicht für die Zuordnung meistens aus.
            </span>
          </span>
          <select
            className="input max-w-xs"
            disabled={!settings.aiEnabled}
            onChange={(e) => updateSetting({ aiModel: e.target.value })}
            value={settings.aiModel}
          >
            {settings.aiModels.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <ToggleRow
          checked={settings.aiDescriptions}
          description="Kurzer Oberbegriff wie „Lebensmitteleinkauf“ statt des rohen Verwendungszwecks. Der Verwendungszweck bleibt in der Notiz erhalten."
          disabled={!settings.aiEnabled}
          label="KI schreibt Beschreibung"
          onChange={(v) => updateSetting({ aiDescriptions: v })}
        />
      </div>

      <div className="card space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold text-gray-900 dark:text-white">
              Regeln
            </h2>
            <p className="text-gray-500 text-xs dark:text-gray-400">
              Die erste passende Regel gewinnt. Groß-/Kleinschreibung spielt
              keine Rolle.
            </p>
          </div>
          {!draft && (
            <button
              className="btn-secondary flex items-center gap-2"
              onClick={() => setDraft(EMPTY_DRAFT)}
              type="button"
            >
              <Plus size={16} /> Neue Regel
            </button>
          )}
        </div>

        {draft && !editingId && (
          <RuleForm
            categories={categories}
            draft={draft}
            editing={false}
            onCancel={closeForm}
            onChange={setDraft}
            onSubmit={saveRule}
            saving={savingRule}
          />
        )}

        {rules.length === 0 && !draft && (
          <p className="text-gray-400 text-sm">Noch keine Regeln angelegt.</p>
        )}

        <ul className="space-y-2">
          {rules.map((rule) =>
            editingId === rule.id && draft ? (
              <li key={rule.id}>
                <RuleForm
                  categories={categories}
                  draft={draft}
                  editing
                  onCancel={closeForm}
                  onChange={setDraft}
                  onSubmit={saveRule}
                  saving={savingRule}
                />
              </li>
            ) : (
              <li
                className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 px-3 py-2 text-sm dark:border-slate-800"
                key={rule.id}
              >
                <span className="text-gray-700 dark:text-gray-300">
                  {describeRule(rule)} →{" "}
                  <strong className="text-gray-900 dark:text-white">
                    {rule.Category ? categoryLabel(rule.Category) : "?"}
                  </strong>
                  {rule.description && (
                    <span className="text-gray-500">
                      {" "}
                      · „{rule.description}“
                    </span>
                  )}
                </span>
                <span className="flex shrink-0 gap-2">
                  <button
                    aria-label="Regel bearbeiten"
                    className="text-gray-400 hover:text-gray-700 dark:hover:text-white"
                    onClick={() => startEdit(rule)}
                    type="button"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    aria-label="Regel löschen"
                    className="text-gray-400 hover:text-red-600"
                    onClick={() => deleteRule(rule)}
                    type="button"
                  >
                    <Trash2 size={14} />
                  </button>
                </span>
              </li>
            )
          )}
        </ul>
      </div>
    </div>
  );
}
