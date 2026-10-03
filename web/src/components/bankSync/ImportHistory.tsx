import { History } from "lucide-react";
import { useEffect, useState } from "react";
import { bankSyncAPI } from "../../services/api";

interface ImportEntry {
  createdAt: string;
  dateFrom: string;
  dateTo: string;
  // Aus alten Buchungen abgeleitet (Importe vor dem Protokoll, Näherung).
  derived: boolean;
  fileName: string | null;
  id: string;
  imported: number;
  merged: number;
  rowCount: number;
  skipped: number;
  userName: string | null;
}

interface DateRange {
  derived?: boolean;
  from: string;
  to: string;
}

interface AccountCoverage {
  accountId: string;
  gaps: DateRange[];
  icon: string;
  imports: ImportEntry[];
  name: string;
  ranges: DateRange[];
}

const fmtDate = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
};

const fmtRange = (r: { from: string; to: string }) =>
  `${fmtDate(r.from)} – ${fmtDate(r.to)}`;

const MAX_SHOWN_IMPORTS = 5;

interface Props {
  householdId: string;
  // Hochzählen, um nach einem Import neu zu laden.
  reloadKey: number;
}

// Welche Zeiträume pro Konto schon per Datei eingelesen wurden, mit Lücken.
// Buchungen in diesen Zeiträumen sind mit dem Kontoauszug abgeglichen.
export default function ImportHistory({ householdId, reloadKey }: Props) {
  const [accounts, setAccounts] = useState<AccountCoverage[] | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    bankSyncAPI
      .getImports(householdId)
      .then(({ data }) => {
        if (!cancelled) {
          setAccounts(data.accounts || []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAccounts([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [householdId, reloadKey]);

  if (!accounts || accounts.length === 0) {
    return null;
  }

  return (
    <div className="card space-y-3 p-4">
      <div>
        <h2 className="flex items-center gap-2 font-semibold text-gray-900 dark:text-white">
          <History size={16} /> Eingelesene Zeiträume
        </h2>
        <p className="text-gray-500 text-xs dark:text-gray-400">
          Für diese Zeiträume sind die Buchungen mit dem Kontoauszug
          abgeglichen. In der Buchungsliste erkennst du bestätigte Buchungen am
          🏦-Symbol.
        </p>
      </div>
      <ul className="space-y-3">
        {accounts.map((a) => {
          const open = expanded === a.accountId;
          return (
            <li
              className="rounded-xl border border-gray-100 p-3 text-sm dark:border-slate-800"
              key={a.accountId}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium text-gray-900 dark:text-white">
                  {a.icon} {a.name}
                </span>
                <button
                  className="text-gray-400 text-xs underline"
                  onClick={() => setExpanded(open ? null : a.accountId)}
                  type="button"
                >
                  {open ? "Importe ausblenden" : `${a.imports.length} Importe`}
                </button>
              </div>
              <p className="text-gray-700 dark:text-gray-300">
                {a.ranges.map((r, i) => (
                  <span key={r.from}>
                    {i > 0 && ", "}
                    {fmtRange(r)}
                    {r.derived && (
                      <span
                        className="text-gray-400 text-xs"
                        title="Aus den importierten Buchungen abgeleitet (Importe vor Einführung des Protokolls). Ruhige Wochen ohne Umsatz können wie eine Lücke aussehen."
                      >
                        {" "}
                        (abgeleitet)
                      </span>
                    )}
                  </span>
                ))}
              </p>
              {a.gaps.length > 0 && (
                <p className="text-amber-700 text-xs dark:text-amber-400">
                  Lücke: {a.gaps.map(fmtRange).join(", ")}
                </p>
              )}
              {open && (
                <ul className="mt-2 space-y-1 text-gray-500 text-xs dark:text-gray-400">
                  {a.imports.slice(0, MAX_SHOWN_IMPORTS).map((imp) => (
                    <li key={imp.id}>
                      {imp.derived
                        ? `Frühere Importe (abgeleitet): ${fmtRange({ from: imp.dateFrom, to: imp.dateTo })}, ${imp.rowCount} Umsätze`
                        : `${fmtDate(imp.createdAt)}: ${imp.fileName || "Datei"}, ${fmtRange({ from: imp.dateFrom, to: imp.dateTo })} · ${imp.imported} neu, ${imp.merged} ergänzt, ${imp.skipped} übersprungen${imp.userName ? ` · ${imp.userName}` : ""}`}
                    </li>
                  ))}
                  {a.imports.length > MAX_SHOWN_IMPORTS && (
                    <li>… und {a.imports.length - MAX_SHOWN_IMPORTS} ältere</li>
                  )}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
