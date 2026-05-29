import { Check, ChevronRight, Plus, RotateCcw, X } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { categoryAPI, categoryUpdateAPI, subAccountAPI } from "../services/api";
import { useAuthStore } from "../store/authStore";

interface Period {
  balance: number;
  expense: number;
  income: number;
  month: number;
  settledAt: string | null;
  settledBalance: number | null;
  settlementTransactionId: string | null;
  year: number;
}

interface SubAccount {
  category: {
    id: string;
    name: string;
    nameDE?: string;
    icon: string;
    color: string;
    isSystem: boolean;
  };
  periods: Period[];
}

const MONTHS = [
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

export default function SubAccountsPage() {
  const { currentHousehold } = useAuthStore();
  const [subAccounts, setSubAccounts] = useState<SubAccount[]>([]);
  const [allCategories, setAllCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSelection, setPickerSelection] = useState("");
  const [pickerSaving, setPickerSaving] = useState(false);

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
      const [{ data: sa }, { data: cat }] = await Promise.all([
        subAccountAPI.getAll(currentHousehold.id),
        categoryAPI.getAll(currentHousehold.id),
      ]);
      setSubAccounts(sa.subAccounts || []);
      setAllCategories(cat.categories || []);
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Fehler beim Laden");
    } finally {
      setLoading(false);
    }
  };

  const enableSubAccount = async () => {
    if (!(currentHousehold && pickerSelection)) {
      return;
    }
    setPickerSaving(true);
    try {
      await categoryUpdateAPI.update(pickerSelection, {
        hasSubAccount: true,
        householdId: currentHousehold.id,
      });
      toast.success("Sub-Konto aktiviert");
      setPickerOpen(false);
      setPickerSelection("");
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Fehler");
    } finally {
      setPickerSaving(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentHousehold]);

  const settle = async (categoryId: string, p: Period) => {
    if (!currentHousehold) {
      return;
    }
    if (
      !confirm(
        `Period ${MONTHS[p.month - 1]} ${p.year} abschließen?\n\nSaldo ${fmt(
          p.balance
        )} wird als ${p.balance >= 0 ? "Einnahme" : "Ausgabe"} in die Statistik gebucht.`
      )
    ) {
      return;
    }
    const key = `${categoryId}-${p.year}-${p.month}`;
    setBusyKey(key);
    try {
      await subAccountAPI.settle(categoryId, {
        householdId: currentHousehold.id,
        year: p.year,
        month: p.month,
      });
      toast.success(`Period ${MONTHS[p.month - 1]} ${p.year} geschlossen`);
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Fehler beim Schließen");
    } finally {
      setBusyKey(null);
    }
  };

  const unsettle = async (categoryId: string, p: Period) => {
    if (!currentHousehold) {
      return;
    }
    if (
      !confirm("Schließen rückgängig machen? Settlement-Buchung wird gelöscht.")
    ) {
      return;
    }
    const key = `${categoryId}-${p.year}-${p.month}`;
    setBusyKey(key);
    try {
      await subAccountAPI.unsettle(categoryId, {
        householdId: currentHousehold.id,
        year: p.year,
        month: p.month,
      });
      toast.success("Schließen rückgängig gemacht");
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Fehler");
    } finally {
      setBusyKey(null);
    }
  };

  const disableSubAccount = async (categoryId: string) => {
    if (!currentHousehold) {
      return;
    }
    if (
      !confirm(
        "Sub-Konto deaktivieren? Bestehende Buchungen behalten ihre Period-Zuordnung, neue Buchungen sind wieder normale Buchungen."
      )
    ) {
      return;
    }
    try {
      await categoryUpdateAPI.update(categoryId, {
        hasSubAccount: false,
        householdId: currentHousehold.id,
      });
      toast.success("Sub-Konto deaktiviert");
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Fehler");
    }
  };

  const backfill = async (categoryId: string, categoryName: string) => {
    if (!currentHousehold) {
      return;
    }
    if (
      !confirm(
        `Alle bestehenden Buchungen der Kategorie „${categoryName}" rückwirkend einsortieren?\n\nDie Period wird automatisch aus dem Buchungs-Datum abgeleitet (gemäß deinem monthStartDay). Du kannst danach jede Buchung einzeln bearbeiten und die Period anpassen (besonders bei Gutschriften, die einen anderen Zeitraum betreffen).`
      )
    ) {
      return;
    }
    setBusyKey(`backfill-${categoryId}`);
    try {
      const { data } = await subAccountAPI.backfill(categoryId, {
        householdId: currentHousehold.id,
      });
      toast.success(
        `${data.updated} Buchung(en) eingeordnet${data.updated === data.total ? "" : ` (von ${data.total} Kandidaten)`}`
      );
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Fehler beim Einsortieren");
    } finally {
      setBusyKey(null);
    }
  };

  const availableCategories = allCategories.filter((c) => !c.hasSubAccount);

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-bold text-2xl text-gray-900 dark:text-white">
          Sub-Konten
        </h1>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-gray-500 text-sm">
            Sammelkonten pro Kategorie (z.B. Spesen). Buchungen sind neutral in
            Statistiken, bis du eine Period schließt.
          </p>
          <button
            className="btn-primary flex items-center gap-2"
            onClick={() => {
              setPickerSelection("");
              setPickerOpen(true);
            }}
            type="button"
          >
            <Plus size={16} /> Kategorie als Sub-Konto
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-12">
          <div className="h-8 w-8 animate-spin rounded-full border-[var(--primary)] border-b-2" />
        </div>
      ) : subAccounts.length === 0 ? (
        <div className="card py-12 text-center text-gray-400">
          <p>Noch keine Sub-Konten angelegt.</p>
          <p className="text-sm">
            Oben „Kategorie als Sub-Konto" anklicken, um eine bestehende
            Kategorie (z.B. „Spesen") zum Sammelkonto zu machen.
          </p>
        </div>
      ) : (
        subAccounts.map((sa) => (
          <section className="space-y-3" key={sa.category.id}>
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-semibold text-gray-900 dark:text-white">
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-lg"
                  style={{
                    background: `${sa.category.color}20`,
                    color: sa.category.color,
                  }}
                >
                  {sa.category.icon}
                </span>
                {sa.category.nameDE || sa.category.name}
              </h2>
              <div className="flex items-center gap-3">
                <button
                  className="text-[var(--primary)] text-xs hover:underline disabled:opacity-50"
                  disabled={busyKey === `backfill-${sa.category.id}`}
                  onClick={() =>
                    backfill(
                      sa.category.id,
                      sa.category.nameDE || sa.category.name
                    )
                  }
                  type="button"
                >
                  {busyKey === `backfill-${sa.category.id}`
                    ? "Sortiere..."
                    : "Bestehende einsortieren"}
                </button>
                <button
                  className="text-gray-400 text-xs hover:text-red-500"
                  onClick={() => disableSubAccount(sa.category.id)}
                  type="button"
                >
                  Sub-Konto deaktivieren
                </button>
              </div>
            </div>
            {sa.periods.length === 0 ? (
              <div className="card p-4 text-center text-gray-400 text-sm">
                Noch keine Buchungen in diesem Sub-Konto.
              </div>
            ) : (
              <div className="card overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-slate-700">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-gray-500 text-xs uppercase tracking-wide">
                        Periode
                      </th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-500 text-xs uppercase tracking-wide">
                        Einnahmen
                      </th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-500 text-xs uppercase tracking-wide">
                        Ausgaben
                      </th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-500 text-xs uppercase tracking-wide">
                        Saldo
                      </th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-500 text-xs uppercase tracking-wide">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                    {sa.periods.map((p) => {
                      const key = `${sa.category.id}-${p.year}-${p.month}`;
                      const isSettled = p.settledAt !== null;
                      return (
                        <tr
                          className="transition-colors hover:bg-pink-50/50 dark:hover:bg-slate-700/50"
                          key={key}
                        >
                          <td className="px-4 py-3 text-gray-700 text-sm dark:text-gray-300">
                            {MONTHS[p.month - 1]} {p.year}
                          </td>
                          <td className="px-4 py-3 text-right text-[var(--income)] text-sm">
                            {fmt(p.income)}
                          </td>
                          <td className="px-4 py-3 text-right text-[var(--expense)] text-sm">
                            {fmt(p.expense)}
                          </td>
                          <td
                            className={`px-4 py-3 text-right font-semibold text-sm ${p.balance >= 0 ? "text-[var(--income)]" : "text-[var(--expense)]"}`}
                          >
                            {fmt(p.balance)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {isSettled ? (
                              <button
                                className="inline-flex items-center gap-1 text-gray-400 text-xs hover:text-red-500"
                                disabled={busyKey === key}
                                onClick={() => unsettle(sa.category.id, p)}
                                title="Schließen rückgängig"
                                type="button"
                              >
                                <Check className="text-green-600" size={14} />
                                Geschlossen
                                <RotateCcw size={12} />
                              </button>
                            ) : (
                              <button
                                className="btn-primary inline-flex items-center gap-1 px-3 py-1 text-xs disabled:opacity-50"
                                disabled={busyKey === key}
                                onClick={() => settle(sa.category.id, p)}
                                type="button"
                              >
                                Schließen
                                <ChevronRight size={12} />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ))
      )}

      {/* Picker-Modal: bestehende Kategorie zum Sub-Konto machen */}
      {pickerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setPickerOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-bold text-gray-900 text-lg dark:text-white">
                Kategorie als Sub-Konto aktivieren
              </h3>
              <button
                className="text-gray-400 hover:text-gray-600"
                onClick={() => setPickerOpen(false)}
                type="button"
              >
                <X size={20} />
              </button>
            </div>
            <p className="mb-4 text-gray-500 text-sm">
              Nach der Aktivierung werden NEUE Buchungen in dieser Kategorie aus
              der Statistik ausgeschlossen und einer Period zugeordnet.
              Bestehende Buchungen bleiben unverändert (du kannst sie bei Bedarf
              einzeln bearbeiten und die Period nachträglich setzen).
            </p>
            {availableCategories.length === 0 ? (
              <p className="rounded-xl bg-gray-50 p-3 text-center text-gray-400 text-sm dark:bg-slate-700">
                Alle Kategorien sind bereits Sub-Konten oder es existieren
                keine.
              </p>
            ) : (
              <select
                autoFocus
                className="input mb-4 w-full"
                onChange={(e) => setPickerSelection(e.target.value)}
                value={pickerSelection}
              >
                <option value="">-- Kategorie wählen --</option>
                {availableCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.icon} {c.nameDE || c.name}
                    {c.isSystem ? " (System)" : ""}
                  </option>
                ))}
              </select>
            )}
            <div className="flex justify-end gap-3">
              <button
                className="btn-secondary"
                onClick={() => setPickerOpen(false)}
                type="button"
              >
                Abbrechen
              </button>
              <button
                className="btn-primary disabled:opacity-50"
                disabled={pickerSaving || !pickerSelection}
                onClick={enableSubAccount}
                type="button"
              >
                {pickerSaving ? "Aktiviere..." : "Aktivieren"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
