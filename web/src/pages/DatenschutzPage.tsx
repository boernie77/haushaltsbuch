export default function DatenschutzPage() {
  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="mb-6 font-bold text-2xl text-gray-900 dark:text-gray-100">
        Datenschutzerklärung
      </h1>

      <section className="mb-6">
        <h2 className="mb-2 font-semibold text-gray-800 text-lg dark:text-gray-200">
          1. Verantwortlicher
        </h2>
        <p className="text-gray-700 dark:text-gray-300">
          Christian Bernauer, Dianastr. 2b, 90547 Stein
          <br />
          E-Mail:{" "}
          <a
            className="text-[var(--primary)] hover:underline"
            href="mailto:christian@bernauer24.com"
          >
            christian@bernauer24.com
          </a>
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 font-semibold text-gray-800 text-lg dark:text-gray-200">
          2. Erhobene Daten
        </h2>
        <p className="mb-2 text-gray-700 dark:text-gray-300">
          Bei der Nutzung dieser Anwendung werden folgende personenbezogene
          Daten gespeichert:
        </p>
        <ul className="list-inside list-disc space-y-1 text-gray-700 dark:text-gray-300">
          <li>Name und E-Mail-Adresse (Registrierung)</li>
          <li>
            Passwort (verschlüsselt mit bcrypt, niemals im Klartext gespeichert)
          </li>
          <li>Finanzdaten (Buchungen, Beträge, Beschreibungen, Kategorien)</li>
          <li>Quittungsbilder (optional, bei Verwendung der Foto-Funktion)</li>
          <li>Haushaltsdaten und Budgets</li>
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 font-semibold text-gray-800 text-lg dark:text-gray-200">
          3. Zweck der Verarbeitung
        </h2>
        <p className="text-gray-700 dark:text-gray-300">
          Die Daten werden ausschließlich zur Bereitstellung der
          Haushaltsbuch-Funktionalität verwendet: Verwaltung von Haushalten,
          Buchungen, Budgets und Statistiken. Eine Weitergabe an Dritte findet
          nicht statt.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 font-semibold text-gray-800 text-lg dark:text-gray-200">
          4. KI-Analyse (OCR)
        </h2>
        <p className="text-gray-700 dark:text-gray-300">
          Bei Verwendung der Quittungsanalyse werden Bilder an die Anthropic API
          (Claude) übertragen, um Beträge und Händler automatisch zu erkennen.
          Die Verarbeitung erfolgt gemäß den{" "}
          <a
            className="text-[var(--primary)] hover:underline"
            href="https://www.anthropic.com/legal/privacy"
            rel="noopener noreferrer"
            target="_blank"
          >
            Datenschutzbestimmungen von Anthropic
          </a>
          . Die KI-Analyse ist optional und kann deaktiviert werden.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 font-semibold text-gray-800 text-lg dark:text-gray-200">
          5. Speicherung und Serverstandort
        </h2>
        <p className="text-gray-700 dark:text-gray-300">
          Alle Daten werden auf einem Server bei Hetzner Online GmbH
          (Deutschland) gespeichert. Der Serverstandort liegt innerhalb der EU.
          Es werden keine Cookies gesetzt. Die Authentifizierung erfolgt über
          JWT-Token, die lokal im Browser bzw. im sicheren App-Speicher des
          Geräts hinterlegt werden.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 font-semibold text-gray-800 text-lg dark:text-gray-200">
          6. Aufbewahrungsdauer
        </h2>
        <p className="text-gray-700 dark:text-gray-300">
          Daten werden gespeichert, solange ein Benutzerkonto aktiv ist. Nach
          Löschung des Kontos werden alle zugehörigen Daten entfernt.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 font-semibold text-gray-800 text-lg dark:text-gray-200">
          7. Ihre Rechte (DSGVO)
        </h2>
        <p className="mb-2 text-gray-700 dark:text-gray-300">
          Sie haben das Recht auf:
        </p>
        <ul className="list-inside list-disc space-y-1 text-gray-700 dark:text-gray-300">
          <li>Auskunft über gespeicherte Daten (Art. 15 DSGVO)</li>
          <li>Berichtigung unrichtiger Daten (Art. 16 DSGVO)</li>
          <li>Löschung Ihrer Daten (Art. 17 DSGVO)</li>
          <li>Einschränkung der Verarbeitung (Art. 18 DSGVO)</li>
          <li>Datenübertragbarkeit (Art. 20 DSGVO)</li>
          <li>Widerspruch gegen die Verarbeitung (Art. 21 DSGVO)</li>
        </ul>
        <p className="mt-2 text-gray-700 dark:text-gray-300">
          Zur Ausübung dieser Rechte wenden Sie sich an:{" "}
          <a
            className="text-[var(--primary)] hover:underline"
            href="mailto:christian@bernauer24.com"
          >
            christian@bernauer24.com
          </a>
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 font-semibold text-gray-800 text-lg dark:text-gray-200">
          8. Beschwerderecht
        </h2>
        <p className="text-gray-700 dark:text-gray-300">
          Sie haben das Recht, sich bei einer Datenschutz-Aufsichtsbehörde zu
          beschweren. Zuständig ist das Bayerische Landesamt für
          Datenschutzaufsicht (BayLDA), Promenade 18, 91522 Ansbach.
        </p>
      </section>
    </div>
  );
}
