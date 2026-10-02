import {
  AlertTriangle,
  Banknote,
  GraduationCap,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Link, useSearchParams } from "react-router-dom";
import BankSyncSettings from "../components/bankSync/BankSyncSettings";
import TargetSelect from "../components/bankSync/TargetSelect";
import {
  type Account,
  accountLabel,
  type Category,
  categoryLabel,
} from "../components/bankSync/types";
import { accountAPI, bankSyncAPI, categoryAPI } from "../services/api";
import { useAuthStore } from "../store/authStore";
import {
  useBankSyncDraftStore,
  useDraftState,
} from "../store/bankSyncDraftStore";

interface ExistingEntry {
  accountId: string | null;
  amount: number;
  Category: Category | null;
  date: string;
  description: string | null;
  id: string;
  isQuickEntry: boolean;
  isRecurring: boolean;
  note: string | null;
  transferTargetAccountId: string | null;
  type: "expense" | "income" | "transfer";
}

type SuggestionSource =
  | "quick"
  | "existing"
  | "rule"
  | "mapping"
  | "ai"
  | "paperless"
  | "account"
  | "manual";

interface PaperlessDoc {
  confidence: "high" | "low";
  correspondent: string | null;
  date: string;
  id: number;
  title: string;
  url: string;
}

interface PaperlessStatus {
  documentsLoaded?: number | null;
  enabled: boolean;
  error: string | null;
  matched: number;
  senderMismatch?: number;
}

interface Suggestion {
  categoryId: string | null;
  confidence?: "high" | "low";
  description: string | null;
  matchedEntry?: ExistingEntry;
  matchTransactionId?: string;
  // Gelernt über Händler + Betrag (wiederkehrend) oder nur den Händler.
  mappingKind?: "amount" | "merchant";
  paperlessDoc?: PaperlessDoc;
  rulePattern?: string;
  source: SuggestionSource;
  // Umbuchung auf/von diesem eigenen Konto statt Kategorie.
  transferAccountId?: string | null;
}

interface Row {
  alreadyImported: boolean;
  amount: number | null;
  counterpartyIban?: string | null;
  counterpartyName: string | null;
  date: string | null;
  purpose: string;
  suggestion: Suggestion | null;
}

// Vom User in der Vorschau bearbeitbare Felder pro Zeile.
interface RowEdit {
  categoryId: string;
  description: string;
  source: SuggestionSource | null;
  transferAccountId: string;
  // User hat die Verknüpfung mit einer vorhandenen Buchung gelöst → wird als
  // neue Buchung importiert.
  unlinked: boolean;
}

// Verschmolzen wird nur, solange die Verknüpfung nicht gelöst wurde.
const isMerge = (edit: RowEdit | undefined) =>
  !edit?.unlinked && (edit?.source === "quick" || edit?.source === "existing");

interface AiStatus {
  enabled: boolean;
  error: string | null;
  requested: number;
}

const MAPPING_FIELDS: { key: string; label: string }[] = [
  { key: "date", label: "Datum" },
  { key: "amount", label: "Betrag" },
  { key: "purpose", label: "Verwendungszweck" },
  { key: "counterpartyName", label: "Empfänger/Auftraggeber" },
  { key: "counterpartyIban", label: "IBAN Gegenkonto" },
];

const SOURCE_BADGES: Record<SuggestionSource, { label: string; cls: string }> =
  {
    quick: {
      label: "✓ Schnellerfassung",
      cls: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
    },
    rule: {
      label: "Regel",
      cls: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300",
    },
    mapping: {
      label: "Gelernt",
      cls: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    },
    ai: {
      label: "✨ KI",
      cls: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300",
    },
    existing: {
      label: "✓ Vorhandene Buchung",
      cls: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
    },
    account: {
      label: "↔ Eigenes Konto (IBAN)",
      cls: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300",
    },
    paperless: {
      label: "📄 Paperless",
      cls: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
    },
    manual: {
      label: "Geändert",
      cls: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
    },
  };

const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
};

