import { Landmark } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { fintsAPI } from "../../services/api";

interface Props {
  accountId: string;
  householdId: string;
  onResult: (data: any, label: string) => void;
}

interface Connection {
  bankCode: string;
  fintsUrl: string;
  hasPin: boolean;
  loginName: string;
  tanMedium: string | null;
  tanMethod: string | null;
}

interface Challenge {
  challenge: string | null;
  challengeImage: { mime: string; data: string } | null;
  decoupled: boolean;
  message?: string;
  session: string;
}

interface TanMethod {
  code: string;
  name: string;
}

const EMPTY_FORM = {
  bankCode: "",
  fintsUrl: "",
  loginName: "",
  pin: "",
  savePin: false,
  tanMethod: "",
  tanMedium: "",
};

const errorText = (err: any, fallback: string) =>
  err.response?.data?.error || fallback;

export default function FintsFetch({
  accountId,
  householdId,
  onResult,
}: Props) {
  const [available, setAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [connection, setConnection] = useState<Connection | null>(null);
  const [hasIban, setHasIban] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [methods, setMethods] = useState<TanMethod[]>([]);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [tan, setTan] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const status = await fintsAPI.status();
      setAvailable(status.data.available);
      if (status.data.available) {
        const { data } = await fintsAPI.getConnection(householdId, accountId);
        setConnection(data.connection);
        setHasIban(data.hasIban);
      }
    } catch {
      setAvailable(false);
    } finally {
      setLoading(false);
    }
  }, [householdId, accountId]);

  useEffect(() => {
    setChallenge(null);
    setEditing(false);
    setMethods([]);
    setPin("");
    load();
  }, [load]);

  if (loading || !available) {
    return null;
  }

  const startEdit = () => {
    setForm(
      connection
        ? {
            bankCode: connection.bankCode,
            fintsUrl: connection.fintsUrl,
            loginName: connection.loginName,
            pin: "",
            savePin: connection.hasPin,
            tanMethod: connection.tanMethod || "",
            tanMedium: connection.tanMedium || "",
          }
        : EMPTY_FORM
    );
    setMethods([]);
    setEditing(true);
  };

  const loadMethods = async () => {
    setBusy(true);
    try {
      const { data } = await fintsAPI.tanMethods({
        householdId,
        accountId,
        bankCode: form.bankCode,
        fintsUrl: form.fintsUrl,
        loginName: form.loginName,
        pin: form.pin,
      });
      setMethods(data.methods);
      if (data.methods.length === 1) {
        setForm((f) => ({ ...f, tanMethod: data.methods[0].code }));
      }
    } catch (err: any) {
      toast.error(errorText(err, "TAN-Verfahren konnten nicht geladen werden"));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      await fintsAPI.saveConnection({
        householdId,
        accountId,
        ...form,
        pin: form.pin || undefined,
        savePin: form.savePin,
      });
      toast.success("FinTS-Zugang gespeichert");
      setEditing(false);
      await load();
    } catch (err: any) {
      toast.error(errorText(err, "Speichern fehlgeschlagen"));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await fintsAPI.deleteConnection(householdId, accountId);
      setConnection(null);
      setEditing(false);
    } catch (err: any) {
      toast.error(errorText(err, "Löschen fehlgeschlagen"));
    } finally {
      setBusy(false);
    }
  };

  // Antwort von /fetch bzw. /tan: Ergebnis, TAN-Abfrage oder Fehler.
  const handleResponse = (data: any) => {
    if (data.status === "tan_required") {
      setChallenge(data);
      setTan("");
      return;
    }
    if (data.status === "tan_method_needed") {
      toast.error(
        "Bitte im FinTS-Zugang ein TAN-Verfahren auswählen (Bearbeiten)."
      );
      startEdit();
      setMethods(data.methods);
      return;
    }
    setChallenge(null);
    setPin("");
    onResult(data, `FinTS-Abruf ${data.range.dateFrom} – ${data.range.dateTo}`);
    toast.success(`${data.rows.length} Umsätze abgerufen`);
  };

  const fetchNow = async () => {
    setBusy(true);
    try {
      const { data } = await fintsAPI.fetch({
        householdId,
        accountId,
        pin: pin || undefined,
      });
      handleResponse(data);
    } catch (err: any) {
      toast.error(errorText(err, "Abruf fehlgeschlagen"));
    } finally {
      setBusy(false);
    }
  };

  const submitTan = async () => {
    if (!challenge) {
      return;
    }
    setBusy(true);
    try {
      const { data } = await fintsAPI.sendTan({
        householdId,
        accountId,
        session: challenge.session,
        tan,
      });
      handleResponse(data);
    } catch (err: any) {
      setChallenge(null);
      toast.error(errorText(err, "TAN-Eingabe fehlgeschlagen"));
    } finally {
      setBusy(false);
    }
  };

  const field = (
    label: string,
    key: keyof typeof EMPTY_FORM,
    props: { placeholder?: string; type?: string } = {}
  ) => (
    <div>
      <label
        className="mb-1 block font-medium text-gray-700 text-sm dark:text-gray-300"
        htmlFor={`fints-${key}`}
      >
        {label}
      </label>
      <input
        className="input"
        id={`fints-${key}`}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        placeholder={props.placeholder}
        type={props.type || "text"}
        value={String(form[key])}
      />
    </div>
  );

  return (
    <div className="space-y-3 rounded-xl border border-gray-200 p-3 dark:border-slate-700">
      <div className="flex items-center gap-2 font-medium text-gray-900 text-sm dark:text-white">
        <Landmark size={16} /> Direkt von der Bank abrufen (FinTS)
      </div>

      {!hasIban && (
        <p className="text-amber-700 text-xs dark:text-amber-300">
          Beim Konto fehlt die IBAN. Bitte unter „Konten“ eintragen.
        </p>
      )}

      {challenge && (
        <div className="space-y-2">
          <p className="text-gray-700 text-sm dark:text-gray-300">
            {challenge.challenge ||
              "Bitte die Anfrage in deiner Banking-App bestätigen."}
          </p>
          {challenge.message && (
            <p className="text-amber-700 text-xs dark:text-amber-300">
              {challenge.message}
            </p>
          )}
          {challenge.challengeImage && (
            <img
              alt="photoTAN-Grafik"
              className="h-40 w-40"
              height={160}
              src={`data:${challenge.challengeImage.mime};base64,${challenge.challengeImage.data}`}
              width={160}
            />
          )}
          {challenge.decoupled ? (
            <p className="text-gray-500 text-xs dark:text-gray-400">
              Nach der Freigabe in der App hier auf „Weiter“ klicken.
            </p>
          ) : (
            <input
              autoComplete="one-time-code"
              className="input"
              onChange={(e) => setTan(e.target.value)}
              placeholder="TAN"
              value={tan}
            />
          )}
          <button
            className="btn-primary disabled:opacity-50"
            disabled={busy || !(challenge.decoupled || tan)}
            onClick={submitTan}
            type="button"
          >
            {busy ? "Prüfe..." : "Weiter"}
          </button>
        </div>
      )}

      {!(challenge || editing) && connection && (
        <div className="space-y-2">
          <p className="text-gray-500 text-xs dark:text-gray-400">
            {connection.loginName} · BLZ {connection.bankCode}
          </p>
          {!connection.hasPin && (
            <input
              autoComplete="current-password"
              className="input"
              onChange={(e) => setPin(e.target.value)}
              placeholder="Online-Banking-PIN"
              type="password"
              value={pin}
            />
          )}
          <div className="flex flex-wrap gap-2">
            <button
              className="btn-primary disabled:opacity-50"
              disabled={busy || !hasIban || !(connection.hasPin || pin)}
              onClick={fetchNow}
              type="button"
            >
              {busy ? "Rufe ab..." : "Umsätze abrufen"}
            </button>
            <button className="btn-secondary" onClick={startEdit} type="button">
              Zugang bearbeiten
            </button>
          </div>
          <p className="text-gray-500 text-xs dark:text-gray-400">
            Ruft ab dem letzten Import (sonst 90 Tage) ab. Die Bank verlangt
            meist eine TAN-Freigabe.
          </p>
        </div>
      )}

      {!(challenge || editing || connection) && (
        <button className="btn-secondary" onClick={startEdit} type="button">
          FinTS-Zugang einrichten
        </button>
      )}

      {editing && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {field("Bankleitzahl", "bankCode", { placeholder: "12345678" })}
            {field("FinTS-Adresse (https://…)", "fintsUrl", {
              placeholder: "https://fints.beispielbank.de/fints",
            })}
            {field("Zugangsname / VR-NetKey", "loginName")}
            {field("Online-Banking-PIN", "pin", {
              type: "password",
              placeholder: connection?.hasPin ? "(gespeichert)" : "",
            })}
          </div>
          <p className="text-gray-500 text-xs dark:text-gray-400">
            Die FinTS-Adresse findest du bei deiner Bank oder in der
            FinTS-Bankenliste der Deutschen Kreditwirtschaft.
          </p>
          <label className="flex items-center gap-2 text-gray-700 text-sm dark:text-gray-300">
            <input
              checked={form.savePin}
              onChange={(e) =>
                setForm((f) => ({ ...f, savePin: e.target.checked }))
              }
              type="checkbox"
            />
            PIN verschlüsselt auf dem Server speichern
          </label>
          <div className="flex flex-wrap items-end gap-2">
            <button
              className="btn-secondary disabled:opacity-50"
              disabled={
                busy ||
                !(form.bankCode && form.fintsUrl && form.loginName) ||
                !(form.pin || connection?.hasPin)
              }
              onClick={loadMethods}
              type="button"
            >
              TAN-Verfahren laden
            </button>
            {methods.length > 0 && (
              <select
                className="input w-auto"
                onChange={(e) =>
                  setForm((f) => ({ ...f, tanMethod: e.target.value }))
                }
                value={form.tanMethod}
              >
                <option value="">TAN-Verfahren wählen…</option>
                {methods.map((m) => (
                  <option key={m.code} value={m.code}>
                    {m.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="btn-primary disabled:opacity-50"
              disabled={busy}
              onClick={save}
              type="button"
            >
              Speichern
            </button>
            <button
              className="btn-secondary"
              onClick={() => setEditing(false)}
              type="button"
            >
              Abbrechen
            </button>
            {connection && (
              <button
                className="text-red-600 text-sm underline"
                disabled={busy}
                onClick={remove}
                type="button"
              >
                Zugang löschen
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
