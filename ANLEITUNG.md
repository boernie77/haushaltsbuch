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
- **Unterwegs schneller:** In der iPhone-App gibt es die **Schnellerfassung** (siehe
  Kapitel 16), Betrag, Kategorie, fertig. Den Rest ergänzt später der Bank-Import.

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

Optional kannst du bei einem Konto seine **IBAN** eintragen. Der Bank-Import
(Kapitel 15) erkennt Überweisungen auf oder von dieser IBAN dann automatisch als
Umbuchung zwischen deinen Konten.

### Kontostand mit Stichtag
Beim Anlegen/Bearbeiten eines Kontos gibst du den **Kontostand** und einen
**Stichtag** ein – den Tag, an dem dieser Saldo galt.

> **Wichtig:** Nur Buchungen **nach** dem Stichtag werden zum Saldo **addiert**.
> Buchungen am Stichtag selbst und davor gelten als bereits im eingegebenen Saldo
> enthalten und werden nicht erneut gezählt. So vermeidest du Doppelzählungen. Lässt
> du den Stichtag leer, zählen wie bisher alle Buchungen.
>
> Beim Bearbeiten zeigt dir eine **Live-Vorschau** sofort den daraus berechneten
> heutigen Saldo – so siehst du direkt, ob dein Wert passt.

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
- **Bearbeiten:** Ein **Klick auf eine Buchung** öffnet sie direkt zum Bearbeiten in
  der Buchungsliste (die Vorschau-Buchungen der Daueraufträge bearbeitest du im Tab
  „Wiederkehrend").

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

Umgekehrt nutzt der **Bank-Import** dein Paperless: Er sucht zu jedem Kontoumsatz die
passende Rechnung und übernimmt deren Titel als Beschreibung (siehe Kapitel 15,
„Abgleich mit Paperless").

---

## 15. Bank-Import (CSV / MT940) 🏦

Unter **„Bank-Sync"** liest du die Umsätze aus deinem Online-Banking als Datei ein,
statt sie abzutippen. Getestet ist der Import mit der **Sparda-Bank Nürnberg** (CSV
und MT940) und der **ING** (CSV).

### Ablauf
1. **Ziel-Konto** wählen, die exportierte **Datei** auswählen und auf **„Vorschau"**
   klicken.
2. Bei CSV-Dateien die **Spaltenzuordnung** prüfen (Datum, Betrag, Verwendungszweck,
   Empfänger, optional IBAN). Sie wird pro Konto gemerkt.
3. In der Vorschau siehst du jeden Umsatz mit einem **Vorschlag** für Kategorie und
   Beschreibung. Ein Etikett zeigt, woher der Vorschlag stammt. Alles lässt sich
   ändern, und über den Haken entscheidest du, was importiert wird.
4. Auf **„… importieren"** klicken.

**Besonderheiten:**
- **Mehrfach einlesen schadet nicht:** Schon importierte Umsätze erkennt die App und
  wählt sie ab („bereits importiert").
- **Die Vorschau bleibt erhalten**, wenn du zwischendurch z. B. zu „Buchungen"
  wechselst, um etwas nachzuschauen oder eine Kategorie anzulegen. Neue Kategorien
  stehen sofort zur Auswahl. Die Vorschau verschwindet erst nach dem Import, mit
  **„Verwerfen"**, beim Wechsel des Haushaltsbuchs oder wenn du den Browser-Tab
  schließt.
- Mit **„unsichere abwählen"** nimmst du Umsätze ohne Kategorie oder mit unsicherem
  KI-Vorschlag aus dem Import.

### Woher die Vorschläge kommen
Die App prüft der Reihe nach:

1. **Vorhandene Buchung** (Etikett „✓ Schnellerfassung", „✓ Dauerauftrag",
   „✓ Umbuchung" oder „✓ Vorhandene Buchung"): Gibt es schon eine Buchung mit
   gleichem Betrag und ähnlichem Datum (±5 Tage, bei Daueraufträgen ±7 Tage), wird
   sie **ergänzt statt doppelt angelegt**. Sie bekommt das **Bankdatum**, das Konto,
   den Empfänger und den Verwendungszweck. **Kategorie und Beschreibung bleiben
   deine.** Stimmt die Zuordnung nicht, klickst du auf **„Verknüpfung lösen"**, dann
   wird der Umsatz als neue Buchung importiert.
2. **Eigenes Konto** („↔ Eigenes Konto (IBAN)"): Überweisung auf oder von der IBAN
   eines deiner Konten → Umbuchung.
3. **Regel** (siehe unten).
4. **Gelernt:** Für diesen Empfänger hast du schon einmal eine Kategorie oder
   Umbuchung bestätigt.
5. **KI** („✨ KI", optional, siehe unten).

Zusätzlich kann ein **Paperless-Dokument** die Beschreibung liefern („📄 …", siehe
unten). „? bitte zuordnen" heißt: kein Vorschlag gefunden.

> **Die App lernt mit:** Bestätigst du einen KI-Vorschlag, änderst du eine Kategorie
> oder wird eine Schnellerfassung zugeordnet, merkt sich die App den Empfänger. Beim
> nächsten Import kommt der Vorschlag dann ohne KI.

### Umbuchungen zwischen eigenen Konten
Statt einer Kategorie kannst du in der Vorschau **„↔ Konto …"** wählen, z. B. für die
Kreditkartenabrechnung vom Girokonto. Daraus wird eine **Umbuchung**: Sie zählt nicht
als Ausgabe, beide Kontostände stimmen trotzdem. Liest du später die
Kreditkarten-Datei ein, erkennt die App den Ausgleich als Gegenseite derselben
Umbuchung und legt nichts doppelt an. Vorhandene Umbuchungen (auch aus
Daueraufträgen) werden genauso abgeglichen.

### Tab „Zuordnung & KI"
- **Schalter:** vorhandene Buchungen abgleichen, mit Paperless abgleichen, Regeln
  anwenden.
- **Regeln:** „Wenn *Empfänger / Verwendungszweck / IBAN* enthält *…*" (optional mit
  Betragsbereich) „→ Kategorie *oder* Umbuchung", optional mit fester Beschreibung.
  Die erste passende Regel gewinnt, Groß- und Kleinschreibung spielt keine Rolle.
- **KI-Vorschläge** sind standardmäßig **aus**. Zur Wahl stehen:
  - **Claude** (Anthropic, Cloud) mit dem API-Key aus *Haushalt → KI-Einstellungen*.
    Mit dem Modell Haiku kostet ein Import mit ~100 Buchungen etwa 1 Cent.
  - **Eigener KI-Server** mit OpenAI-kompatibler Schnittstelle (z. B. Ollama,
    LM Studio, vLLM): Adresse, Modell und optional API-Key eintragen, mit
    **„Verbindung testen"** prüfen. Der Server muss vom Haushaltsbuch-Server aus
    erreichbar sein. Empfohlen sind Modelle ab ca. 7–8 Milliarden Parametern. Ändern
    dürfen das nur Admins des Haushaltsbuchs.

  An die KI gehen nur **Betrag, Empfänger, Verwendungszweck und deine
  Kategorienamen**, keine IBAN und kein Kontostand. Optional schreibt die KI auch eine
  kurze Beschreibung („KI schreibt Beschreibung").
- **Wartung:** „Aus bestehenden Buchungen lernen" übernimmt einmalig die häufigste
  Kategorie je Empfänger. „Importierte Buchungen löschen" entfernt alle per Import
  angelegten Buchungen eines Kontos, von Hand erfasste bleiben.

### Abgleich mit Paperless
Ist Paperless eingerichtet, sucht der Import zu jedem Umsatz eine passende Rechnung
oder einen Beleg. Ein Treffer braucht immer ein **passendes Datum** (Dokument bis 45
Tage vor bis 5 Tage nach der Zahlung) und zusätzlich:
- eine **Bestellnummer** aus dem Verwendungszweck, die auch im Dokument steht (z. B.
  bei Amazon, dann landen auch Teillieferungen bei derselben Bestellung), **oder**
- **Betrag bzw. Kunden-/Mandatsnummer** im Dokument **und** einen passenden Absender.

Kontoauszüge werden deshalb nicht zugeordnet. Der Dokumenttitel wird zur
Beschreibung, und die Buchung wird mit dem Dokument verknüpft: In der Vorschau führt
der Link „📄 …" ins Dokument, in der Buchungsliste das grüne Dokument-Symbol.

> **Tipp für Amazon und PayPal:** Bestellbestätigungen und Zahlungsbelege kommen nur
> als Mail. Damit sie in Paperless landen, braucht Paperless eine Mail-Regel mit
> „Mail als .eml verarbeiten" (setzt die Paperless-Zusatzdienste Tika und Gotenberg
> voraus).

---

## 16. Schnellerfassung (iPhone) ⚡

Für unterwegs, direkt beim Bezahlen: In der Übersicht oben rechts auf **„⚡ Schnell"**
tippen, Betrag über den Ziffernblock eingeben, eine Kategorie-Kachel antippen,
optional ein Stichwort (z. B. „Pizza mit Team"), **Speichern**. Das Datum ist
automatisch „heute", und das funktioniert auch offline.

- **Kacheln:** Automatisch zeigt die App deine meistgenutzten Kategorien der letzten
  90 Tage (nur von Hand erfasste Buchungen). Über **„Eigene Kacheln festlegen"**
  wählst und sortierst du sie selbst, getrennt für Ausgaben und Einnahmen, bis zu 11
  Kacheln. Die Auswahl gilt pro Person und Haushaltsbuch. **„Mehr"** zeigt alle
  Kategorien.
- Die Kacheln gehören zum **in der Übersicht gewählten Haushaltsbuch**. Fehlt eine
  Kategorie, bist du vielleicht im falschen Buch.
- Die Buchung zählt sofort in Budgets und Statistik. Beim nächsten **Bank-Import**
  wird sie mit dem Kontoumsatz zusammengeführt (Kapitel 15). Schnellerfassungen ohne
  passenden Umsatz zeigt die Vorschau als Hinweis, z. B. bei Barzahlung. Dort kannst
  du sie mit **„Bar bezahlt, nicht mehr abgleichen"** aus dem Abgleich nehmen.

---

## 17. Mobile-App: Offline-Modus

Die iPhone-App funktioniert auch **ohne Internet**:
- Übersicht, Budgets und Buchungsliste werden zwischengespeichert.
- Buchungen **ohne Foto** kannst du offline anlegen – sie landen in einer Warteschlange
  und werden mit einem **Uhr-Symbol „(ausstehend)"** angezeigt.
- Sobald wieder Verbindung besteht (beim App-Start oder Wechsel in den Vordergrund),
  werden sie automatisch synchronisiert.

---

## 18. Darstellung (Themes)

In den Einstellungen kannst du das Erscheinungsbild wählen, u. a. ein helles
(rosa) und ein dunkles (dunkelblaues) Design sowie professionelle Varianten.

---

## 19. Verwaltung (für Haushalts-Admins / Superadmin)

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
| Kontoauszug einlesen | „Bank-Sync" → Konto + Datei → „Vorschau" → importieren |
| Unterwegs schnell erfassen | iPhone: Übersicht → „⚡ Schnell" |
| Kreditkartenabrechnung als Umbuchung | Bank-Import-Vorschau → „↔ Kreditkarte" statt Kategorie |
| Empfänger immer gleich zuordnen | „Bank-Sync" → „Zuordnung & KI" → Regel anlegen |
| KI-Vorschläge beim Import | „Bank-Sync" → „Zuordnung & KI" → KI-Vorschläge aktivieren |

---

*Stand: v1.0.31 (Oktober 2026). Die App wird laufend weiterentwickelt – die Versionsnummer
siehst du unten in der Seitenleiste der Web-App.*
