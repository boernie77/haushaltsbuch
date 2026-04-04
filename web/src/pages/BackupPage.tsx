import {
  Check,
  Copy,
  Database,
  Download,
  FileText,
  HardDrive,
  Mail,
  Play,
  Save,
  TestTube,
  Upload,
} from "lucide-react";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { adminAPI, backupAPI, reportsAPI } from "../services/api";
import { useAuthStore } from "../store/authStore";

const SCHEDULES: Record<string, { label: string; cron: string }> = {
  daily: { label: "Täglich (02:00)", cron: "0 2 * * *" },
  weekly: { label: "Wöchentlich (So, 02:00)", cron: "0 2 * * 0" },
  monthly: { label: "Monatlich (1., 02:00)", cron: "0 2 1 * *" },
  disabled: { label: "Deaktiviert", cron: "" },
};

function SftpBackupSection() {
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
  const [sshPublicKey, setSshPublicKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    adminAPI
      .getBackupConfig()
      .then(({ data }) => {
        if (data.hasConfig) {
          const c = data.config;
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
      .catch(() => {});

    adminAPI
      .getSshPublicKey()
      .then(({ data }) => {
        setSshPublicKey(data.publicKey || null);
      })
      .catch(() => {});
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const schedule = SCHEDULES[backupForm.scheduleLabel];
      await adminAPI.saveBackupConfig({
        ...backupForm,
        sftpPort: Number(backupForm.sftpPort),
        schedule: schedule?.cron || "",
      });
      toast.success("SFTP-Konfiguration gespeichert");
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Fehler beim Speichern");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      await adminAPI.testBackup({
        ...backupForm,
        sftpPort: Number(backupForm.sftpPort),
      });
      toast.success("Verbindung erfolgreich");
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Verbindung fehlgeschlagen");
    } finally {
      setTesting(false);
    }
  };

  const handleRun = async () => {
    if (!confirm("Jetzt manuelles Backup durchführen?")) {
      return;
    }
    setRunning(true);
    try {
      const { data } = await adminAPI.runBackup();
      toast.success(data.message || "Backup erfolgreich");
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Backup fehlgeschlagen");
    } finally {
      setRunning(false);
    }
  };

  const handleCopyKey = () => {
    if (!sshPublicKey) {
      return;
    }
    navigator.clipboard.writeText(sshPublicKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="card p-6">
      <div className="mb-4 flex items-center gap-2">
        <HardDrive className="text-[var(--primary)]" size={20} />
        <h2 className="font-semibold text-gray-900 dark:text-white">
          Server-Backup (SFTP)
        </h2>
      </div>
      <p className="mb-5 text-gray-500 text-sm dark:text-gray-400">
        Automatisches Backup aller Daten auf einen SFTP-Server. Der
        SSH-Public-Key muss auf dem Zielserver hinterlegt sein.
      </p>

      {sshPublicKey && (
        <div className="mb-5">
          <p className="mb-1 font-medium text-gray-700 text-sm dark:text-gray-300">
            SSH Public Key
          </p>
          <div className="flex items-start gap-2 rounded-xl bg-gray-50 p-3 dark:bg-slate-700">
            <code className="flex-1 break-all text-gray-600 text-xs dark:text-gray-400">
              {sshPublicKey}
            </code>
            <button
              className="shrink-0 text-gray-400 hover:text-[var(--primary)]"
              onClick={handleCopyKey}
              title="Kopieren"
              type="button"
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
            </button>
          </div>
        </div>
      )}

      <form className="space-y-3" onSubmit={handleSave}>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-gray-700 text-xs dark:text-gray-300">
              Host
            </label>
            <input
              className="input w-full text-sm"
              onChange={(e) =>
                setBackupForm((f) => ({ ...f, sftpHost: e.target.value }))
              }
              placeholder="backup.example.com"
              type="text"
              value={backupForm.sftpHost}
            />
          </div>
          <div>
            <label className="mb-1 block text-gray-700 text-xs dark:text-gray-300">
              Port
            </label>
            <input
              className="input w-full text-sm"
              onChange={(e) =>
                setBackupForm((f) => ({ ...f, sftpPort: e.target.value }))
              }
              placeholder="22"
              type="number"
              value={backupForm.sftpPort}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-gray-700 text-xs dark:text-gray-300">
              Benutzer
            </label>
            <input
              className="input w-full text-sm"
              onChange={(e) =>
                setBackupForm((f) => ({ ...f, sftpUser: e.target.value }))
              }
              placeholder="backup-user"
              type="text"
              value={backupForm.sftpUser}
            />
          </div>
          <div>
            <label className="mb-1 block text-gray-700 text-xs dark:text-gray-300">
              Passwort (optional)
            </label>
            <div className="flex gap-1">
              <input
                className="input w-full text-sm"
                onChange={(e) =>
                  setBackupForm((f) => ({ ...f, sftpPassword: e.target.value }))
                }
                placeholder="Leer = SSH-Key"
                type={showSftpPw ? "text" : "password"}
                value={backupForm.sftpPassword}
              />
              <button
                className="rounded-lg border border-gray-200 px-2 text-gray-500 text-xs dark:border-slate-600"
                onClick={() => setShowSftpPw(!showSftpPw)}
                type="button"
              >
                {showSftpPw ? "●" : "○"}
              </button>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-gray-700 text-xs dark:text-gray-300">
              Pfad
            </label>
            <input
              className="input w-full text-sm"
              onChange={(e) =>
                setBackupForm((f) => ({ ...f, sftpPath: e.target.value }))
              }
              placeholder="/backups"
              type="text"
              value={backupForm.sftpPath}
            />
          </div>
          <div>
            <label className="mb-1 block text-gray-700 text-xs dark:text-gray-300">
              Zeitplan
            </label>
            <select
              className="input w-full text-sm"
              onChange={(e) =>
                setBackupForm((f) => ({
                  ...f,
                  scheduleLabel: e.target.value,
                }))
              }
              value={backupForm.scheduleLabel}
            >
              {Object.entries(SCHEDULES).map(([key, { label }]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <label className="flex cursor-pointer items-center gap-2 text-gray-700 text-sm dark:text-gray-300">
            <input
              checked={backupForm.isActive}
              className="h-4 w-4 accent-[var(--primary)]"
              onChange={(e) =>
                setBackupForm((f) => ({ ...f, isActive: e.target.checked }))
              }
              type="checkbox"
            />
            Automatisches Backup aktiv
          </label>
        </div>

        <div className="flex flex-wrap gap-2 pt-2">
          <button
            className="btn flex items-center gap-2 text-sm"
            disabled={saving}
            type="submit"
          >
            <Save size={14} />
            {saving ? "Speichern…" : "Speichern"}
          </button>
          <button
            className="flex items-center gap-2 rounded-xl bg-gray-100 px-3 py-2 font-medium text-sm hover:bg-gray-200 disabled:opacity-50 dark:bg-slate-700 dark:hover:bg-slate-600"
            disabled={testing}
            onClick={handleTest}
            type="button"
          >
            <TestTube size={14} />
            {testing ? "Teste…" : "Verbindung testen"}
          </button>
          <button
            className="flex items-center gap-2 rounded-xl bg-gray-100 px-3 py-2 font-medium text-sm hover:bg-gray-200 disabled:opacity-50 dark:bg-slate-700 dark:hover:bg-slate-600"
            disabled={running}
            onClick={handleRun}
            type="button"
          >
            <Play size={14} />
            {running ? "Läuft…" : "Jetzt sichern"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function BackupPage() {
  const { currentHousehold, user } = useAuthStore();
  const [exportFormat, setExportFormat] = useState<"json" | "csv">("json");
  const [importing, setImporting] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const now = new Date();
  const [reportMonth, setReportMonth] = useState(now.getMonth() + 1);
  const [reportYear, setReportYear] = useState(now.getFullYear());
  const [sendingReport, setSendingReport] = useState(false);

  const handleExport = async () => {
    if (!currentHousehold) {
      return;
    }
    try {
      const { data } = await backupAPI.export(
        currentHousehold.id,
        exportFormat
      );
      const date = new Date().toISOString().split("T")[0];
      const filename = `haushalt-export-${date}.${exportFormat}`;
      const url = URL.createObjectURL(
        new Blob([data], {
          type: exportFormat === "csv" ? "text/csv" : "application/json",
        })
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Export gestartet: ${filename}`);
    } catch {
      toast.error("Export fehlgeschlagen");
    }
  };

  const handleDownloadReport = async () => {
    if (!currentHousehold) {
      return;
    }
    try {
      const { data } = await reportsAPI.downloadMonthly(
        currentHousehold.id,
        reportYear,
        reportMonth
      );
      const url = URL.createObjectURL(new Blob([data], { type: "text/html" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `bericht-${reportYear}-${String(reportMonth).padStart(2, "0")}.html`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Bericht heruntergeladen");
    } catch {
      toast.error("Fehler beim Generieren des Berichts");
    }
  };

  const handleSendReport = async () => {
    if (!currentHousehold) {
      return;
    }
    setSendingReport(true);
    try {
      const { data } = await reportsAPI.sendMonthly(
        currentHousehold.id,
        reportYear,
        reportMonth
      );
      toast.success(data.message || "Bericht gesendet");
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Versand fehlgeschlagen");
    } finally {
      setSendingReport(false);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!(file && currentHousehold)) {
      return;
    }
    setImporting(true);
    try {
      const { data } = await backupAPI.import(currentHousehold.id, file);
      toast.success(
        `Import: ${data.imported} neu, ${data.skipped} bereits vorhanden${data.errors?.length ? `, ${data.errors.length} Fehler` : ""}`
      );
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Import fehlgeschlagen");
    } finally {
      setImporting(false);
      if (importRef.current) {
        importRef.current.value = "";
      }
    }
  };

  return (
    <div className="max-w-xl space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Database className="text-[var(--primary)]" size={24} />
        <h1 className="font-bold text-2xl text-gray-900 dark:text-white">
          Datensicherung
        </h1>
      </div>

      {!currentHousehold && (
        <div className="card p-4 text-gray-500 text-sm">
          Bitte zuerst einen Haushalt auswählen.
        </div>
      )}

      {currentHousehold && (
        <>
          {/* Export */}
          <div className="card p-6">
            <h2 className="mb-1 font-semibold text-gray-900 dark:text-white">
              Exportieren
            </h2>
            <p className="mb-5 text-gray-500 text-sm dark:text-gray-400">
              Exportiere alle Transaktionen von{" "}
              <strong>{currentHousehold.name}</strong> als JSON oder CSV.
              JSON-Exporte können vollständig wiederhergestellt werden.
            </p>
            <div className="flex items-center gap-3">
              <select
                className="input text-sm"
                onChange={(e) =>
                  setExportFormat(e.target.value as "json" | "csv")
                }
                style={{ width: "8rem" }}
                value={exportFormat}
              >
                <option value="json">JSON</option>
                <option value="csv">CSV</option>
              </select>
              <button
                className="btn-primary flex flex-shrink-0 items-center gap-2 text-sm"
                onClick={handleExport}
              >
                <Download size={15} /> Exportieren
              </button>
            </div>
          </div>

          {/* Monatsberichte */}
          <div className="card p-6">
            <h2 className="mb-1 font-semibold text-gray-900 dark:text-white">
              Monatsbericht
            </h2>
            <p className="mb-4 text-gray-500 text-sm dark:text-gray-400">
              HTML-Bericht mit Übersicht, Kategorien und allen Buchungen
              herunterladen oder per E-Mail senden.
            </p>
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <select
                className="input w-auto text-sm"
                onChange={(e) => setReportMonth(+e.target.value)}
                value={reportMonth}
              >
                {[
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
                ].map((m, i) => (
                  <option key={i} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
              <select
                className="input w-auto text-sm"
                onChange={(e) => setReportYear(+e.target.value)}
                value={reportYear}
              >
                {[now.getFullYear() - 1, now.getFullYear()].map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                className="btn-primary flex items-center gap-2 text-sm"
                onClick={handleDownloadReport}
              >
                <FileText size={15} /> Herunterladen
              </button>
              <button
                className="flex items-center gap-2 rounded-xl bg-gray-100 px-4 py-2 font-medium text-sm transition-colors hover:bg-gray-200 disabled:opacity-50 dark:bg-slate-700 dark:hover:bg-slate-600"
                disabled={sendingReport}
                onClick={handleSendReport}
              >
                {sendingReport ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" />
                ) : (
                  <Mail size={15} />
                )}
                Per E-Mail senden
              </button>
            </div>
          </div>

          {/* Import */}
          <div className="card p-6">
            <h2 className="mb-1 font-semibold text-gray-900 dark:text-white">
              Wiederherstellen
            </h2>
            <p className="mb-5 text-gray-500 text-sm dark:text-gray-400">
              Importiere eine zuvor exportierte JSON- oder CSV-Datei. Bereits
              vorhandene Transaktionen werden nicht überschrieben
              (Duplikaterkennung aktiv).
            </p>
            <input
              accept=".json,.csv"
              className="hidden"
              onChange={handleImport}
              ref={importRef}
              type="file"
            />
            <button
              className="flex items-center gap-2 rounded-xl bg-gray-100 px-4 py-2 font-medium text-sm transition-colors hover:bg-gray-200 disabled:opacity-50 dark:bg-slate-700 dark:hover:bg-slate-600"
              disabled={importing}
              onClick={() => importRef.current?.click()}
            >
              {importing ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" />
              ) : (
                <Upload size={15} />
              )}
              {importing ? "Importiere…" : "Datei wählen & importieren"}
            </button>
          </div>
        </>
      )}

      {/* SFTP-Backup — nur für Superadmin */}
      {user?.role === "superadmin" && <SftpBackupSection />}
    </div>
  );
}