function initialEdit(row: Row): RowEdit {
  return {
    categoryId: row.suggestion?.categoryId || "",
    description: row.suggestion?.description || "",
    source: row.suggestion?.source || null,
    transferAccountId: row.suggestion?.transferAccountId || "",
    unlinked: false,
  };
}

// "Unsicher" = kein Vorschlag oder KI-Vorschlag mit niedriger Sicherheit.
function isUncertain(edit: RowEdit | undefined, row: Row) {
  if (!(edit?.categoryId || edit?.transferAccountId)) {
    return true;
  }
  return edit.source === "ai" && row.suggestion?.confidence === "low";
}

type Tab = "import" | "settings";

export default function BankSyncPage() {
  const { currentHousehold } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: Tab =
    searchParams.get("tab") === "settings" ? "settings" : "import";
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  // Vorschau-Entwurf übersteht Seitenwechsel (siehe bankSyncDraftStore).
  const [accountId, setAccountId] = useDraftState("accountId", "");
  const file = useBankSyncDraftStore((s) => s.file);
  const setFile = useBankSyncDraftStore((s) => s.setFile);
  const resetDraft = useBankSyncDraftStore((s) => s.reset);
  const [fileName, setFileName] = useDraftState<string | null>(
    "fileName",
    null
  );
  const [draftHouseholdId, setDraftHouseholdId] = useDraftState<string | null>(
    "householdId",
    null
  );
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [previewing, setPreviewing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [deletingImported, setDeletingImported] = useState(false);

  const [format, setFormat] = useDraftState<"csv" | "mt940" | null>(
    "format",
    null
  );
  const [headers, setHeaders] = useDraftState<string[]>("headers", []);
  const [rows, setRows] = useDraftState<Row[]>("rows", []);
  const [mapping, setMapping] = useDraftState<Record<string, string | null>>(
    "mapping",
    {}
  );
  // Welche Zeilen (per Index) beim Import berücksichtigt werden. Zeilen mit
  // alreadyImported starten abgewählt.
  const [included, setIncluded] = useDraftState<boolean[]>("included", []);
  const [edits, setEdits] = useDraftState<RowEdit[]>("edits", []);
  const [aiStatus, setAiStatus] = useDraftState<AiStatus | null>(
    "aiStatus",
    null
  );
  const [paperlessStatus, setPaperlessStatus] =
    useDraftState<PaperlessStatus | null>("paperlessStatus", null);
  const [unmatchedQuickEntries, setUnmatchedQuickEntries] = useDraftState<
    ExistingEntry[]
  >("unmatchedQuickEntries", []);

  // Entwurf gehört zu einem Haushaltsbuch: beim Wechsel verwerfen.
  useEffect(() => {
    if (!currentHousehold || draftHouseholdId === currentHousehold.id) {
      return;
    }
    resetDraft();
    setDraftHouseholdId(currentHousehold.id);
  }, [currentHousehold, draftHouseholdId, resetDraft, setDraftHouseholdId]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadAccounts = async () => {
    if (!currentHousehold) {
      return;
    }
    setLoadingAccounts(true);
    try {
      const { data } = await accountAPI.getAll(currentHousehold.id);
      setAccounts(data.accounts || []);
      if (data.accounts?.length) {
        setAccountId((prev) => prev || data.accounts[0].id);
      }
    } catch (err: any) {
      toast.error(
        err.response?.data?.error || "Konten konnten nicht geladen werden"
      );
    } finally {
      setLoadingAccounts(false);
    }
  };

  const loadCategories = async () => {
    if (!currentHousehold) {
      return;
    }
    try {
      const { data } = await categoryAPI.getAll(currentHousehold.id);
      setCategories(data.categories || []);
    } catch {
      setCategories([]);
    }
  };

  useEffect(() => {
    loadAccounts();
    loadCategories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentHousehold]);

  const resetPreview = () => {
    setFormat(null);
    setHeaders([]);
    setRows([]);
    setMapping({});
    setIncluded([]);
    setEdits([]);
    setAiStatus(null);
    setPaperlessStatus(null);
    setUnmatchedQuickEntries([]);
  };

  const bootstrapMappings = async () => {
    if (!currentHousehold) {
      return;
    }
    setBootstrapping(true);
    try {
      const { data } = await bankSyncAPI.bootstrapMappings(currentHousehold.id);
      toast.success(
        `Gelernt: ${data.merchantsLearned} Empfänger, ${data.recurringLearned ?? 0} wiederkehrende Zahlungen`
      );
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Lernen fehlgeschlagen");
    } finally {
      setBootstrapping(false);
    }
  };

  const deleteImported = async () => {
    if (!(currentHousehold && accountId)) {
      return;
    }
    if (
      !confirm(
        "Alle bisher per Bank-Sync importierten Buchungen dieses Kontos wirklich löschen? Manuell erfasste Buchungen bleiben unberührt."
      )
    ) {
      return;
    }
    setDeletingImported(true);
    try {
      const { data } = await bankSyncAPI.deleteImported(
        currentHousehold.id,
        accountId
      );
      toast.success(`${data.deleted} importierte Buchungen gelöscht`);
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Löschen fehlgeschlagen");
    } finally {
      setDeletingImported(false);
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0] || null;
    setFile(selectedFile);
    setFileName(selectedFile?.name || null);
    resetPreview();
  };

  const discardPreview = () => {
    setFile(null);
    setFileName(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    resetPreview();
  };

  const applyPreviewResult = (data: any) => {
    const newRows: Row[] = data.rows || [];
    setFormat(data.format);
    setHeaders(data.headers || []);
    setRows(newRows);
    setMapping(data.suggestedMapping || {});
    setIncluded(newRows.map((r) => !r.alreadyImported));
    setEdits(newRows.map(initialEdit));
    setAiStatus(data.aiStatus || null);
    setPaperlessStatus(data.paperlessStatus || null);
    setUnmatchedQuickEntries(data.unmatchedQuickEntries || []);
  };

  const updateEdit = (index: number, patch: Partial<RowEdit>) => {
    setEdits((prev) =>
      prev.map((e, i) =>
        i === index
          ? {
              ...e,
              ...patch,
              // Verknüpfte Buchungen bleiben verknüpft (werden verschmolzen),
              // alles andere gilt nach einer Änderung als manuell.
              source: isMerge(e) ? e.source : "manual",
            }
          : e
      )
    );
  };

  const unlinkMatch = (index: number) => {
    setEdits((prev) =>
      prev.map((e, i) =>
        i === index ? { ...e, unlinked: true, source: "manual" } : e
      )
    );
  };

  const deselectUncertain = () => {
    setIncluded((prev) =>
      prev.map((v, i) => v && !isUncertain(edits[i], rows[i]))
    );
  };

  const dismissQuickEntry = async (entry: ExistingEntry) => {
    try {
      await bankSyncAPI.dismissQuickEntry(entry.id);
      setUnmatchedQuickEntries((prev) => prev.filter((e) => e.id !== entry.id));
      toast.success("Wird nicht mehr abgeglichen");
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Fehlgeschlagen");
    }
  };

  const preview = async () => {
    if (!(currentHousehold && accountId && file)) {
      toast.error("Konto und Datei auswählen");
      return;
    }
    setPreviewing(true);
    try {
      const { data } = await bankSyncAPI.preview(
        currentHousehold.id,
        accountId,
        file
      );
      applyPreviewResult(data);
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Vorschau fehlgeschlagen");
    } finally {
      setPreviewing(false);
    }
  };

  // Bei geänderter Spalten-Zuordnung erneut mit dem Server abgleichen (Datum/
  // Betrag müssen neu geparst + Duplikate neu geprüft werden).
  const updateMapping = async (field: string, header: string) => {
    if (!(currentHousehold && accountId)) {
      return;
    }
    if (!file) {
      toast.error("Bitte die Datei erneut auswählen, um die Spalten zu ändern");
      return;
    }
    const newMapping = { ...mapping, [field]: header || null };
    setMapping(newMapping);
    setPreviewing(true);
    try {
      const { data } = await bankSyncAPI.preview(
        currentHousehold.id,
        accountId,
        file,
        newMapping
      );
      applyPreviewResult(data);
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Vorschau fehlgeschlagen");
    } finally {
      setPreviewing(false);
    }
  };

  const toggleIncluded = (index: number) => {
    setIncluded((prev) => prev.map((v, i) => (i === index ? !v : v)));
  };

  const doImport = async () => {
    if (!(currentHousehold && accountId && format)) {
      return;
    }
    const selected = rows
      .map((row, i) => ({ row, edit: edits[i], i }))
      .filter(({ i }) => included[i])
      .map(({ row, edit }) => ({
        date: row.date,
        amount: row.amount,
        purpose: row.purpose,
        counterpartyName: row.counterpartyName,
        categoryId: edit?.categoryId || null,
        transferAccountId: edit?.transferAccountId || null,
        description: edit?.description || null,
        suggestionSource: edit?.source || null,
        matchTransactionId: isMerge(edit)
          ? row.suggestion?.matchTransactionId || null
          : null,
        paperlessDocId: row.suggestion?.paperlessDoc?.id || null,
      }));
    if (selected.length === 0) {
      toast.error("Keine Buchungen ausgewählt");
      return;
    }
    setImporting(true);
    try {
      const { data } = await bankSyncAPI.import(
        currentHousehold.id,
        accountId,
        format,
        selected,
        format === "csv" ? mapping : undefined
      );
      const parts = [`${data.imported} neu importiert`];
      if (data.merged) {
        parts.push(`${data.merged} vorhandene Buchungen ergänzt`);
      }
      if (data.transfers) {
        parts.push(`${data.transfers} Umbuchungen`);
      }
      parts.push(`${data.skipped} Duplikate übersprungen`);
      parts.push(`${data.uncategorized} ohne Kategorie`);
      if (data.learned) {
        parts.push(`${data.learned} Empfänger gelernt`);
      }
      toast.success(parts.join(", "));
      discardPreview();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Import fehlgeschlagen");
    } finally {
      setImporting(false);
    }
  };

  const fmtAmount = (n: number | null) =>
    n === null
      ? "-"
      : new Intl.NumberFormat("de-DE", {
          style: "currency",
          currency: currentHousehold?.currency || "EUR",
        }).format(n);

  const selectedCount = included.filter(Boolean).length;
  const warnCount = rows.filter((r) => r.alreadyImported).length;
  const mergeCount = rows.filter((_, i) => isMerge(edits[i])).length;
  const uncertainSelectedCount = rows.filter(
    (r, i) => included[i] && isUncertain(edits[i], r)
  ).length;

  const tabs: { key: Tab; label: string }[] = [
    { key: "import", label: "Import" },
    { key: "settings", label: "Zuordnung & KI" },
  ];

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-bold text-2xl text-gray-900 dark:text-white">
          Bank-Sync
        </h1>
        <div className="flex gap-2">
          {tabs.map((t) => (
            <button
              className={`rounded-xl px-3 py-1.5 font-medium text-sm transition-all ${tab === t.key ? "bg-[var(--primary)] text-white" : "bg-white text-gray-700 dark:bg-slate-800 dark:text-gray-300"}`}
              key={t.key}
              onClick={() =>
                setSearchParams(t.key === "settings" ? { tab: "settings" } : {})
              }
              type="button"
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "settings" && currentHousehold && (
        <>
          <BankSyncSettings
            accounts={accounts}
            categories={categories}
            householdId={currentHousehold.id}
          />
          <div className="card space-y-4 p-4">
            <div>
              <h2 className="font-semibold text-gray-900 dark:text-white">
                Wartung
              </h2>
              <p className="text-gray-500 text-xs dark:text-gray-400">
                Selten gebrauchte Werkzeuge. Im normalen Ablauf brauchst du sie
                nicht.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="max-w-2xl text-gray-600 text-sm dark:text-gray-300">
                Übernimmt einmalig die häufigste Kategorie pro
                Empfänger/Auftraggeber aus deinen bereits bestehenden Buchungen,
                damit künftige Importe direkt richtig zugeordnet werden.
                Wiederkehrende Zahlungen (gleicher Empfänger und Betrag) lernt
                sie mit Beschreibung. Bei PayPal, Klarna &amp; Co. zählt der
                Händler aus dem Verwendungszweck.
              </p>
              <button
                className="btn-secondary flex shrink-0 items-center gap-2 disabled:opacity-50"
                disabled={bootstrapping}
                onClick={bootstrapMappings}
                type="button"
              >
                <GraduationCap size={16} />
                {bootstrapping
                  ? "Lerne..."
                  : "Aus bestehenden Buchungen lernen"}
              </button>
            </div>
            <div className="flex flex-wrap items-end justify-between gap-3 border-gray-100 border-t pt-4 dark:border-slate-800">
              <div className="max-w-2xl space-y-2">
                <p className="text-gray-600 text-sm dark:text-gray-300">
                  Löscht alle per Bank-Sync importierten Buchungen eines Kontos,
                  z. B. um eine Datei nach einer Import-Verbesserung neu
                  einzulesen. Von Hand erfasste Buchungen bleiben unberührt.
                </p>
                <select
                  aria-label="Konto"
                  className="input max-w-xs"
                  disabled={loadingAccounts}
                  onChange={(e) => setAccountId(e.target.value)}
                  value={accountId}
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.icon} {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <button
                className="flex shrink-0 items-center gap-2 text-red-600 text-sm hover:text-red-700 disabled:opacity-50 dark:text-red-400"
                disabled={!accountId || deletingImported}
                onClick={deleteImported}
                type="button"
              >
                <Trash2 size={14} />
                {deletingImported
                  ? "Lösche..."
                  : "Importierte Buchungen löschen"}
              </button>
            </div>
          </div>
        </>
      )}

      {tab === "import" && (
        <>
          <div className="card space-y-4 p-4">
            <p className="text-gray-600 text-sm dark:text-gray-300">
              Exportiere Umsätze aus deinem Online-Banking als CSV oder MT940
              (Sparda-Bank Nürnberg: CSV/MT940 im Online-Banking, ING: CSV unter
              „Umsätze") und lade die Datei hier hoch.
            </p>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block font-medium text-gray-700 text-sm dark:text-gray-300">
                  Ziel-Konto
                </label>
                <select
                  className="input"
                  disabled={loadingAccounts}
                  onChange={(e) => {
                    setAccountId(e.target.value);
                    resetPreview();
                  }}
                  value={accountId}
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.icon} {a.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block font-medium text-gray-700 text-sm dark:text-gray-300">
                  Datei (CSV oder MT940)
                </label>
                <input
                  accept=".csv,.sta,.txt,.mt940,.mta"
                  className="input"
                  onChange={onFileChange}
                  ref={fileInputRef}
                  type="file"
                />
                {fileName && !file && (
                  <p className="mt-1 text-gray-500 text-xs dark:text-gray-400">
                    Vorschau von „{fileName}“ ist noch da. Für eine neue
                    Vorschau die Datei erneut auswählen.
                  </p>
                )}
                {fileName && file && (
                  <p className="mt-1 text-gray-500 text-xs dark:text-gray-400">
                    Ausgewählt: {fileName}
                  </p>
                )}
              </div>
            </div>

            <button
              className="btn-secondary flex items-center gap-2 disabled:opacity-50"
              disabled={!(accountId && file) || previewing}
              onClick={preview}
              type="button"
            >
              <Upload size={16} />
              {previewing ? "Analysiere..." : "Vorschau"}
            </button>
            {previewing && (
              <p className="text-gray-500 text-xs dark:text-gray-400">
                Mit eingeschalteter KI kann die Vorschau etwas dauern, mit einem
                eigenen KI-Server je nach Hardware auch mehrere Minuten.
              </p>
            )}
          </div>

          {format && (
            <div className="card space-y-4 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-semibold text-gray-900 dark:text-white">
                  {rows.length} Buchungen erkannt ({format.toUpperCase()}) ·{" "}
                  {selectedCount} zum Import ausgewählt
                  {mergeCount > 0 && (
                    <span className="ml-2 text-green-700 text-sm dark:text-green-400">
                      {mergeCount} vorhandene Buchungen werden ergänzt
                      (Bankdatum gilt)
                    </span>
                  )}
                  {warnCount > 0 && (
                    <span className="ml-2 flex items-center gap-1 text-amber-600 text-sm dark:text-amber-400">
                      <AlertTriangle size={14} />
                      {warnCount} bereits importiert (abgewählt)
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  {uncertainSelectedCount > 0 && (
                    <button
                      className="btn-secondary text-sm"
                      onClick={deselectUncertain}
                      title="Buchungen ohne Kategorie oder mit unsicherem KI-Vorschlag abwählen"
                      type="button"
                    >
                      {uncertainSelectedCount} unsichere abwählen
                    </button>
                  )}
                  <button
                    className="btn-secondary text-sm"
                    disabled={importing}
                    onClick={discardPreview}
                    type="button"
                  >
                    Verwerfen
                  </button>
                  <button
                    className="btn-primary disabled:opacity-50"
                    disabled={importing || selectedCount === 0}
                    onClick={doImport}
                    type="button"
                  >
                    {importing
                      ? "Importiere..."
                      : `${selectedCount} importieren`}
                  </button>
                </div>
              </div>

              {!paperlessStatus?.error &&
                paperlessStatus?.enabled &&
                paperlessStatus.matched === 0 &&
                paperlessStatus.documentsLoaded !== null &&
                paperlessStatus.documentsLoaded !== undefined && (
                  <p className="text-gray-400 text-xs">
                    📄 Paperless: {paperlessStatus.documentsLoaded} Dokumente im
                    Zeitraum der Datei geprüft, keine passende Rechnung
                    gefunden.
                  </p>
                )}
              {paperlessStatus?.error && (
                <p className="rounded-lg bg-amber-50 p-2 text-amber-800 text-xs dark:bg-amber-950/30 dark:text-amber-300">
                  {paperlessStatus.error}
                </p>
              )}
              {!paperlessStatus?.error &&
                (paperlessStatus?.matched ?? 0) > 0 && (
                  <p className="text-orange-700 text-xs dark:text-orange-300">
                    📄 {paperlessStatus?.matched} Buchungen mit einem
                    Paperless-Dokument verknüpft. Die Beschreibung kommt aus dem
                    Dokumenttitel.
                  </p>
                )}
              {aiStatus?.enabled && aiStatus.error && (
                <p className="rounded-lg bg-amber-50 p-2 text-amber-800 text-xs dark:bg-amber-950/30 dark:text-amber-300">
                  {aiStatus.error}
                </p>
              )}
              {aiStatus?.enabled &&
                !aiStatus.error &&
                aiStatus.requested > 0 && (
                  <p className="flex items-center gap-1 text-violet-700 text-xs dark:text-violet-300">
                    <Sparkles size={12} /> KI hat {aiStatus.requested} Buchungen
                    ohne Regel oder gelernten Empfänger eingeordnet. Bitte kurz
                    prüfen.
                  </p>
                )}
              {!aiStatus?.enabled && (
                <p className="text-gray-400 text-xs">
                  Tipp: Unter{" "}
                  <button
                    className="text-[var(--primary)] underline"
                    onClick={() => setSearchParams({ tab: "settings" })}
                    type="button"
                  >
                    Zuordnung &amp; KI
                  </button>{" "}
                  kannst du Regeln anlegen und KI-Vorschläge einschalten.
                </p>
              )}

              {unmatchedQuickEntries.length > 0 && (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
                  <p className="mb-2 font-medium text-amber-900 text-sm dark:text-amber-200">
                    {unmatchedQuickEntries.length} Schnellerfassungen aus diesem
                    Zeitraum haben keinen passenden Bankumsatz. War es eine
                    Barzahlung, oder stimmt der Betrag nicht?
                  </p>
                  <ul className="space-y-1">
                    {unmatchedQuickEntries.map((e) => (
                      <li
                        className="flex items-center justify-between gap-3 text-amber-900 text-sm dark:text-amber-200"
                        key={e.id}
                      >
                        <span>
                          {fmtDate(e.date)} · {fmtAmount(e.amount)} ·{" "}
                          {e.Category
                            ? categoryLabel(e.Category)
                            : "ohne Kategorie"}
                          {e.description && ` · „${e.description}“`}
                        </span>
                        <button
                          className="flex shrink-0 items-center gap-1 text-xs underline"
                          onClick={() => dismissQuickEntry(e)}
                          type="button"
                        >
                          <Banknote size={12} /> Bar bezahlt, nicht mehr
                          abgleichen
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {format === "csv" && (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
                  {MAPPING_FIELDS.map((f) => (
                    <div key={f.key}>
                      <label className="mb-1 block font-medium text-gray-700 text-xs dark:text-gray-300">
                        {f.label}
                      </label>
                      <select
                        className="input"
                        disabled={previewing}
                        onChange={(e) => updateMapping(f.key, e.target.value)}
                        value={mapping[f.key] || ""}
                      >
                        <option value="">— nicht zuordnen —</option>
                        {headers.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-gray-200 border-b text-left text-gray-500 dark:border-slate-700">
                      <th className="py-2 pr-4">
                        <span className="sr-only">Übernehmen</span>
                      </th>
                      <th className="py-2 pr-4">Datum</th>
                      <th className="py-2 pr-4">Betrag</th>
                      <th className="py-2 pr-4">Verwendungszweck</th>
                      <th className="py-2 pr-4">Empfänger/Auftraggeber</th>
                      <th className="py-2 pr-4">
                        Kategorie &amp; Beschreibung
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => {
                      const flagged = r.alreadyImported;
                      return (
                        <tr
                          className={`border-gray-100 border-b dark:border-slate-800 ${
                            flagged ? "bg-amber-50 dark:bg-amber-950/30" : ""
                          }`}
                          key={`${r.date}-${r.amount}-${i}`}
                        >
                          <td className="py-2 pr-4">
                            <input
                              checked={included[i] ?? true}
                              onChange={() => toggleIncluded(i)}
                              type="checkbox"
                            />
                          </td>
                          <td className="py-2 pr-4">{r.date || "-"}</td>
                          <td
                            className={`py-2 pr-4 ${
                              (r.amount ?? 0) < 0
                                ? "text-[var(--expense)]"
                                : "text-green-600"
                            }`}
                          >
                            {fmtAmount(r.amount)}
                          </td>
                          <td className="py-2 pr-4">
                            {r.purpose}
                            {flagged && (
                              <span className="ml-2 text-amber-600 text-xs dark:text-amber-400">
                                (bereits importiert)
                              </span>
                            )}
                          </td>
                          <td className="py-2 pr-4">
                            {r.counterpartyName || "-"}
                          </td>
                          <td className="min-w-[16rem] py-2 pr-4">
                            {!r.alreadyImported && edits[i] && (
                              <SuggestionCell
                                accountId={accountId}
                                accounts={accounts}
                                bankDate={r.date}
                                categories={categories}
                                edit={edits[i]}
                                onChange={(patch) => updateEdit(i, patch)}
                                onUnlink={() => unlinkMatch(i)}
                                suggestion={r.suggestion}
                              />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <p className="text-gray-400 text-sm">
            Bereits importierte Buchungen findest du wie gewohnt unter{" "}
            <Link className="text-[var(--primary)]" to="/transactions">
              Buchungen
            </Link>
            .
          </p>
        </>
      )}
    </div>
  );
}

interface SuggestionCellProps {
  accountId: string;
  accounts: Account[];
  bankDate: string | null;
  categories: Category[];
  edit: RowEdit;
  onChange: (patch: Partial<RowEdit>) => void;
  onUnlink: () => void;
  suggestion: Suggestion | null;
}

function mergeBadgeLabel(entry: ExistingEntry | undefined) {
  if (entry?.type === "transfer") {
    return entry.isRecurring ? "✓ Umbuchung (Dauerauftrag)" : "✓ Umbuchung";
  }
  if (entry?.isQuickEntry) {
    return "✓ Schnellerfassung";
  }
  return entry?.isRecurring ? "✓ Dauerauftrag" : "✓ Vorhandene Buchung";
}

function SuggestionCell({
  accountId,
  accounts,
  bankDate,
  categories,
  edit,
  onChange,
  onUnlink,
  suggestion,
}: SuggestionCellProps) {
  const merged = isMerge(edit);
  const entry = suggestion?.matchedEntry;
  const baseBadge = edit.source ? SOURCE_BADGES[edit.source] : null;
  let badge = baseBadge;
  if (baseBadge && merged) {
    badge = { ...baseBadge, label: mergeBadgeLabel(entry) };
  } else if (
    baseBadge &&
    edit.source === "mapping" &&
    suggestion?.mappingKind === "amount"
  ) {
    badge = { ...baseBadge, label: "Gelernt · wiederkehrend" };
  }
  const dateChanges = merged && entry && bankDate && entry.date !== bankDate;
  // Vorhandene Umbuchung wird nur verknüpft, nicht umgewidmet.
  const lockedTransfer = merged && entry?.type === "transfer";
  const transferAccount = accounts.find((a) => a.id === edit.transferAccountId);
  const lowConfidence =
    edit.source === "ai" && suggestion?.confidence === "low";
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-1">
        {badge && (
          <span
            className={`rounded-full px-2 py-0.5 font-semibold text-[10px] ${badge.cls}`}
          >
            {badge.label}
            {lowConfidence && " · unsicher"}
          </span>
        )}
        {!badge && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-[10px] text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
            ? bitte zuordnen
          </span>
        )}
        {edit.source === "rule" && suggestion?.rulePattern && (
          <span className="text-[10px] text-gray-400">
            enthält „{suggestion.rulePattern}“
          </span>
        )}
        {merged && entry && (
          <span className="text-[10px] text-gray-400">
            {dateChanges
              ? `Datum ${fmtDate(entry.date)} → ${fmtDate(bankDate)}`
              : `vom ${fmtDate(entry.date)}`}
          </span>
        )}
        {merged && (
          <button
            className="text-[10px] text-gray-400 underline hover:text-red-600"
            onClick={onUnlink}
            title="Falsch zugeordnet? Dann wird der Umsatz als neue Buchung importiert und die vorhandene Buchung bleibt unverändert."
            type="button"
          >
            Verknüpfung lösen
          </button>
        )}
      </div>
      {suggestion?.paperlessDoc && (
        <a
          className="block truncate text-[11px] text-orange-700 hover:underline dark:text-orange-300"
          href={suggestion.paperlessDoc.url}
          rel="noopener noreferrer"
          target="_blank"
          title={`${suggestion.paperlessDoc.title} vom ${fmtDate(suggestion.paperlessDoc.date)}${suggestion.paperlessDoc.confidence === "low" ? ", Absender nicht eindeutig: bitte prüfen" : ""}`}
        >
          📄 {suggestion.paperlessDoc.title}
          {suggestion.paperlessDoc.confidence === "low" && " (prüfen)"}
        </a>
      )}
      {lockedTransfer ? (
        <p className="text-gray-600 text-xs dark:text-gray-300">
          ↔ Umbuchung{" "}
          {(entry?.accountId === accountId ? "auf " : "von ") +
            (transferAccount ? accountLabel(transferAccount) : "anderem Konto")}
        </p>
      ) : (
        <TargetSelect
          accounts={accounts}
          ariaLabel="Kategorie oder Umbuchung"
          categories={categories}
          categoryId={edit.categoryId}
          className="input py-1 text-xs"
          excludeAccountId={accountId}
          onChange={onChange}
          placeholder="— ohne Kategorie —"
          transferAccountId={edit.transferAccountId}
        />
      )}
      <input
        aria-label="Beschreibung"
        className="input py-1 text-xs"
        onChange={(e) => onChange({ description: e.target.value })}
        placeholder="Beschreibung (leer = Verwendungszweck)"
        value={edit.description}
      />
    </div>
  );
}
