import type { LegalConfig } from "../services/api";

// Name + Anschrift des Betreibers; LEGAL_ADDRESS wird an Kommas umbrochen
// ("Musterstr. 1, 12345 Musterstadt").
export function OperatorAddress({ legal }: { legal: LegalConfig }) {
  const lines = [legal.name, ...legal.address.split(",")]
    .map((line) => line.trim())
    .filter(Boolean);
  return (
    <p className="text-gray-700 dark:text-gray-300">
      {lines.map((line, i) => (
        <span key={line}>
          {i > 0 && <br />}
          {line}
        </span>
      ))}
    </p>
  );
}

// Hinweis, wenn der Betreiber keine Angaben hinterlegt hat (z.B. private
// Installation im Heimnetz, die kein Impressum braucht).
export function LegalMissingNotice({ page }: { page: string }) {
  return (
    <section className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900 text-sm dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
      <p>
        Der Betreiber dieser Installation hat kein {page} hinterlegt.
      </p>
      <p className="mt-2 text-xs opacity-80">
        Für Betreiber: Angaben über <code>LEGAL_NAME</code>,{" "}
        <code>LEGAL_ADDRESS</code> und <code>LEGAL_EMAIL</code> (optional{" "}
        <code>LEGAL_HOSTING</code>, <code>LEGAL_AUTHORITY</code>) in der{" "}
        <code>.env</code> setzen.
      </p>
    </section>
  );
}
