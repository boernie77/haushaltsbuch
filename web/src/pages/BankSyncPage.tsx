import { AlertTriangle, GraduationCap, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Link } from "react-router-dom";
import { accountAPI, bankSyncAPI } from "../services/api";
import { useAuthStore } from "../store/authStore";

interface Account {
  icon: string;
  id: string;
  name: string;
}

interface Row {
  alreadyImported: boolean;
  amount: number | null;
  counterpartyName: string | null;
  date: string | null;
  possibleDuplicate: boolean;
  purpose: string;
}

const MAPPING_FIELDS: { key: string; label: string }[] = [
  { key: "date", label: "Datum" },
  { key: "amount", label: "Betrag" },
  { key: "purpose", label: "Verwendungszweck" },
  { key: "counterpartyName", label: "Empfänger/Auftraggeber" },
];

export default function BankSyncPage() {
  const { currentHousehold } = useAuthStore();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [previewing, setPreviewing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(false);

  const [format, setFormat] = useState<"csv" | "mt940" | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [mapping, setMapping] = useState<Record<string, string | null>>({});
  // Welche Zeilen (per Index) beim Import berücksichtigt werden. Zeilen mit
  // possibleDuplicate/alreadyImported starten abgewählt.
  const [included, setIncluded] = useState<boolean[]>([]);

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

  useEffect(() => {
    loadAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentHousehold]);

  const resetPreview = () => {
    setFormat(null);
    setHeaders([]);
    setRows([]);
    setMapping({});
    setIncluded([]);
  };

  const bootstrapMappings = async () => {
    if (!currentHousehold) {
      return;
    }
    setBootstrapping(true);
    try {
      const { data } = await bankSyncAPI.bootstrapMappings(currentHousehold.id);
      toast.success(
        `${data.merchantsLearned} Empfänger/Auftraggeber aus bestehenden Buchungen gelernt`
      );
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Lernen fehlgeschlagen");
    } finally {
      setBootstrapping(false);
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFile(e.target.files?.[0] || null);
    resetPreview();
  };

  const applyPreviewResult = (data: any) => {
    const newRows: Row[] = data.rows || [];
    setFormat(data.format);
    setHeaders(data.headers || []);
    setRows(newRows);
    setMapping(data.suggestedMapping || {});
    setIncluded(
      newRows.map((r) => !(r.alreadyImported || r.possibleDuplicate))
    );
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
    if (!(currentHousehold && accountId && file)) {
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
    const selected = rows.filter((_, i) => included[i]);
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
      toast.success(
        `${data.imported} neu importiert, ${data.skipped} Duplikate übersprungen, ${data.uncategorized} ohne Kategorie`
      );
      setFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      resetPreview();
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
  const warnCount = rows.filter(
    (r) => r.alreadyImported || r.possibleDuplicate
  ).length;

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-bold text-2xl text-gray-900 dark:text-white">
          Bank-Sync
        </h1>
      </div>

      <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <p className="text-gray-600 text-sm dark:text-gray-300">
          Übernimmt einmalig die häufigste Kategorie pro Empfänger/Auftraggeber
          aus deinen bereits bestehenden Buchungen, damit künftige Importe
          direkt korrekt kategorisiert werden.
        </p>
        <button
          className="btn-secondary flex shrink-0 items-center gap-2 disabled:opacity-50"
          disabled={bootstrapping}
          onClick={bootstrapMappings}
          type="button"
        >
          <GraduationCap size={16} />
          {bootstrapping ? "Lerne..." : "Aus bestehenden Buchungen lernen"}
        </button>
      </div>

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
      </div>

      {format && (
        <div className="card space-y-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-semibold text-gray-900 dark:text-white">
              {rows.length} Buchungen erkannt ({format.toUpperCase()}) ·{" "}
              {selectedCount} zum Import ausgewählt
              {warnCount > 0 && (
                <span className="ml-2 flex items-center gap-1 text-amber-600 text-sm dark:text-amber-400">
                  <AlertTriangle size={14} />
                  {warnCount} vermutlich schon erfasst (abgewählt, prüfen vor
                  Import)
                </span>
              )}
            </div>
            <button
              className="btn-primary disabled:opacity-50"
              disabled={importing || selectedCount === 0}
              onClick={doImport}
              type="button"
            >
              {importing ? "Importiere..." : `${selectedCount} importieren`}
            </button>
          </div>

          {format === "csv" && (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
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
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const flagged = r.alreadyImported || r.possibleDuplicate;
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
                            {r.alreadyImported
                              ? "(bereits importiert)"
                              : "(evtl. schon manuell erfasst)"}
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-4">{r.counterpartyName || "-"}</td>
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
    </div>
  );
}
