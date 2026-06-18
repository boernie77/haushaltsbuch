# Haushaltsbuch – Bedienungsanleitung

Diese Anleitung erklärt alle Funktionen der App und die kleinen Besonderheiten,
die nicht auf den ersten Blick offensichtlich sind. Die App gibt es als
**Web-Version** (im Browser, https://haushalt.bernauer24.com) und als
**iPhone-App**. Beide greifen auf dieselben Daten zu.

---

## 1. Grundbegriffe: Haushalt vs. Haushaltsbuch

Das ist der wichtigste Begriff, um die App zu verstehen:

| Begriff | Bedeutung |
|---|---|
| **Haushalt** | Eine Personengruppe (z. B. „Familie Bernauer"). Die Daten verschiedener Haushalte sind **streng getrennt** – niemand sieht die Buchungen einer fremden Familie. |
| **Haushaltsbuch** | Ein einzelnes Budget-Buch. Ein Nutzer kann mehrere haben, z. B. „Unser Haushalt" (gemeinsam) und „Christian Privat". |

Oben in der App kannst du jederzeit zwischen deinen Haushaltsbüchern **umschalten**
(Klick auf den Namen oben links). Buchungen lassen sich zwischen deinen **eigenen**
Haushaltsbüchern verschieben – aber **niemals** in das Buch einer fremden
Personengruppe.

---

## 2. Erste Schritte

- **Registrierung:** Nur mit **Einladungscode** möglich. Der Code legt fest, ob du
  ein eigenes neues Haushaltsbuch bekommst oder einem bestehenden beitrittst.
- **Testphase:** Nach der Registrierung läuft automatisch ein **31-tägiges Testabo**.
  5 Tage und 2 Tage vor Ablauf bekommst du eine Erinnerungs-E-Mail. Danach wird das
  Konto deaktiviert, bis ein Abo aktiviert wird.
- **Passwort vergessen?** Auf der Login-Seite „Passwort vergessen" wählen – du
  bekommst eine E-Mail mit einem Link (1 Stunde gültig).
- **Passwort ändern:** Im Benutzer-Menü oben rechts.

---

## 3. Buchungen erfassen

Eine Buchung ist eine **Ausgabe** oder **Einnahme**. So legst du sie an:

1. Auf **„Neue Buchung"** klicken.
2. **Betrag**, **Beschreibung**, **Datum**, **Kategorie** und **Konto** wählen.
3. Optional: einen **Beleg/Quittung** als Foto hochladen.

**Besonderheiten:**
- **Eigene Kategorien:** Über das **„+"** neben dem Kategorie-Feld kannst du eigene
  Kategorien anlegen (Name, Symbol, Farbe). Es gibt 18 vorgegebene Systemkategorien.
- **Duplikat-Warnung:** Gibst du eine Buchung ein, die einer bestehenden sehr ähnlich
  ist (Betrag, Datum, Beschreibung), warnt dich die App automatisch.
- **Bearbeiten:** Über das **Stift-Symbol** an einer Buchung. Das Formular oben wird
  befüllt und die Seite scrollt automatisch hoch.
- **Verschieben:** Über das **Pfeil-Symbol (↔)** verschiebst du eine Buchung in ein
  anderes deiner Haushaltsbücher. Kategorien, die es im Ziel nicht gibt, werden dabei
  entfernt.

---

## 4. KI-Quittungsscan (OCR)

Du kannst eine Quittung **fotografieren** und die KI liest automatisch **Betrag,
Datum und einen Oberbegriff** (z. B. „Lebensmitteleinkauf") aus. Das Bild wird vorher
automatisch aufbereitet (Schwarz-Weiß-Dokumentenfilter), damit der Text gut lesbar ist.
Du musst die Vorschläge nur noch prüfen und speichern.

---

## 5. Konten und Umbuchungen

Unter **„Konten"** verwaltest du deine echten Geld-Töpfe: Girokonto, Bargeld,
Sparkonto, Kreditkarte, Darlehen usw.

### Konto-Typen
- **Aktivkonto** (Giro, Spar, Bargeld): Ein **positiver** Saldo ist Guthaben (grün).
- **Passivkonto** (Kreditkarte, Darlehen, Dispo): Hier gibst du beim Anlegen deine
  **aktuellen Schulden** als positive Zahl ein. Ein **negativer** Saldo (rot) bedeutet
  offene Schulden.

Die Übersicht oben zeigt **Aktiva**, **Passiva** und dein **Reinvermögen** (alles
zusammengerechnet).

### Anfangsbestand mit Datum („Stand am")
Beim Anlegen/Bearbeiten eines Kontos gibst du den **aktuellen Saldo** und das Feld
**„Stand am"** ein. Das ist das Datum, auf das sich dieser Startsaldo bezieht.

> **Wichtig:** Buchungen **vor** diesem Datum werden **nicht** mitgezählt – sie gelten
> als bereits im Anfangsbestand enthalten. So vermeidest du Doppelzählungen, wenn du
> mit einem Konto erst ab einem bestimmten Tag startest. Lässt du das Datum leer,
> zählen wie bisher alle Buchungen.

### Umbuchen zwischen Konten (Transfer)
Wählst du als Buchungstyp **„Umbuchung"**, gibst du ein **Quellkonto** und ein
**Zielkonto** an. Das Geld wird vom einen Konto abgezogen und dem anderen
gutgeschrieben.

> **Besonderheit:** Umbuchungen sind in den **Statistiken neutral** – sie tauchen
> nicht als Ausgabe oder Einnahme auf. Beispiel: Du tilgst deine Kreditkarte vom
> Girokonto – das ist nur eine Umschichtung, keine echte Ausgabe. Echte Kosten (z. B.
> **Zinsen** auf ein Darlehen) erfasst du dagegen als normale **Ausgabe** auf dem
> jeweiligen Konto, damit sie in der Statistik erscheinen.

---

## 6. Der verschiebbare Monatsanfang ⭐

Das ist die wichtigste Besonderheit der App. Normalerweise läuft ein Monat vom 1. bis
zum Monatsende. Du kannst aber pro Haushaltsbuch einen **anderen Monatsanfang**
einstellen (1.–28., Standard ist der 1.) – nützlich, wenn dein **Gehalt z. B. am 27.**
kommt und du deinen „Budget-Monat" ab dann rechnen willst.

Einstellbar unter **Haushalt → Monatsanfang**.

### So wird der Zeitraum benannt
Der Monatsname richtet sich nach dem **End-Monat** der Periode, nicht nach dem Start:

> Beispiel mit Monatsanfang **27.**:
> - Die Periode **„April"** geht vom **27. März bis 26. April**.
> - Der **27. März** gehört also bereits zu „April".
> - Der **27. April** gehört schon zu „Mai".

**Warum so?** Wer am 27. sein Gehalt bekommt, empfindet den 27. März intuitiv als
„Start in den April". Diese Logik zieht sich **konsistent durch die ganze App** –
Übersicht, Buchungsliste, Budgets und **alle Statistiken** ordnen jede Buchung nach
diesem Schema ihrem Monat zu.

> Der **Kalender** (siehe unten) ist die einzige Ausnahme: Er zeigt immer echte
> Kalendertage und -monate, unabhängig vom eingestellten Monatsanfang.

---

## 7. Wiederkehrende Buchungen (Daueraufträge)

Für regelmäßige Beträge (Miete, Gehalt, Abos) legst du eine **wiederkehrende Buchung**
an:
- Schalter **„Wiederkehrend"** aktivieren und Intervall wählen: **wöchentlich,
  monatlich oder jährlich**.
- Optional ein **Enddatum** setzen – danach stoppt der Dauerauftrag automatisch.

So funktioniert es:
- Die wiederkehrende Buchung ist eine **Vorlage** und erscheint **nicht** in der
  normalen Buchungsliste, sondern im eigenen Tab **„Wiederkehrend"**.
- Jede Nacht erzeugt die App aus fälligen Vorlagen automatisch die echten Buchungen.
- Im Tab „Wiederkehrend" siehst du eine **Hochrechnung** (Ausgaben/Einnahmen/Saldo pro
  Monat) und kannst Daueraufträge **bearbeiten, beenden oder verschieben**.

---

## 8. Sub-Konten / Spesen 💼

Sub-Konten sind **Sammeltöpfe** für eine Kategorie – ideal z. B. für **Spesen**,
Reisekosten oder Projektausgaben, die du erst sammelst und später abrechnest.

### Idee dahinter
Eine Kategorie wird als **Sub-Konto** markiert (unter **„Sub-Konten"** → „Kategorie
als Sub-Konto" oder beim Anlegen einer Kategorie über die Checkbox „Mit Sub-Konto").
Dann gilt:

- Alle Buchungen dieser Kategorie **tauchen nicht in den normalen Statistiken auf** –
  sie werden separat gesammelt.
- Jede solche Buchung gehört zu einer **Periode** (Monat). Auf der Seite „Sub-Konten"
  siehst du den **Saldo pro Periode** (Einnahmen, Ausgaben, Differenz).

### Abrechnen („Schließen")
Wenn du eine Periode abrechnest, klickst du auf **„Schließen"**. Dann passiert:
- Die App erzeugt eine einzelne **Abrechnungs-Buchung** über den Saldo. Erst **diese**
  erscheint in der Statistik – als Einnahme (wenn unterm Strich etwas übrig ist) oder
  als Ausgabe (wenn es ein Minus war).
- Diese Abrechnungs-Buchung ist „virtuell" – sie **bewegt keinen Konto-Saldo**, weil
  das Geld ja schon über die Einzelbuchungen geflossen ist.
- Ein Schließen kann jederzeit wieder **rückgängig** gemacht werden.

### Bestehende Buchungen einsortieren
Hast du eine Kategorie nachträglich zum Sub-Konto gemacht, kannst du mit
**„Bestehende einsortieren"** alle alten Buchungen dieser Kategorie nachträglich
ihren Perioden zuordnen.

---

## 9. Kalender 📅

Der **Kalender** zeigt eine Monatsansicht mit allen Tagen – **Vergangenheit und
Zukunft**.

- Jede Tageszelle zeigt die **Anzahl der Buchungen**, das **Tages-Netto** und das
  **Gesamtvermögen am Tagesende**.
- **Klick auf einen Tag** öffnet rechts die Details: die **Kontostände am Tagesende**
  (je Konto und gesamt) sowie die **Liste aller Buchungen** dieses Tages.
- **Vorausschau:** Für zukünftige Tage werden auch deine **Daueraufträge** als Vorschau
  eingerechnet (gestrichelt markiert mit „Vorschau"). So siehst du, wie sich deine
  Kontostände voraussichtlich entwickeln.

> Der Kalender arbeitet mit echten Kalendertagen – der verschiebbare Monatsanfang
> wirkt sich hier **nicht** aus.

---

## 10. Budgets und Sparziele

Unter **„Budget"**:
- **Budgets:** Lege pro Kategorie ein monatliches Limit fest. Du wirst gewarnt, wenn
  du dich der Grenze näherst. Es gibt auch ein Gesamt-Monatsbudget pro Haushaltsbuch.
- **Sparziele:** Lege Ziele an (Name, Symbol, Zielbetrag, optional Frist) und zahle
  Beträge ein. Ein Fortschrittsbalken zeigt, wie weit du bist.

---

## 11. Statistiken

Unter **„Statistiken"** gibt es mehrere Reiter:

- **Monat:** Ausgaben/Einnahmen der aktuellen Periode inkl. Prognose für den laufenden
  Monat (Hochrechnung bis Monatsende).
- **Jahr:** Verlauf über das Jahr.
- **Trends:** Durchschnittliche Ausgaben pro Kategorie.
- **Vermögen:** Kumulierte Bilanz über die Zeit.
- **Personen:** Wer hat wie viel ausgegeben – inkl. **Ausgleichsrechnung** (wer wem
  noch etwas schuldet).
- **Fester Saldo:** Zeigt deine **fixen** monatlichen Einnahmen und Ausgaben (aus den
  Daueraufträgen hochgerechnet) und den Saldo daraus – inklusive eines Verlaufs über
  die Monate. Mit „Aktuellen Monat festhalten" frierst du den aktuellen Wert ein.

---

## 12. Suchen, Filtern, Sortieren

In der Buchungsliste:
- **Suche:** Durchsucht Beschreibung, Händler **und den Betrag** (z. B. „12", „12,50"
  oder „12.50").
- **Filter:** Nach Typ (Ausgabe/Einnahme) und nach Kategorie.
- **Sortieren:** Klick auf die Spaltenköpfe **Datum** oder **Betrag**.
- Bei aktiver Suche oder Filter erscheint eine **Trefferzeile** mit Anzahl und Summen.
- Mit den **Pfeilen ← →** (und „Heute") oben wechselst du den Monat. Der gewählte Monat
  bleibt beim Seitenwechsel erhalten.

---

## 13. Monatsberichte und Datensicherung

- **Monatsberichte:** Am 1. jedes Monats wird (falls aktiviert) automatisch ein
  HTML-Bericht des Vormonats per E-Mail an alle Mitglieder verschickt. Du kannst ihn
  auch jederzeit manuell herunterladen oder versenden.
- **Datensicherung:** Unter „Datensicherung" exportierst du dein Haushaltsbuch als
  **JSON oder CSV** und kannst Daten wieder importieren (mit Duplikaterkennung).

---

## 14. Paperless-Integration (optional)

Wenn du ein **Paperless-ngx**-Dokumentenarchiv betreibst, kannst du deine Quittungen
beim Erfassen direkt **nach Paperless hochladen** – mit Dokumenttyp, Absender, Tags und
Berechtigungen. Die Auswahllisten werden regelmäßig automatisch synchronisiert; deine
Favoriten erscheinen bevorzugt im Upload-Dialog.

---

## 15. Mobile-App: Offline-Modus

Die iPhone-App funktioniert auch **ohne Internet**:
- Übersicht, Budgets und Buchungsliste werden zwischengespeichert.
- Buchungen **ohne Foto** kannst du offline anlegen – sie landen in einer Warteschlange
  und werden mit einem **Uhr-Symbol „(ausstehend)"** angezeigt.
- Sobald wieder Verbindung besteht (beim App-Start oder Wechsel in den Vordergrund),
  werden sie automatisch synchronisiert.

---

## 16. Darstellung (Themes)

In den Einstellungen kannst du das Erscheinungsbild wählen, u. a. ein helles
(rosa) und ein dunkles (dunkelblaues) Design sowie professionelle Varianten.

---

## 17. Verwaltung (für Haushalts-Admins / Superadmin)

- **Mitglieder einladen:** Als Haushalts-Admin erzeugst du Einladungscodes, mit denen
  weitere Personen deinem Haushaltsbuch beitreten.
- **Haushaltsbuch löschen:** Möglich, solange mindestens ein anderes Buch übrig bleibt.
  Dabei werden alle zugehörigen Daten mitgelöscht.
- **Abo verwalten (nur Superadmin):** Konten aktivieren/deaktivieren und Monatsabos
  freischalten.

---

## Kurz-Spickzettel

| Ich möchte … | … das geht so |
|---|---|
| Eine Ausgabe erfassen | „Neue Buchung" → Typ „Ausgabe" |
| Geld zwischen Konten umbuchen | „Neue Buchung" → Typ „Umbuchung" (neutral in Statistik) |
| Schulden eintragen | Konto vom Typ „Passivkonto" anlegen, Schulden positiv eingeben |
| Spesen sammeln & abrechnen | Kategorie als Sub-Konto markieren → später „Schließen" |
| Miete monatlich automatisch | Buchung mit „Wiederkehrend" + Intervall „monatlich" |
| Budget-Monat ab dem 27. | Haushalt → Monatsanfang = 27 |
| Künftige Kontostände sehen | „Kalender" → Zukunft (Daueraufträge werden projiziert) |
| Nach einem Betrag suchen | Suchfeld in der Buchungsliste, z. B. „12,50" |

---

*Stand: v1.0.9 (Juni 2026). Die App wird laufend weiterentwickelt – die Versionsnummer
siehst du unten in der Seitenleiste der Web-App.*
