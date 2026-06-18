import { BookOpen } from "lucide-react";
import type { ReactNode } from "react";

// In-App-Bedienungsanleitung. Inhaltlich synchron zu ANLEITUNG.md im Repo.
// Bewusst als JSX gepflegt (kein Markdown-Renderer als Dependency).

function Callout({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border-[var(--primary)] border-l-4 bg-[var(--primary)]/5 p-3 text-gray-700 text-sm dark:text-gray-300">
      {children}
    </div>
  );
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="card scroll-mt-20 space-y-3 p-5" id={id}>
      <h2 className="font-bold text-gray-900 text-lg dark:text-white">
        {title}
      </h2>
      <div className="space-y-3 text-gray-700 text-sm leading-relaxed dark:text-gray-300">
        {children}
      </div>
    </section>
  );
}

const SECTIONS: { id: string; title: string }[] = [
  { id: "begriffe", title: "1. Haushalt vs. Haushaltsbuch" },
  { id: "start", title: "2. Erste Schritte" },
  { id: "buchungen", title: "3. Buchungen erfassen" },
  { id: "ocr", title: "4. KI-Quittungsscan" },
  { id: "konten", title: "5. Konten & Umbuchungen" },
  { id: "monatsanfang", title: "6. Verschiebbarer Monatsanfang ⭐" },
  { id: "wiederkehrend", title: "7. Wiederkehrende Buchungen" },
  { id: "subkonten", title: "8. Sub-Konten / Spesen 💼" },
  { id: "kalender", title: "9. Kalender 📅" },
  { id: "budget", title: "10. Budgets & Sparziele" },
  { id: "statistik", title: "11. Statistiken" },
  { id: "suche", title: "12. Suchen, Filtern, Sortieren" },
  { id: "backup", title: "13. Berichte & Datensicherung" },
  { id: "mobile", title: "14. Mobile-App: Offline" },
];

