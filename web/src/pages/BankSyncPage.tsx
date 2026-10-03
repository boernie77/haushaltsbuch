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
  categoryId: string | null;
  date: string;
  description: string | null;
  id: string;
  isQuickEntry: boolean;
  isRecurring: boolean;
  note: string | null;
  subAccountPeriodMonth: number | null;
  subAccountPeriodYear: number | null;
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
  // Gelernt über Händler + Betrag (wiederkehrend) oder nur den Händler.
  mappingKind?: "amount" | "merchant";
  matchDistanceDays?: number;
  matchedEntry?: ExistingEntry;
  // Nur über die "späte Abbuchung" gefunden (z.B. Spesen per PayPal/Klarna).
  matchLate?: boolean;
  matchTransactionId?: string;
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
  // Von Hand mit einer offenen Buchung verknüpft (Liste "openEntries").
  // Optional, weil ältere Entwürfe im sessionStorage das Feld nicht haben.
  manualMatchId?: string;
  // Sub-Konto-Monat, vom User gewählt (null = Vorgabe, siehe defaultPeriod).
  periodMonth?: number | null;
  periodYear?: number | null;
  source: SuggestionSource | null;
  transferAccountId: string;
  // User hat die Verknüpfung mit einer vorhandenen Buchung gelöst → wird als
  // neue Buchung importiert.
  unlinked: boolean;
}

// Verschmolzen wird nur, solange die Verknüpfung nicht gelöst wurde.
const isMerge = (edit: RowEdit | undefined) =>
  !edit?.unlinked && (edit?.source === "quick" || edit?.source === "existing");

// Id der Buchung, mit der die Zeile verschmolzen wird (von Hand oder
// automatisch gefunden), sonst null.
function linkedEntryId(row: Row, edit: RowEdit | undefined) {
  if (edit?.manualMatchId) {
    return edit.manualMatchId;
  }
  return isMerge(edit) ? row.suggestion?.matchTransactionId || null : null;
}

interface Period {
  month: number;
  year: number;
}

// Wie backend utils/monthBounds.js#getPeriodForDate: Bei monthStartDay > 1
// gehört ein Datum ab dem Starttag zum Folgemonat (Label = End-Monat).
function periodForDate(iso: string, startDay: number): Period {
  const [year, month, day] = iso.split("-").map(Number);
  if (startDay > 1 && day >= startDay) {
    return month === 12
      ? { year: year + 1, month: 1 }
      : { year, month: month + 1 };
  }
  return { year, month };
}

// Vorgabe für den Sub-Konto-Monat: Die Ausgabe zählt in dem Monat, in dem sie
// angefallen ist, nicht wann sie abgebucht wurde. Reihenfolge: Monat der
// verknüpften Buchung → Datum des Paperless-Belegs (z.B. Hotelrechnung) →
// Bankdatum. Muss zu routes/bankSync.js#mergedSubAccountFields passen.
function defaultPeriod(
  row: Row,
  linked: ExistingEntry | null,
  startDay: number
): Period | null {
  if (linked?.subAccountPeriodMonth && linked.subAccountPeriodYear) {
    return {
      month: linked.subAccountPeriodMonth,
      year: linked.subAccountPeriodYear,
    };
  }
  const date = linked?.date || row.suggestion?.paperlessDoc?.date || row.date;
  return date ? periodForDate(date, startDay) : null;
}

const MONTH_NAMES = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];

const periodLabel = (p: Period) =>
  `${String(p.month).padStart(2, "0")}/${p.year}`;

// Gleiche Toleranz wie routes/bankSync.js#manualMatchTolerance: Beim
// Verknüpfen von Hand darf der Betrag leicht abweichen (Gebühr, Kurs).
const MANUAL_MATCH_MIN_TOLERANCE = 2;
const MANUAL_MATCH_RELATIVE_TOLERANCE = 0.1;
const AMOUNT_EPSILON = 0.01;
const MAX_MANUAL_CANDIDATES = 20;
const MANUAL_LOOKAHEAD_DAYS = 5;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const addDays = (iso: string, days: number) =>
  new Date(new Date(iso).getTime() + days * MS_PER_DAY)
    .toISOString()
    .slice(0, 10);

