import React, { useState, useRef } from 'react';
import { Download, Upload, Database } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/authStore';
import { backupAPI } from '../services/api';

export default function BackupPage() {
  const { currentHousehold } = useAuthStore();
  const [exportFormat, setExportFormat] = useState<'json' | 'csv'>('json');
  const [importing, setImporting] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  const handleExport = async () => {
    if (!currentHousehold) return;
    try {
      const { data } = await backupAPI.export(currentHousehold.id, exportFormat);
      const date = new Date().toISOString().split('T')[0];
      const filename = `haushalt-export-${date}.${exportFormat}`;
      const url = URL.createObjectURL(new Blob([data], { type: exportFormat === 'csv' ? 'text/csv' : 'application/json' }));
      const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
      toast.success(`Export gestartet: ${filename}`);
    } catch { toast.error('Export fehlgeschlagen'); }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentHousehold) return;
    setImporting(true);
    try {
      const { data } = await backupAPI.import(currentHousehold.id, file);
      toast.success(`Import: ${data.imported} neu, ${data.skipped} bereits vorhanden${data.errors?.length ? `, ${data.errors.length} Fehler` : ''}`);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Import fehlgeschlagen');
    } finally {
      setImporting(false);
      if (importRef.current) importRef.current.value = '';
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-xl">
      <div className="flex items-center gap-3">
        <Database size={24} className="text-[var(--primary)]" />
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Datensicherung</h1>
      </div>

      {!currentHousehold && (
        <div className="card p-4 text-sm text-gray-500">Bitte zuerst einen Haushalt auswählen.</div>
      )}

      {currentHousehold && (
        <>
          {/* Export */}
          <div className="card p-6">
            <h2 className="font-semibold text-gray-900 dark:text-white mb-1">Exportieren</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
              Exportiere alle Transaktionen von <strong>{currentHousehold.name}</strong> als JSON oder CSV.
              JSON-Exporte können vollständig wiederhergestellt werden.
            </p>
            <div className="flex items-center gap-3">
              <select value={exportFormat} onChange={e => setExportFormat(e.target.value as 'json' | 'csv')}
                className="input flex-none w-28 text-sm">
                <option value="json">JSON</option>
                <option value="csv">CSV</option>
              </select>
              <button onClick={handleExport} className="btn-primary flex items-center gap-2 text-sm">
                <Download size={15} /> Exportieren
              </button>
            </div>
          </div>

          {/* Import */}
          <div className="card p-6">
            <h2 className="font-semibold text-gray-900 dark:text-white mb-1">Wiederherstellen</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
              Importiere eine zuvor exportierte JSON- oder CSV-Datei.
              Bereits vorhandene Transaktionen werden nicht überschrieben (Duplikaterkennung aktiv).
            </p>
            <input ref={importRef} type="file" accept=".json,.csv" className="hidden" onChange={handleImport} />
            <button onClick={() => importRef.current?.click()} disabled={importing}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-100 dark:bg-slate-700 text-sm font-medium hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors disabled:opacity-50">
              {importing
                ? <div className="animate-spin h-4 w-4 border-2 border-[var(--primary)] border-t-transparent rounded-full" />
                : <Upload size={15} />}
              {importing ? 'Importiere…' : 'Datei wählen & importieren'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