export default function HelpPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-5 p-6">
      <div className="flex items-center gap-2">
        <BookOpen className="text-[var(--primary)]" size={24} />
        <h1 className="font-bold text-2xl text-gray-900 dark:text-white">
          Anleitung
        </h1>
      </div>
      <p className="text-gray-600 text-sm dark:text-gray-400">
        Alle Funktionen und Besonderheiten der App auf einen Blick.
      </p>

      {/* Inhaltsverzeichnis */}
      <nav className="card p-4">
        <h2 className="mb-2 font-semibold text-gray-500 text-xs uppercase tracking-wide">
          Inhalt
        </h2>
        <div className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
          {SECTIONS.map((s) => (
            <a
              className="text-[var(--primary)] text-sm hover:underline"
              href={`#${s.id}`}
              key={s.id}
            >
              {s.title}
            </a>
          ))}
        </div>
      </nav>

      <Section id="begriffe" title="1. Haushalt vs. Haushaltsbuch">
        <p>
          <strong>Haushalt</strong> = eine Personengruppe (z. B. „Familie"). Die
          Daten verschiedener Haushalte sind streng getrennt.
        </p>
        <p>
          <strong>Haushaltsbuch</strong> = ein einzelnes Budget-Buch. Du kannst
          mehrere haben (z. B. „Unser Haushalt" und „Privat") und oben links
          jederzeit umschalten.
        </p>
        <p>
          Buchungen lassen sich zwischen deinen <strong>eigenen</strong>{" "}
          Haushaltsbüchern verschieben – niemals in das Buch einer fremden
          Personengruppe.
        </p>
      </Section>

      <Section id="start" title="2. Erste Schritte">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Registrierung</strong> nur mit Einladungscode. Der Code legt
            fest, ob du ein eigenes Buch bekommst oder einem beitrittst.
          </li>
          <li>
            <strong>Testphase:</strong> automatisch 31 Tage, mit
            Erinnerungs-E-Mail 5 und 2 Tage vor Ablauf.
          </li>
          <li>
            <strong>Passwort vergessen?</strong> Link auf der Login-Seite (Reset
            per E-Mail, 1 Stunde gültig). Ändern im Benutzer-Menü oben rechts.
          </li>
        </ul>
      </Section>

      <Section id="buchungen" title="3. Buchungen erfassen">
        <p>
          „Neue Buchung" → Betrag, Beschreibung, Datum, Kategorie und Konto
          wählen, optional einen Beleg fotografieren.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Eigene Kategorien</strong> über das „+" neben dem
            Kategorie-Feld (Name, Symbol, Farbe).
          </li>
          <li>
            <strong>Duplikat-Warnung</strong> bei sehr ähnlichen Buchungen.
          </li>
          <li>
            <strong>Bearbeiten</strong> über das Stift-Symbol,{" "}
            <strong>Verschieben</strong> in ein anderes Haushaltsbuch über das
            Pfeil-Symbol (↔).
          </li>
        </ul>
      </Section>

      <Section id="ocr" title="4. KI-Quittungsscan (OCR)">
        <p>
          Quittung fotografieren – die KI liest Betrag, Datum und einen
          Oberbegriff (z. B. „Lebensmitteleinkauf") automatisch aus. Du prüfst
          die Vorschläge nur noch und speicherst.
        </p>
      </Section>

      <Section id="konten" title="5. Konten & Umbuchungen">
        <p>
          Unter <strong>„Konten"</strong> verwaltest du deine Geld-Töpfe
          (Girokonto, Bargeld, Kreditkarte, Darlehen …).
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Aktivkonto:</strong> positiver Saldo = Guthaben (grün).
          </li>
          <li>
            <strong>Passivkonto:</strong> Schulden positiv eingeben; ein
            negativer Saldo (rot) bedeutet offene Schulden.
          </li>
        </ul>
        <p>
          Beim Anlegen gibst du den aktuellen Saldo und das Feld{" "}
          <strong>„Stand am"</strong> an – das Datum, auf das sich der
          Startsaldo bezieht.
        </p>
        <Callout>
          <strong>Wichtig:</strong> Buchungen <em>vor</em> dem „Stand am"-Datum
          werden nicht mitgezählt – sie gelten als bereits im Anfangsbestand
          enthalten. Ohne Datum zählen alle Buchungen.
        </Callout>
        <p>
          <strong>Umbuchung:</strong> Buchungstyp „Umbuchung" wählen, dann
          Quell- und Zielkonto angeben. Umbuchungen sind in den Statistiken{" "}
          <strong>neutral</strong> (z. B. Kreditkarten-Tilgung vom Girokonto).
          Echte Kosten wie Darlehens-Zinsen erfasst du dagegen als normale{" "}
          <strong>Ausgabe</strong>.
        </p>
      </Section>

      <Section id="monatsanfang" title="6. Verschiebbarer Monatsanfang ⭐">
        <p>
          Pro Haushaltsbuch lässt sich der Monatsanfang einstellen (1.–28.,
          Standard 1.) – nützlich, wenn dein Gehalt z. B. am 27. kommt.
          Einstellbar unter <strong>Haushalt → Monatsanfang</strong>.
        </p>
        <Callout>
          Der Monatsname richtet sich nach dem <strong>End-Monat</strong> der
          Periode. Beispiel mit Monatsanfang 27.: Die Periode „April" geht vom{" "}
          <strong>27. März bis 26. April</strong>. Der 27. März gehört also
          schon zu „April", der 27. April bereits zu „Mai".
        </Callout>
        <p>
          Diese Logik zieht sich konsistent durch Übersicht, Buchungsliste,
          Budgets und alle Statistiken. Einzige Ausnahme: der{" "}
          <strong>Kalender</strong> zeigt immer echte Kalendertage.
        </p>
      </Section>

      <Section id="wiederkehrend" title="7. Wiederkehrende Buchungen">
        <p>
          Für regelmäßige Beträge (Miete, Gehalt, Abos): Schalter
          „Wiederkehrend" aktivieren, Intervall (wöchentlich / monatlich /
          jährlich) und optional ein Enddatum wählen.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Die Vorlage erscheint im eigenen Tab{" "}
            <strong>„Wiederkehrend"</strong>, nicht in der normalen Liste.
          </li>
          <li>Jede Nacht erzeugt die App die fälligen echten Buchungen.</li>
          <li>
            Im Tab siehst du eine monatliche Hochrechnung und kannst
            Daueraufträge bearbeiten, beenden oder verschieben.
          </li>
        </ul>
      </Section>

      <Section id="subkonten" title="8. Sub-Konten / Spesen 💼">
        <p>
          Sub-Konten sind <strong>Sammeltöpfe</strong> für eine Kategorie –
          ideal für Spesen, Reisekosten oder Projektausgaben, die du erst
          sammelst und später abrechnest.
        </p>
        <p>
          Eine Kategorie wird unter <strong>„Sub-Konten"</strong> (oder beim
          Anlegen per Checkbox „Mit Sub-Konto") markiert. Dann:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Buchungen dieser Kategorie tauchen <strong>nicht</strong> in den
            normalen Statistiken auf, sondern werden je Periode (Monat)
            gesammelt.
          </li>
          <li>
            Beim <strong>„Schließen"</strong> einer Periode entsteht eine
            einzelne Abrechnungs-Buchung über den Saldo – erst diese erscheint
            in der Statistik (Einnahme oder Ausgabe). Sie bewegt keinen
            Konto-Saldo und kann rückgängig gemacht werden.
          </li>
          <li>
            <strong>„Bestehende einsortieren"</strong> ordnet alte Buchungen
            einer neu markierten Kategorie nachträglich zu.
          </li>
        </ul>
      </Section>

      <Section id="kalender" title="9. Kalender 📅">
        <p>
          Monatsansicht aller Tage – Vergangenheit und Zukunft. Jede Tageszelle
          zeigt Anzahl Buchungen, Tages-Netto und das Gesamtvermögen am
          Tagesende.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Klick auf einen Tag → Kontostände am Tagesende (je Konto + gesamt)
            und alle Buchungen des Tages.
          </li>
          <li>
            <strong>Vorausschau:</strong> Für zukünftige Tage werden auch
            Daueraufträge eingerechnet (gestrichelt, „Vorschau").
          </li>
        </ul>
      </Section>

      <Section id="budget" title="10. Budgets & Sparziele">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Budgets:</strong> monatliches Limit pro Kategorie (+
            Gesamtbudget) mit Warnung beim Annähern an die Grenze.
          </li>
          <li>
            <strong>Sparziele:</strong> Ziel mit Betrag und optionaler Frist
            anlegen, Einzahlungen erfassen, Fortschrittsbalken verfolgen.
          </li>
        </ul>
      </Section>

      <Section id="statistik" title="11. Statistiken">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Monat:</strong> Ausgaben/Einnahmen + Prognose für den
            laufenden Monat.
          </li>
          <li>
            <strong>Jahr / Trends / Vermögen:</strong> Jahresverlauf,
            Durchschnitte pro Kategorie, kumulierte Bilanz.
          </li>
          <li>
            <strong>Personen:</strong> Ausgaben pro Person + Ausgleichsrechnung.
          </li>
          <li>
            <strong>Fester Saldo:</strong> fixe monatliche Einnahmen/Ausgaben
            (aus Daueraufträgen hochgerechnet) und ihr Verlauf.
          </li>
        </ul>
      </Section>

      <Section id="suche" title="12. Suchen, Filtern, Sortieren">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Suche</strong> durchsucht Beschreibung, Händler und den{" "}
            <strong>Betrag</strong> (z. B. „12", „12,50" oder „12.50").
          </li>
          <li>
            <strong>Filter</strong> nach Typ und Kategorie;{" "}
            <strong>Sortieren</strong> per Klick auf die Spalten Datum/Betrag.
          </li>
          <li>
            Mit den Pfeilen ← → (und „Heute") wechselst du den Monat – die
            Auswahl bleibt beim Seitenwechsel erhalten.
          </li>
        </ul>
      </Section>

      <Section id="backup" title="13. Berichte & Datensicherung">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Monatsberichte</strong> werden (falls aktiviert) automatisch
            am Monatsanfang per E-Mail verschickt; manueller Download/Versand
            jederzeit möglich.
          </li>
          <li>
            <strong>Datensicherung:</strong> Export als JSON/CSV und Import mit
            Duplikaterkennung.
          </li>
        </ul>
      </Section>

      <Section id="mobile" title="14. Mobile-App: Offline">
        <p>
          Die iPhone-App funktioniert auch ohne Internet: Übersicht, Budgets und
          Buchungsliste sind zwischengespeichert. Buchungen ohne Foto lassen
          sich offline anlegen (Uhr-Symbol „ausstehend") und werden bei nächster
          Verbindung automatisch synchronisiert.
        </p>
      </Section>

      <p className="pt-2 text-center text-gray-400 text-xs">
        Eine ausführliche Version dieser Anleitung liegt als ANLEITUNG.md im
        Projekt-Repository.
      </p>
    </div>
  );
}