// Offene Buchungen, die zu dieser Zeile passen könnten (gleiche Art, Betrag
// in der Toleranz, nicht nach dem Bankdatum), nächster Betrag zuerst.
function manualCandidates(
  row: Row,
  openEntries: ExistingEntry[],
  takenIds: Set<string>
) {
  if (row.amount === null || !row.date) {
    return [];
  }
  const type = row.amount < 0 ? "expense" : "income";
  const amount = Math.abs(row.amount);
  const tolerance =
    Math.max(
      MANUAL_MATCH_MIN_TOLERANCE,
      amount * MANUAL_MATCH_RELATIVE_TOLERANCE
    ) + AMOUNT_EPSILON;
  const latest = addDays(row.date, MANUAL_LOOKAHEAD_DAYS);
  return openEntries
    .filter(
      (e) =>
        e.type === type &&
        !takenIds.has(e.id) &&
        Math.abs(e.amount - amount) <= tolerance &&
        e.date <= latest
    )
    .sort(
      (a, b) =>
        Math.abs(a.amount - amount) - Math.abs(b.amount - amount) ||
        b.date.localeCompare(a.date)
    )
    .slice(0, MAX_MANUAL_CANDIDATES);
}

const isPeriodPatch = (patch: Partial<RowEdit>) =>
  Object.keys(patch).every((k) => k === "periodMonth" || k === "periodYear");

interface SettledWarning {
  categoryId: string;
  categoryName: string;
  month: number;
  year: number;
}

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
  const [openEntries, setOpenEntries] = useDraftState<ExistingEntry[]>(
    "openEntries",
    []
  );
  // Geschlossene Sub-Konto-Monate als "categoryId|year|month".
  const [settledPeriods, setSettledPeriods] = useDraftState<string[]>(
    "settledPeriods",
    []
  );
  // Nach dem Import: geschlossene Monate, deren Saldo sich geändert hat.
  const [settledWarnings, setSettledWarnings] = useState<SettledWarning[]>([]);

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
    setOpenEntries([]);
    setSettledPeriods([]);
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
    setOpenEntries(data.openEntries || []);
    setSettledPeriods(data.settledPeriods || []);
    setSettledWarnings([]);
  };

  const updateEdit = (index: number, patch: Partial<RowEdit>) => {
    setEdits((prev) =>
      prev.map((e, i) =>
        i === index
          ? {
              ...e,
              ...patch,
              // Verknüpfte Buchungen bleiben verknüpft (werden verschmolzen),
              // alles andere gilt nach einer Änderung als manuell. Nur der
              // Sub-Konto-Monat geändert → Vorschlagsquelle bleibt.
              source: isMerge(e) || isPeriodPatch(patch) ? e.source : "manual",
            }
          : e
      )
    );
  };

  const unlinkMatch = (index: number) => {
    setEdits((prev) =>
      prev.map((e, i) =>
        i === index
          ? { ...e, unlinked: true, manualMatchId: "", source: "manual" }
          : e
      )
    );
  };

  // Von Hand mit einer offenen Buchung verknüpfen: Kategorie und
  // Beschreibung kommen wie beim automatischen Treffer von der Buchung.
  const linkManually = (index: number, entry: ExistingEntry) => {
    setEdits((prev) =>
      prev.map((e, i) =>
        i === index
          ? {
              ...e,
              categoryId: entry.categoryId || "",
              description: entry.description || "",
              manualMatchId: entry.id,
              periodMonth: null,
              periodYear: null,
              source: "existing",
              transferAccountId: "",
              unlinked: false,
            }
          : e
      )
    );
  };

  const startDay = currentHousehold?.monthStartDay || 1;
  const categoriesById = new Map(categories.map((c) => [c.id, c]));
  const settledSet = new Set(settledPeriods);

  const linkedEntry = (row: Row, edit: RowEdit | undefined) => {
    if (edit?.manualMatchId) {
      return openEntries.find((e) => e.id === edit.manualMatchId) || null;
    }
    return isMerge(edit) ? row.suggestion?.matchedEntry || null : null;
  };

  // Sub-Konto-Monat der Zeile, null wenn die Kategorie kein Sub-Konto ist.
  const rowPeriod = (row: Row, edit: RowEdit | undefined): Period | null => {
    const category = categoriesById.get(edit?.categoryId || "");
    const linked = linkedEntry(row, edit);
    if (
      !category?.hasSubAccount ||
      edit?.transferAccountId ||
      linked?.type === "transfer"
    ) {
      return null;
    }
    if (edit?.periodMonth && edit.periodYear) {
      return { month: edit.periodMonth, year: edit.periodYear };
    }
    return defaultPeriod(row, linked, startDay);
  };

  // Ändert der Import den Saldo eines bereits geschlossenen Sub-Konto-Monats?
  const touchesSettledPeriod = (row: Row, edit: RowEdit | undefined) => {
    const period = rowPeriod(row, edit);
    if (!(period && edit)) {
      return false;
    }
    const key = `${edit.categoryId}|${period.year}|${period.month}`;
    if (!settledSet.has(key)) {
      return false;
    }
    const linked = linkedEntry(row, edit);
    if (!linked) {
      return true;
    }
    const unchanged =
      linked.categoryId === edit.categoryId &&
      linked.subAccountPeriodMonth === period.month &&
      linked.subAccountPeriodYear === period.year &&
      Math.abs(linked.amount - Math.abs(row.amount ?? 0)) <= AMOUNT_EPSILON;
    return !unchanged;
  };

  // Welche Buchung ist mit welcher Zeile verknüpft? Eine Buchung kann nur
  // einmal verknüpft werden.
  const linkedRowByEntry = new Map<string, number>();
  rows.forEach((row, i) => {
    const id = linkedEntryId(row, edits[i]);
    if (id) {
      linkedRowByEntry.set(id, i);
    }
  });
  const takenEntryIds = (index: number) =>
    new Set(
      [...linkedRowByEntry].filter(([, i]) => i !== index).map(([id]) => id)
    );

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
      .map(({ row, edit }) => {
        const period = rowPeriod(row, edit);
        return {
          date: row.date,
          amount: row.amount,
          purpose: row.purpose,
          counterpartyName: row.counterpartyName,
          categoryId: edit?.categoryId || null,
          transferAccountId: edit?.transferAccountId || null,
          description: edit?.description || null,
          suggestionSource: edit?.source || null,
          matchTransactionId: linkedEntryId(row, edit),
          paperlessDocId: row.suggestion?.paperlessDoc?.id || null,
          subAccountPeriodMonth: period?.month ?? null,
          subAccountPeriodYear: period?.year ?? null,
        };
      });
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
      setSettledWarnings(data.settledWarnings || []);
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
  const lateMatchCount = rows.filter(
    (r, i) =>
      isMerge(edits[i]) && !edits[i]?.manualMatchId && r.suggestion?.matchLate
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
          {settledWarnings.length > 0 && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-900 text-sm dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
              <p className="flex items-center gap-1 font-medium">
                <AlertTriangle size={14} /> Bereits abgeschlossene
                Sub-Konto-Monate haben sich geändert
              </p>
              <ul className="my-1 list-disc pl-5">
                {settledWarnings.map((w) => (
                  <li key={`${w.categoryId}-${w.year}-${w.month}`}>
                    {w.categoryName} {periodLabel(w)}
                  </li>
                ))}
              </ul>
              <p className="text-xs">
                Der Abschluss enthält den neuen Betrag noch nicht. Auf der Seite{" "}
                <Link className="underline" to="/sub-accounts">
                  Sub-Konten
                </Link>{" "}
                den Abschluss rückgängig machen und den Monat erneut schließen.
              </p>
              <button
                className="mt-1 text-xs underline"
                onClick={() => setSettledWarnings([])}
                type="button"
              >
                Ausblenden
              </button>
            </div>
          )}
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
                  {lateMatchCount > 0 && (
                    <span className="ml-2 text-amber-700 text-sm dark:text-amber-400">
                      davon {lateMatchCount} mit später Abbuchung, bitte prüfen
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
                                bankAmount={r.amount}
                                bankDate={r.date}
                                categories={categories}
                                edit={edits[i]}
                                fmtAmount={fmtAmount}
                                linkedEntry={linkedEntry(r, edits[i])}
                                manualCandidates={
                                  linkedEntryId(r, edits[i])
                                    ? []
                                    : manualCandidates(
                                        r,
                                        openEntries,
                                        takenEntryIds(i)
                                      )
                                }
                                onChange={(patch) => updateEdit(i, patch)}
                                onLinkManually={(entry) =>
                                  linkManually(i, entry)
                                }
                                onUnlink={() => unlinkMatch(i)}
                                period={rowPeriod(r, edits[i])}
                                settledConflict={touchesSettledPeriod(
                                  r,
                                  edits[i]
                                )}
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
  bankAmount: number | null;
  bankDate: string | null;
  categories: Category[];
  edit: RowEdit;
  fmtAmount: (n: number | null) => string;
  // Buchung, mit der die Zeile verschmolzen wird (automatisch oder von Hand).
  linkedEntry: ExistingEntry | null;
  // Offene Buchungen zum Verknüpfen von Hand (leer, wenn schon verknüpft).
  manualCandidates: ExistingEntry[];
  onChange: (patch: Partial<RowEdit>) => void;
  onLinkManually: (entry: ExistingEntry) => void;
  onUnlink: () => void;
  // Sub-Konto-Monat, null wenn die Kategorie kein Sub-Konto ist.
  period: Period | null;
  // Monat ist schon abgeschlossen und sein Saldo ändert sich.
  settledConflict: boolean;
  suggestion: Suggestion | null;
}

const entryOptionLabel = (
  e: ExistingEntry,
  fmtAmount: (n: number | null) => string
) =>
  [
    fmtDate(e.date),
    fmtAmount(e.amount),
    e.Category ? categoryLabel(e.Category) : "ohne Kategorie",
    e.description,
  ]
    .filter(Boolean)
    .join(" · ");

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
  bankAmount,
  bankDate,
  categories,
  edit,
  fmtAmount,
  linkedEntry,
  manualCandidates,
  onChange,
  onLinkManually,
  onUnlink,
  period,
  settledConflict,
  suggestion,
}: SuggestionCellProps) {
  const merged = isMerge(edit) && !!linkedEntry;
  const entry = linkedEntry ?? undefined;
  const manual = !!edit.manualMatchId;
  const late = merged && !manual && suggestion?.matchLate;
  const baseBadge = edit.source ? SOURCE_BADGES[edit.source] : null;
  let badge = baseBadge;
  if (baseBadge && merged) {
    badge = {
      ...baseBadge,
      label: manual ? "✓ Von Hand verknüpft" : mergeBadgeLabel(entry),
    };
  } else if (
    baseBadge &&
    edit.source === "mapping" &&
    suggestion?.mappingKind === "amount"
  ) {
    badge = { ...baseBadge, label: "Gelernt · wiederkehrend" };
  }
  const dateChanges = merged && entry && bankDate && entry.date !== bankDate;
  const bankAbs = bankAmount === null ? null : Math.abs(bankAmount);
  const amountChanges =
    merged &&
    entry &&
    bankAbs !== null &&
    Math.abs(entry.amount - bankAbs) > AMOUNT_EPSILON;
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
        {late && (
          <span
            className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-[10px] text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
            title="Gefunden über die späte Abbuchung (Zuordnung & KI). Gleicher Betrag über Wochen kann Zufall sein: bitte prüfen."
          >
            spät · {suggestion?.matchDistanceDays} Tage
          </span>
        )}
        {merged && entry && (
          <span className="text-[10px] text-gray-400">
            {dateChanges
              ? `Datum ${fmtDate(entry.date)} → ${fmtDate(bankDate)}`
              : `vom ${fmtDate(entry.date)}`}
            {amountChanges &&
              ` · Betrag ${fmtAmount(entry.amount)} → ${fmtAmount(bankAbs)}`}
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
      {period && (
        <div className="flex items-center gap-1">
          <span className="shrink-0 text-[10px] text-gray-500 dark:text-gray-400">
            Sub-Konto-Monat
          </span>
          <select
            aria-label="Sub-Konto-Monat"
            className="input py-1 text-xs"
            onChange={(e) =>
              onChange({
                periodMonth: Number(e.target.value),
                periodYear: period.year,
              })
            }
            value={period.month}
          >
            {MONTH_NAMES.map((name, i) => (
              <option key={name} value={i + 1}>
                {name}
              </option>
            ))}
          </select>
          <input
            aria-label="Sub-Konto-Jahr"
            className="input w-20 py-1 text-xs"
            max={2100}
            min={2000}
            onChange={(e) => {
              const year = Number(e.target.value);
              if (year >= 2000 && year <= 2100) {
                onChange({ periodMonth: period.month, periodYear: year });
              }
            }}
            type="number"
            value={period.year}
          />
        </div>
      )}
      {settledConflict && period && (
        <p className="flex items-center gap-1 text-[10px] text-amber-700 dark:text-amber-400">
          <AlertTriangle size={10} /> {periodLabel(period)} ist schon
          abgeschlossen. Nach dem Import auf der Sub-Konten-Seite neu schließen.
        </p>
      )}
      {!merged && manualCandidates.length > 0 && (
        <select
          aria-label="Mit offener Buchung verknüpfen"
          className="input py-1 text-[11px] text-gray-500"
          onChange={(e) => {
            const picked = manualCandidates.find(
              (c) => c.id === e.target.value
            );
            if (picked) {
              onLinkManually(picked);
            }
          }}
          title="Die Buchung wurde schon in der App erfasst, aber nicht automatisch erkannt (z.B. viel später abgebucht oder Betrag leicht anders)? Dann hier auswählen: Sie wird mit dem Umsatz verschmolzen statt doppelt angelegt."
          value=""
        >
          <option value="">
            🔗 Mit offener Buchung verknüpfen ({manualCandidates.length})…
          </option>
          {manualCandidates.map((c) => (
            <option key={c.id} value={c.id}>
              {entryOptionLabel(c, fmtAmount)}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
