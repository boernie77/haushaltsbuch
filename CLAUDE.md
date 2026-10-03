# Haushaltsbuch – Claude Code Instructions

## Projektübersicht
Budget-App für Haushalte mit Web, Mobile (iOS/Android) und KI-OCR-Quittungsanalyse.
- **GitHub:** https://github.com/boernie77/haushaltsbuch — **öffentlich seit 2026-10-02**, Lizenz AGPL-3.0. Alles, was committet wird, ist sofort für alle sichtbar: keine persönlichen Daten, IPs, Geräte-IDs oder Zugangsdaten in Code oder dieser Datei (→ `CLAUDE.local.md`, GitHub-Secrets/-Variablen).
- **Betrieb:** Docker Compose (siehe README). Die Instanz des Maintainers wird bei jedem Push auf `main` per GitHub Actions deployt (`.github/workflows/deploy.yml`).
- **Betriebsdetails der Maintainer-Instanz** (VPS, SSH, SMTP, iPhone-Build, Session-Notizen): `CLAUDE.local.md` — liegt nur lokal, ist in `.gitignore`. Wenn vorhanden, IMMER mitlesen.

## ⚠️ Projektziel (verbindlich, Stand 2026-10-02)
**Open Source zum Selbsthosten, kostenlos für jeden.** Christian ist aktuell der einzige Nutzer, weil er die App entwickelt und testet — das ist NICHT das Ziel, sondern nur der Zwischenstand.
- Jeder soll die Software selbst hosten können (öffentlich, kostenlos).
- Offizielle Apps in App Store und Google Play sind geplant.
- Der frühere Plan, die App als Dienstleistung (SaaS mit Testabo/Monatsabo) zu betreiben, wird **nicht mehr verfolgt**.

**Konsequenzen für jede Entscheidung:** Nichts auf Christians Banken, Server, Paperless-Instanz oder Konten zuschneiden. Features für beliebige Nutzer, Banken und Installationen denken (Konfiguration statt Hardcoding, verständliche Fehlermeldungen, Doku für Selbsthoster). Aufwand, der „für ein privates Projekt zu viel" wäre, ist für ein öffentliches Projekt oft angemessen — z.B. FinTS-Produktregistrierung (Produkteigner = Christian als Herausgeber der Open-Source-Software, eine Registrierungsnummer für alle Installationen).

## Stack
| Bereich | Technologie |
|---------|-------------|
| Backend | Node.js/Express, Sequelize ORM, PostgreSQL |
| Web | React + Vite + Tailwind CSS, React Router v6, Recharts |
| Mobile | React Native + Expo SDK 52, expo-router, react-native-paper, Zustand, react-native-mmkv |
| Auth | JWT (30 Tage), bcryptjs |
| KI/OCR | Anthropic Claude API (`claude-opus-4-6`) |
| Bildverarbeitung | Sharp (Quittungs-Scan-Filter) |
| SFTP-Backup | ssh2-sftp-client |
| Cron | node-cron |
| Reverse Proxy | Caddy (SSL, Port 8081) |

## Verzeichnisstruktur
```
/
├── backend/
│   ├── server.js                   Einstiegspunkt: migrate() → listen → startCron()
│   └── src/
│       ├── models/index.js         Alle Sequelize-Modelle
│       ├── migrations/             001-initial … 036-bank-sync-late-match
│       │                           (028–034 = Bank-Sync, siehe unten)
│       ├── routes/                 Express-Router (auth, households, transactions, admin, backup, ocr, paperless, …)
│       ├── services/
│       │   ├── backupService.js    Export/Import/SFTP-Upload/runGlobalBackup
│       │   └── cronService.js      Cron: Backup + Wiederkehrende Buchungen + Paperless-Auto-Sync
│       ├── middleware/auth.js      JWT + Role Guards
│       └── utils/
│           ├── migrate.js          Migrations-Runner (_migrations-Tabelle)
│           ├── receiptProcessor.js Sharp-Pipeline (B&W Dokumenten-Scan-Filter)
│           ├── bankImport.js       Bank-Sync: MT940-/CSV-Parser
│           ├── bankCategorizer.js  Bank-Sync: Abgleich vorhandener Buchungen, Regeln, KI
│           ├── merchantLearning.js Bank-Sync: Lern-Schlüssel Händler / Händler|Betrag, PayPal & Co.
│           ├── paperlessMatcher.js Bank-Sync: Umsatz ↔ Paperless-Dokument
│           ├── paperlessClient.js  getPaperlessClient + fetchAllPages (geteilt)
│           ├── anthropicKey.js     resolveApiKey (geteilt von OCR + Bank-Sync)
│           └── seedCategories.js   18 Systemkategorien (findOrCreate, läuft bei jedem Start)
├── web/
│   └── src/
│       ├── pages/                  Alle Seiten
│       ├── services/api.ts         Axios-Wrapper
│       ├── store/authStore.ts      Zustand Store
│       └── components/Layout.tsx  Sidebar + Household-Switcher + User-Dropdown-Menü
├── mobile/
│   ├── app/                        expo-router Screens
│   ├── ios/                        Natives iOS-Projekt (nach expo prebuild generiert)
│   └── src/
│       ├── services/api.ts         Mobile Axios-Wrapper
│       ├── services/offlineStore.ts  MMKV-Cache + Offline-Queue
│       ├── store/authStore.ts      Zustand + SecureStore
│       └── themes/index.ts         Feminine/Masculine Themes
├── data/                           Bind Mounts (in .gitignore)
│   ├── db/                         PostgreSQL-Daten
│   └── uploads/                    Quittungsbilder
├── docker-compose.yml
├── CLAUDE.md
└── .github/workflows/deploy.yml   Auto-Deploy bei push auf main + workflow_dispatch
```

## Begriffe: Haushalt vs. Haushaltsbuch
| Begriff | Bedeutung | DB-Modell |
|---------|-----------|-----------|
| **Haushalt** | Eine Personengruppe (z.B. Familie). Daten verschiedener Haushalte müssen **STRIKT GETRENNT** bleiben. | Kein eigenes Modell — implizit durch HouseholdMember-Zugehörigkeiten |
| **Haushaltsbuch** | Ein Budget-Buch innerhalb eines Haushalts. Ein User kann mehrere haben (z.B. "Unser Haushalt" + "Privat"). | `Household` |

⚠️ **KRITISCH:** NIEMALS Daten zwischen verschiedenen Haushalten (Personengruppen) verschieben oder teilen! Verschiebungen von Buchungen sind NUR zwischen den eigenen Haushaltsbüchern des angemeldeten Users erlaubt.

## Datenmodelle
- **User**: id, name, email, password, role (superadmin/admin/member), theme (feminine/masculine), aiKeyGranted (Abo-Spalten aus Migration 019 sind seit v1.0.41 ungenutzt, siehe „Benutzerverwaltung")
- **Household** (= Haushaltsbuch): id, name, currency, monthlyBudget, budgetWarningAt, anthropicApiKey, aiEnabled, adminUserId
- **HouseholdMember**: householdId, userId, role (admin/member/viewer)
- **Transaction**: amount, description, date, type (expense/income), categoryId, householdId, userId, receiptImage, merchant, tags, `isRecurring`, `recurringInterval` (weekly/monthly/yearly), `recurringDay`, `recurringNextDate`, `recurringEndDate` (optional, Cron stoppt Template wenn überschritten), `paperlessDocId` (INTEGER), `paperlessMetadata` (TEXT/JSON)
- **Category**: name, nameDE, icon, color, isSystem, householdId (null = global Systemkategorie)
- **Budget**: householdId, categoryId, limitAmount, month, year, warningAt
- **GlobalSettings**: id='global', anthropicApiKey, aiKeyPublic (single-row)
- **InviteCode**: code, **type** (new_household|add_member), householdId, role, useCount, maxUses, expiresAt
- **BackupConfig**: sftpHost, sftpPort, sftpUser, sftpPassword, sftpPath, schedule, scheduleLabel, isActive, lastRunAt, lastRunStatus
- **PaperlessConfig**: householdId, baseUrl, apiToken, isActive
- **PaperlessDocumentType / PaperlessCorrespondent / PaperlessTag**: householdId, paperlessId, name, `isFavorite`, syncedAt
- **PaperlessUser**: householdId, paperlessId (Integer), username, fullName, `isEnabled` (default true), syncedAt
- **TransactionSplit**: transactionId, categoryId, amount, description
- **SavingsGoal**: householdId, name, icon, targetAmount, currentAmount, deadline
- **password_reset_tokens**: userId, token, expiresAt, createdAt

## Einladungs- und Registrierungslogik
| Typ | Erstellt von | Effekt |
|-----|-------------|--------|
| `new_household` | Superadmin | Registrant bekommt eigenen Haushalt, wird Admin |
| `add_member` | Haushalt-Admin | Registrant tritt dem Haushalt bei |

- Erster User → automatisch superadmin + Haushalt, kein Code nötig
- Alle weiteren User → Einladungscode zwingend
- Admin sieht nur Statistiken, verwaltet keine fremden Haushalte

## Migrations-System
Eigener leichtgewichtiger Runner (`src/utils/migrate.js`):
- Verwaltet eine `_migrations`-Tabelle in der DB
- Liest JS-Files aus `src/migrations/` (alphabetisch sortiert)
- Alle Migrations-SQL verwenden `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`
- Wird automatisch bei Server-Start ausgeführt (vor `app.listen`)

### ⚠️ KRITISCH: Migrations-Signatur
Der Runner übergibt `sequelize` (die Instanz) direkt — **NICHT** `queryInterface`!
```js
// RICHTIG:
module.exports = {
  up: async (sequelize) => {
    await sequelize.query(`ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...`);
  }
};

// FALSCH (crasht den Server → Container-Restart-Loop!):
module.exports = {
  async up(queryInterface, Sequelize) { ... }
};
```

### ⚠️ KRITISCH: Spaltenname in Migrations — immer camelCase mit Anführungszeichen!
Sequelize verwendet **camelCase** Spaltennamen direkt in PostgreSQL (kein `underscored: true`).
Neue Spalten MÜSSEN mit Anführungszeichen in camelCase angelegt werden:
```sql
-- RICHTIG:
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS "recurringEndDate" DATE;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS "isRecurring" BOOLEAN;

-- FALSCH (Spalte existiert, aber Sequelize findet sie nicht → Fehler 500):
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS recurring_end_date DATE;
```
Vorhandene Migrationen (005, 018 etc.) als Referenz nutzen.

## Cron-Jobs (`cronService.js`)
| Zeit | Job |
|------|-----|
| täglich 06:00 | `processRecurringTransactions` — erstellt fällige Kopien wiederkehrender Buchungen |
| alle 6h | `syncAllPaperless` — synchronisiert alle aktiven Paperless-Haushalte |
| 1. jeden Monats 02:00 | `snapshotPreviousMonth` — Snapshot „Fester Saldo" für Vormonat (siehe `fixedBalanceService.js`) |
| 1. jeden Monats 08:00 | `sendMonthlyReports` — HTML-Monatsberichte per E-Mail |
| konfigurierbar | SFTP-Backup (täglich 02:00 / wöchentlich / monatlich) |

## Quittungs-Bildverarbeitung (`receiptProcessor.js`)
Zwei-Pass-Verfahren mit Pixel-Mapping:
1. **Basis:** `rotate` → `resize(1800)` → `greyscale` → `normalize` → PNG-Buffer
2. **Glattes Bild** (für Text): Basis + `linear(1.3, -30)` → raw (1 Kanal via `toColourspace('b-w')`)
3. **Threshold-Maske** (für Hintergrund): Basis + `threshold(165)` → raw (1 Kanal)
4. **Pixel-Mapping:** Maske weiß → rein weiß (Hintergrund); Maske schwarz → glatter Wert (Text mit Graustufen)
5. **Ausgabe:** `jpeg({quality:92})`

- Aufgerufen in `transactions.js` nach Multer-Upload (in-place)
- Aufgerufen in `ocr.js` vor dem Claude-API-Call (als Buffer)
- Ergebnis: Weißer Hintergrund/Rand + lesbarer Text mit Graustufen (nicht binär schwarz)
- **Wichtig:** `resize(1800)` ist nötig für das 5MB Claude Vision API-Limit
- **Wichtig:** `toColourspace('b-w')` erzwingen, da greyscale PNG trotzdem 3 RGB-Kanäle haben kann → sonst 3× zu großes Bild
- **Kein CLAHE im Textbereich** — CLAHE erzeugt Embossing-Artefakte die nur durch Threshold verdeckt werden

## Monatszeitraum (`monthStartDay`)
Pro Haushaltsbuch konfigurierbar (1–28, Default 1). Steuert, ab welchem Tag des Monats der Budget-Monat beginnt — nützlich z.B. wenn das Gehalt am 27. kommt.

### ⚠️ KRITISCH: Period-Label folgt dem End-Monat (nicht dem Start-Monat)!
Bei `monthStartDay > 1` ist der **Label-Monat = Kalendermonat am Ende der Periode**:
- `startDay=27`, Period "April" = **27.03. – 26.04.** (nicht 27.04. – 26.05.!)
- `startDay=27`, 27.03. fällt in Period "April"; 27.04. fällt in Period "Mai"

Begründung: Wer am 27. Gehalt bekommt, versteht den 27.03. intuitiv als Beginn von "April".

### Zentrale Logik: `backend/src/utils/monthBounds.js`
- `getMonthBounds(year, month, startDay)` → `{start, end}` Datumsgrenzen für Period-Label
- `getPeriodForDate(date, startDay)` → `{year, month}` Period zu dem ein Datum gehört
- Beide funktionieren bei `startDay=1` wie früher (Kalendermonat)

### Frontend: Period-Berechnung ist 8× dupliziert (keine zentrale Util!)
Wenn die Logik geändert wird, MÜSSEN alle 8 Stellen synchron angepasst werden:
- `web/src/pages/`: DashboardPage, StatisticsPage, TransactionsPage, BudgetPage, BackupPage
- `mobile/app/(tabs)/`: index.tsx, statistics.tsx, transactions.tsx
- `mobile/app/budget.tsx`

DashboardPage und TransactionsPage verwenden zusätzlich `selectedMonth`/`selectedYear`-State + `prevPeriod`/`nextPeriod`/`getPeriodLabel`-Helfer für die Pfeil-Navigation. Beim Refactor: zuerst zentrale Util in `web/src/utils/period.ts` extrahieren, dann alle 8 Stellen umstellen.

Standard-Pattern:
```ts
const startDay = currentHousehold?.monthStartDay || 1;
let periodMonth = now.getMonth() + 1;
let periodYear = now.getFullYear();
if (startDay > 1 && now.getDate() >= startDay) {
  if (periodMonth === 12) { periodMonth = 1; periodYear += 1; }
  else periodMonth += 1;
}
```

### Alle Statistik-Endpoints folgen dem Period-Schema (seit 2026-05-28)
`/monthly`, `/overview`, `/byPerson`, `/budgets`, `/reports`, `/yearly`, `/wealth`, `/trends`, `/fixed-balance` ordnen Buchungen via `getPeriodForDate()` ihrer Period zu (statt `EXTRACT(MONTH FROM date)`). Konsequenz: Bei `monthStartDay=27` taucht der 27.03. in allen Tabs als „April" auf — konsistent über die ganze App.

Performance-Hinweis: `/yearly` und `/wealth` machen jetzt JS-seitige Aggregation statt SQL `GROUP BY` mit `EXTRACT`. Bei sehr großen Buchungsmengen (>10000 pro Haushalt/Jahr) ggf. später optimieren — aktuell vernachlässigbar.

## Wiederkehrende Buchungen
- `isRecurring: true` → **Template-Buchung** (nur Template, erscheint NICHT in normaler Transaktionsliste)
- `recurringNextDate` = Buchungsdatum beim Erstellen (Cron erstellt ab dann Kopien)
- `recurringInterval`: `weekly` | `monthly` | `yearly`
- `recurringEndDate`: optionales Enddatum — Cron setzt `isRecurring: false` wenn überschritten
- `GET /api/transactions` filtert `isRecurring: true` automatisch aus
- `GET /api/transactions/recurring` + `DELETE /api/transactions/recurring/:id`
- `PUT /api/transactions/:id` akzeptiert `isRecurring` + `recurringInterval` + `recurringEndDate`
- Web: TransactionsPage — eigener Filter-Tab "Wiederkehrend" mit Bearbeiten/Beenden/Verschieben + Enddatum-Spalte
- Mobile: transactions.tsx — eigener Filter-Tab "Wiederkehrend" mit Beenden-Button
- Mobile: add.tsx — Switch + Intervall-Chips + Enddatum-Feld
- **API-Antwort:** `GET /api/transactions/recurring` gibt `{ recurring: [...] }` zurück (nicht direkt Array)
- **POST /api/transactions** legt bei `isRecurring=true` UND Datum ≤ heute zwei Records an: das Template + eine sofortige Buchungskopie für den heutigen Tag. PUT macht das Gleiche beim nachträglichen Aktivieren.

### ⚠️ FormData-Falle bei multipart-Upload (POST /transactions)
Niemals dasselbe FormData-Feld zweimal `append`-en (z.B. einmal generisch im Object.entries-Loop, einmal explizit) — multer liefert es dann als Array. Sequelize crasht beim DATEONLY-Insert mit `["2026-12-31","2026-12-31"]`. Genau dieser Bug verhinderte das direkte Anlegen wiederkehrender Buchungen. Lösung:
- Frontend: explizit jedes Feld einzeln appenden, keine Schleife mit Exclusion-List
- Backend: `firstValue(req.body.feld)` Helper in `transactions.js` normalisiert vorsorglich Array → Skalar
- Backend: Catch-Block gibt jetzt `Fehler: <err.message>` an Client zurück (statt generischem 500), damit solche Bugs künftig sofort sichtbar sind

## Buchungen verschieben
- `PUT /api/transactions/:id/move` — verschiebt Buchung in anderes Haushaltsbuch
- Prüft Zugriff auf Quell- UND Ziel-Haushaltsbuch (User muss Mitglied in beiden sein)
- Benutzerdefinierte Kategorien werden entfernt wenn im Ziel nicht verfügbar
- Web: ArrowRightLeft-Icon bei jeder Buchung, Modal mit Dropdown der eigenen Haushaltsbücher

## Buchungen bearbeiten
- `PUT /api/transactions/:id` — aktualisiert alle Felder inkl. isRecurring/recurringInterval
- Web: Pencil-Icon bei jeder Buchung, befüllt das Erstellen-Formular mit `editingId`

## Eigene Kategorien
- `POST /api/categories` mit `{ name, nameDE, icon, color, householdId }` → legt benutzerdefinierte Kategorie an (`isSystem: false`)
- `GET /api/categories?householdId=` liefert Systemkategorien (global, `householdId=null`) UND haushaltseigene zusammen
- Web: TransactionsPage — „+"-Button neben dem Kategorie-Dropdown im Buchungsformular öffnet Modal (Name, 20 Emoji-Vorschläge + freie Eingabe, 9 Farb-Presets + Color-Picker, Live-Vorschau). Nach dem Anlegen wird Liste refreshed und neue Kategorie automatisch ausgewählt.
- Beim Verschieben einer Buchung in ein anderes Haushaltsbuch werden benutzerdefinierte Kategorien entfernt, die im Ziel nicht existieren (siehe „Buchungen verschieben")

## Duplikat-Check
- `POST /api/transactions/duplicate-check` — prüft auf ähnliche Buchungen (Betrag, Datum, Beschreibung)
- Web: automatischer Check bei Blur auf Betrag/Datum/Beschreibung, Warnung wenn Duplikate gefunden

## Passwort-Reset & -Änderung
- `POST /api/auth/forgot-password` — sendet Reset-E-Mail mit Token (1h gültig)
- `POST /api/auth/reset-password` — setzt Passwort mit Token
- `PUT /api/auth/password` — ändert Passwort (auth required, prüft currentPassword)
- Web: ForgotPasswordPage + ResetPasswordPage + Modal in Layout (User-Menü)
- Mobile: Link auf Login-Seite öffnet Web-URL

## Benutzerverwaltung (ehem. Abonnement-System)
- Das Abo-System (Testabo 31 Tage, Monatsabo, `FAMILY_MODE`) wurde in **v1.0.41 entfernt** (Projektziel Open Source, siehe oben). Alle Konten sind dauerhaft aktiv, solange der Superadmin sie nicht deaktiviert.
- Die DB-Spalten `users.subscriptionType/trialStartedAt/trialEndsAt/subscriptionActive` (Migration 019) existieren noch, sind aber nicht mehr im Modell. Eine DROP-Migration wurde vom Auto-Modus als Datenlöschung blockiert → nur mit ausdrücklicher Zustimmung des Users nachholen.
- Konten, die früher wegen abgelaufenem Testabo deaktiviert wurden, bleiben deaktiviert → in der Administration per Status-Badge reaktivieren.
- **AdminPage:** Spalten Registriert / Rolle / Status / KI-Zugriff. Status-Badge anklickbar zum Umschalten. Admin-Bereich ist für admin/superadmin immer sichtbar (früher in FAMILY_MODE versteckt).
- **Schutz:** Superadmin kann sich nicht selbst deaktivieren (Frontend + Backend)

## Verschlüsselung sensibler Felder (seit v1.0.42)
`utils/encrypt.js` (AES-256-GCM, Format `iv:authTag:data`) über Model-Getter/-Setter für: `Household.anthropicApiKey`, `Household.bankSyncLocalApiKey`, `PaperlessConfig.apiToken`, `BackupConfig.sftpPassword`, `GlobalSettings.anthropicApiKey`, `GlobalSettings.sshPrivateKey`. Schlüssel: `ENCRYPTION_KEY` (64 Hex). **Bis v1.0.41 reichte `docker-compose.yml` den Schlüssel nicht durch → alles lag im Klartext.** Seit v1.0.42: Compose übergibt ihn, `utils/encryptExisting.js` verschlüsselt beim Start vorhandene Klartextwerte (idempotent, `isEncrypted`), ohne Schlüssel Warnung im Log. Neues verschlüsseltes Feld → in `ENCRYPTED_FIELDS` eintragen und **als TEXT anlegen** (verschlüsselt ≈ 2× Klartext + 58 Zeichen; v1.0.42 scheiterte an alten VARCHAR(255)-Spalten → Migration 035 macht sie zu TEXT). Globales Backup per `pg_dump` (siehe „Backup-System") übernimmt die verschlüsselten Rohwerte → Wiederherstellen braucht denselben `ENCRYPTION_KEY`.

## Impressum & Datenschutz (seit v1.0.41)
Betreiberangaben kommen aus der `.env` (`LEGAL_NAME`, `LEGAL_ADDRESS` kommagetrennt, `LEGAL_EMAIL`, optional `LEGAL_HOSTING`, `LEGAL_AUTHORITY`) und werden über `GET /api/config` → `legal` (null wenn `LEGAL_NAME` leer) ausgeliefert, plus `sourceUrl` (AGPL-Quellcode-Link, `SOURCE_URL` oder GitHub-Repo). Web: `hooks/useAppConfig.ts`, `components/LegalOperator.tsx`, Impressum-/DatenschutzPage zeigen ohne Angaben einen Hinweis für Betreiber. **Nie wieder persönliche Daten in den Code schreiben.** Maintainer-Instanz: siehe `CLAUDE.local.md`.

## Backup-System
**Haushalt-Backup:**
- `GET /api/backup/export?householdId=&format=json|csv`
- `POST /api/backup/import` — Duplikaterkennung aktiv

**Admin-Backup (vollständig, seit v1.0.45 per `pg_dump`):**
- `GET/PUT /api/admin/backup/config`, `POST /api/admin/backup/test`, `POST /api/admin/backup/run` (SFTP), `GET /api/admin/backup/download` (direkt herunterladen)
- `POST /api/admin/backup/restore/preview` (Inhaltsverzeichnis via `pg_restore --list`), `POST /api/admin/backup/restore`
- Format: `pg_dump --format=custom --no-owner --no-privileges`, Datei `haushaltsbuch-backup-YYYY-MM-DD.dump` — ALLE Tabellen inkl. `_migrations` und Passwort-Hashes; verschlüsselte Felder bleiben verschlüsselt (gleicher `ENCRYPTION_KEY` nötig).
- Restore: legt vorher Sicherheitskopie `uploads/restore-safety/haushaltsbuch-vor-wiederherstellung-<ts>.dump` an, dann `pg_restore --clean --if-exists --single-transaction --exit-on-error`, danach `migrate()` (ältere Backups kommen auf den aktuellen Schema-Stand).
- Werkzeuge: `postgresql16-client` im Backend-Dockerfile — Major-Version muss zum DB-Image `postgres:16` passen. Beim Upgrade der DB beide zusammen ändern.
- Alte JSON-Backups (bis v1.0.44, nur 8 Tabellen) werden abgelehnt; `exportAllData`/`restoreAllData` sind entfernt.
- Getestet 2026-10-02 end-to-end gegen Wegwerf-Container (frische DB → alle Migrationen → Dump → Daten ändern → Restore → Vergleich). Dabei aufgefallen und behoben: Migration 020 brach auf frischer DB ab (ENUM fehlt) → Neuinstallationen starteten nicht.

## KI-OCR API-Key-Auflösung (3 Stufen)
1. Haushalt eigener Key (`household.aiEnabled && household.anthropicApiKey`)
2. Globaler Admin-Key (`globalSettings.aiKeyPublic` ODER `user.aiKeyGranted`)
3. Server ENV `ANTHROPIC_API_KEY`

API-Key-Validierung: Beim Speichern gegen `claude-haiku-4-5-20251001` getestet.
**Wichtig:** Mobile muss `householdId` beim OCR-Request mitsenden — sonst schlägt Key-Auflösung fehl.

## KI-OCR Prompt-Details
- Modell: `claude-opus-4-6`
- Prompt enthält **aktuelles Datum** (`Heute ist der DD.MM.YYYY`) damit das Modell das Jahr bei Kassenbons korrekt einordnet (z.B. "05.03.26" → 2026, nicht 2025)
- `description`: max. 1–3 Wörter Oberbegriff (z.B. "Lebensmitteleinkauf", "Restaurantbesuch") — keine Artikellisten
- `amount`: wird mit `parseFloat(...).toFixed(2)` ins Eingabefeld geschrieben (immer 2 Dezimalstellen)
- Auto-Upload zu Paperless in `add.tsx`: geschieht nach Transaction-Create wenn Paperless-Felder ausgewählt sind

## Paperless-Integration
- **Sync:** Vollständige Paginierung via `fetchAllPages()`, kein Item-Limit
  - ⚠️ Paperless gibt in `data.next` oft interne URLs zurück (anderer Host/Protokoll) → Host wird auf konfigurierten baseUrl normalisiert
  - Bulk-Upsert via raw SQL `INSERT ... ON CONFLICT (householdId, paperlessId) DO UPDATE SET ...` mit `randomUUID()` für neue IDs
- **Auto-Sync:** Cron alle 6h für alle Haushalte mit aktiver Paperless-Config
- **Favoriten:** `isFavorite`-Flag auf DocumentType, Correspondent, Tag — nur Favoriten im Upload-Dialog
- **Benutzer:** `PaperlessUser`-Tabelle (Migration 006), `isEnabled` toggle
  - ⚠️ `/api/users/` in Paperless erfordert Admin-Token — Fehler werden ignoriert (Sync bricht nicht ab)
  - Deaktivierte Benutzer stehen beim Upload nicht zur Auswahl
- **Duplikatcheck:** `GET /api/paperless/check?householdId=&type=&name=` (case-insensitive, DB-Suche)
- **Erstellen aus UI:** Dokumententypen, Absender, Tags mit Live-Duplikatcheck (350ms Debounce, ✓/⚠)
  - ⚠️ Paperless `?name=` Filter nutzt `icontains` (Teilstring) — beim Erstellen immer exakten Namensvergleich auf `results` machen (`r.name.toLowerCase() === name.trim().toLowerCase()`)
  - Erstellen möglich in Browser (PaperlessPage) und Mobile (paperless-settings.tsx)
- **Upload-Berechtigungen:** `ownerPaperlessUserId` + `viewPaperlessUserIds` → werden als Paperless-Integer-IDs (`paperlessId`) gesendet, nicht als DB-UUIDs
- **`PUT /api/paperless/favorite`:** unterstützt `type`: `doctype` | `correspondent` | `tag` | `user`
  - Für User: `{ type: 'user', id, isEnabled }` statt `isFavorite`
- **Metadata-Vorauswahl:** Nach Upload wird `paperlessMetadata` (JSON) auf der Transaction gespeichert mit `{ documentTypeId, correspondentId, tagIds, ownerPaperlessUserId, viewPaperlessUserIds }` — beim erneuten Öffnen des Upload-Modals wird Vorauswahl wiederhergestellt
- **Upload-Button Sichtbarkeit:** Nur anzeigen wenn Haushalt eine aktive Paperless-Config hat (`hasPaperless`-State aus `paperlessAPI.getConfig`)
- **`paperlessDocId`:** INTEGER in DB (Paperless-interne Dok-ID), NICHT die Task-UUID — wird asynchron im Hintergrund nach erfolgreichem Indexieren gesetzt
- **Unique Constraints** (Migration 007): `(householdId, paperlessId)` auf document_types, correspondents, tags — `Model.upsert()` schlägt fehl → `findOrCreateLocal()`-Hilfsfunktion verwenden

## Offline-Modus (Mobile)
- `mobile/src/services/offlineStore.ts`: **expo-file-system**-basierter Cache + Offline-Queue (kein MMKV!)
- Cache-Keys: `overview_{householdId}_{year}_{month}`, `budgets_{householdId}_{year}_{month}` (seit v1.0.32 pro Monat, Startseite hat Monatsnavigation), `transactions_{householdId}`, `quick_tiles_…`/`quick_all_categories_…` (Schnellerfassung)
- Queue-Key: `offline_tx_queue` — Buchungen ohne Foto werden offline gespeichert
- Auto-Sync: beim App-Start + bei Wechsel in den Vordergrund (`AppState` in `_layout.tsx`)
- `isNetworkError(err)`: `!err.response` → echter Netzwerkfehler (kein `err.response` bei Timeout/Offline)
- Offline-Banner auf Übersicht und Buchungsliste
- Offline-Buchungen erscheinen in der Liste mit Uhr-Icon + "(ausstehend)"

## Haushalt löschen
- `DELETE /api/households/:id` — nur Admin, mindestens 1 anderer Haushalt muss verbleiben
- Kaskadiert: Transactions, Budgets, Categories (non-system), InviteCodes, alle Paperless-Daten, HouseholdMembers
- UI: Löschen-Button nur sichtbar wenn `households.length > 1`

## Fester Saldo (Snapshot-Tracking)
Eigene Tabelle `monthly_fixed_snapshots` (Migration 023) hält pro Haushalt und Monat den „festen Saldo" fest:
- **`fixedIncome`** = Summe der aktuell aktiven wiederkehrenden Einnahmen, monatlich hochgerechnet (weekly × 52/12, yearly ÷ 12).
- **`fixedExpenses`** = analog für Ausgaben.
- **`balance`** = `fixedIncome − fixedExpenses`.

Snapshot-Logik in `backend/src/services/fixedBalanceService.js`:
- `computeFixedBalance(householdId)` → Live-Berechnung aus aktiven Templates.
- `upsertSnapshot(householdId, year, month)` → friert den Wert in der DB ein (`findOrCreate` + Update).
- `snapshotPreviousMonth()` — Cron-Eintrittspunkt am 1. jeden Monats 02:00, iteriert über alle Haushalte.

API:
- `GET /api/statistics/fixed-balance?householdId=` → `{ snapshots: [...], current: {...} }`. `current` ist Live-Hochrechnung des laufenden Monats und wird NICHT automatisch persistiert.
- `POST /api/statistics/fixed-balance/snapshot?householdId=` (Body: `{year?, month?}`) → manuelles Festhalten via Button „Aktuellen Monat festhalten" in der UI.

Frontend: `StatisticsPage` Tab „Fester Saldo" zeigt 3 KPI-Karten (laufender Monat) + LineChart über alle Snapshots (3 Linien: Einnahmen grün, Feste Ausgaben rot, Saldo blau) + Tabelle. Aktueller Monat erscheint mit Sternchen-Marker `*`.

## Statistiken & Dashboard
- **Web-Dashboard:** 4 Karten (Ausgaben, Einnahmen, Bilanz, Sparquote) + Monats-Prognose + Budgetanzeige + Kategorie-Pie-Chart
- **Web-Dashboard:** Pfeil-Navigation im Header (← → + Heute-Button) zum Wechseln der Periode — synchron zu TransactionsPage-Pattern (siehe „Monatszeitraum")
- **Mobile-Übersicht:** Monatsübersicht + Monats-Prognose + Monatsbudget + Top-Kategorie + Kategoriebudgets
- **Statistiken:** 5 Tabs — Monat, Jahr, Trends (Durchschnittsausgaben nach Kategorie), Vermögen (kumulierte Bilanz), Personen (Ausgaben pro Person + Ausgleichsrechnung)
- **`statsAPI.overview(householdId, { month?, year? })`** akzeptiert optional `month`/`year` (Defaults = aktuelle Periode); Response enthält:
  - `thisMonth`, `lastMonth` — Ausgaben aktuelle/vorherige Periode
  - `thisMonthIncome`, `lastMonthIncome` — Einnahmen analog (⚠️ NIEMALS `lastMonth` für Einnahmen-Vormonat verwenden — das ist ein Ausgaben-Wert!)
  - `projectedExpenses`, `projectedRemaining`, `currentDay`, `daysInMonth`
  - `isCurrentPeriod`, `year`, `month` — Frontend nutzt `isCurrentPeriod` um Prognose-Karte für vergangene Monate auszublenden (Hochrechnung macht für abgeschlossene Monate keinen Sinn)
- API: `statsAPI.trends()`, `statsAPI.wealth()`, `statsAPI.byPerson()`

## Sparziele
- `SavingsGoal`: householdId, name, icon, targetAmount, currentAmount, deadline
- CRUD: `GET/POST/PUT/DELETE /api/savings-goals`
- Web: BudgetPage — zweiter Tab "Sparziele" mit Fortschrittsbalken, Einzahlung, Icon-Picker
- Mobile: budget.tsx — Sparziele-Sektion

## Monatsberichte
- `GET /api/reports/monthly?householdId=&year=&month=` — HTML-Report zum Download
- `POST /api/reports/monthly/send` — sendet Report per E-Mail an alle Mitglieder
- Cron: 1. jeden Monats 08:00 — automatischer Versand an alle Haushalte mit `emailReportsEnabled`

## Docker-Volumes (Bind Mounts)
Persistente Daten liegen als Bind Mounts unter `./data/`:
- **`./data/db/`** → PostgreSQL-Daten (`/var/lib/postgresql/data` im Container, UID 70)
- **`./data/uploads/`** → Quittungsbilder (`/app/uploads` im Container)
- `data/` ist in `.gitignore` (wird nicht committed)

## Mobile App (Expo) — Fallstricke
- **Expo SDK 52**, expo-router, Bundle ID `de.bernauer24.haushaltsbuch`
- **Server-Adresse:** nicht fest im Code. Login-Screen hat Feld „Server-Adresse" (`getServerUrl`/`setServerUrl` in `mobile/src/services/api.ts`, SecureStore-Key `server_url`, `https://` wird ergänzt, `/api` hängt der Request-Interceptor an). Vorbelegung pro Build via `EXPO_PUBLIC_API_URL`. Bild-URLs über `getImageBaseUrl()`.
- **Push Notifications:** NICHT aktiviert — `aps-environment` muss aus `.entitlements` entfernt bleiben, `expo-notifications` Plugin darf nicht in `app.json` stehen
- **metro.config.cjs:** Dateiname `.cjs` erzwingen (nicht `.js`) — Biome würde `.js` anfassen und `__dirname` → `import.meta.dirname` umschreiben, was Metro crasht
- **Expo-Module als direkte Abhängigkeiten:** Module, die nur transitiv kommen (z.B. `expo-linking` via expo-router), werden von `use_expo_modules!` nicht gelinkt → Runtime-Crash. Immer explizit in `mobile/package.json` aufnehmen, danach `pod install`.
- Nach nativen Änderungen (app.json, neue native Module): `cd mobile && npx expo prebuild --clean`
- Prüfen, ob neuer Code im Release-Bundle ist: `LC_ALL=C grep -a -c "<neuer Text>" …/main.jsbundle` (Hermes-Bytecode, Strings bleiben lesbar).

## Recherche-Tools
- **Bibliotheken recherchieren:** Immer zuerst **DeepWiki** (`deepwiki.com`) verwenden — funktioniert nur für öffentliche GitHub-Repos
- **Fallback:** Exa, wenn Repo nicht auf DeepWiki verfügbar
- Nach jeder Recherche: Code auf veraltete Versionen prüfen und Upgrade-Empfehlung geben

## Dependency-Status (Stand 2026-04-01)
Minor-Updates eingespielt: `sequelize` 6.37.8, `pg` 8.20.0, `jsonwebtoken` 9.0.3, `axios` 1.14.0, `typescript` 5.8.3
`sharp` bleibt auf **0.33.5** — 0.34.x bricht auf Alpine/musl. Upgrade erst nach Dockerfile-Base-Wechsel (`node:20-alpine` → `node:20`).

**Ausstehende Major-Upgrades** (bewusst zurückgestellt, nächste Session):
| Paket | Von → Auf | Hauptproblem |
|---|---|---|
| `nodemailer` | 6 → 8 | ESM-only, kein `require()` mehr |
| `node-cron` | 3 → 4 | Scheduler-API geändert |
| `express` | 4 → 5 | `path-to-regexp` v8 |
| `tailwindcss` | 3 → 4 | Kein `tailwind.config.js` mehr |
| `react` + `react-router-dom` | 18+v6 → 19+v7 | Zusammen migrieren |
| `recharts` | 2 → 3 | Neue Komponenten-API |
| `@anthropic-ai/sdk` | 0.36 → 0.81 | Changelog prüfen |
| `bcryptjs` | 2 → 3 | ESM/async-first |
| `multer` | 1 (LTS) → 2 | Interne Umstrukturierung |
| `ssh2-sftp-client` | 10 → 12 | Verbindungshandling |
| `vite` | 5 → 6 | Neue Environment API |
| `zustand` | 4 → 5 | Deprecated APIs entfernt |
| `date-fns` | 3 → 4 | Locale-Änderungen |

## Biome + Backend (CJS) — Wichtige Fallstricke
Das Backend ist **CommonJS** (`require`/`module.exports`), Biome/Ultracite ist auf ESM konfiguriert.

### Regel `correctness.noGlobalDirnameFilename`
Biome ersetzt `__dirname` → `import.meta.dirname` als **Safe Fix** (auch ohne `--unsafe`!).
Das macht Node.js die Datei als ESM behandeln → alle `require()` crashen.
**Fix:** In `biome.jsonc` ist ein Override für `backend/**` eingerichtet:
```jsonc
"overrides": [{ "includes": ["backend/**"], "linter": { "rules": { "correctness": { "noGlobalDirnameFilename": "off" } } } }]
```

### lint-staged nur für web/mobile
`package.json` lint-staged läuft nur auf `{web,mobile}/**` und Root-JSON-Dateien.
Backend-JS wird bewusst NICHT von Biome angefasst.

### Nach fehlgeschlagenem Commit: Working Tree aufräumen
Wenn lint-staged abbricht, kann Biome Backend-Dateien im Working Tree modifiziert haben.
Vor dem nächsten Commit prüfen: `grep -r "import\.meta\." backend/` und ggf. `git checkout -- backend/`

## Konten-Feature (seit 2026-05-28, v1.0.1)
Eigene Konten pro Haushaltsbuch (Girokonto, Kreditkarte, Bargeld, Darlehen, ...). Migration 024 legt Tabelle `accounts` an + spaltet `transactions` um `accountId` + `transferTargetAccountId`. Pro Haushalt wird automatisch ein „Hauptkonto" (`type=asset`) angelegt und ALLE bestehenden Buchungen darauf zugeordnet — kein Saldo-Bruch.

**Konto-Typen:**
- `asset` (Aktivkonto: Giro, Spar, Bargeld) — positiver Saldo = Vermögen.
- `liability` (Passivkonto: Kreditkarte, Darlehen, Dispo) — positiver Saldo = offene Schulden.

**Saldo-Berechnung** (Service `routes/accounts.js#computeBalance`): live aus `startingBalance` + Summe der Buchungen. Keine redundante Speicherung. Formel ist gleich für asset/liability; der Typ steuert nur die UI-Färbung.

**Buchungstypen + Konto-Zuordnung:**
- `expense` / `income`: `accountId` = Konto, von/auf das gebucht wird. Wird in Statistiken erfasst.
- `transfer`: `accountId` = Quellkonto, `transferTargetAccountId` = Zielkonto. **Wird in Statistiken AUTOMATISCH ignoriert**, weil alle Statistik-Endpoints explizit nach `type IN ('expense','income')` filtern. So sind Kreditkarten-Tilgungen oder Umbuchungen neutral; nur echte Ausgaben (z.B. Zinsen auf Darlehen → `type=expense`, `accountId=Darlehen`) erscheinen in den Statistiken.
- Der bestehende `targetHouseholdId`-Mechanismus für Haushaltsbuch-zu-Haushaltsbuch-Transfers bleibt parallel erhalten.

**Endpoints:**
- `GET /api/accounts?householdId=` → `{ accounts: [{ id, name, type, icon, color, startingBalance, isActive, sortOrder, balance }, ...] }`
- `POST /api/accounts` — Body: `{ householdId, name, type, icon, color, startingBalance, sortOrder }`
- `PUT /api/accounts/:id` — alle Felder einzeln (Partial-Update).
- `DELETE /api/accounts/:id` — blockt wenn noch Buchungen referenzieren ODER es das letzte Konto im Haushalt wäre.

**Frontend:**
- `web/src/pages/AccountsPage.tsx` — CRUD + Vermögensübersicht (Aktiva/Passiva/Reinvermögen).
- Sidebar-Eintrag „Konten" mit `CreditCard`-Icon.
- TransactionsPage: Konto-Dropdown bei expense/income, zwei Dropdowns (Quelle/Ziel) bei transfer.

**Bekannte offene Punkte:**
- Mobile-App noch nicht angepasst (Iteration 2). Mobile zeigt `accountId`-Felder noch nicht.
- Dashboard zeigt Konto-Saldi noch nicht — wäre eine sinnvolle Karte.
- Recurring-Buchungen (Cron): `processRecurringTransactions` in `cronService.js` übernimmt `accountId` + `transferTargetAccountId` jetzt auf die generierten Kopien. Bestehende wiederkehrende Templates haben durch Migration 024 das Hauptkonto bekommen — neue Templates erben das beim Anlegen aus dem Formular.

## Sub-Konten-Feature (seit 2026-05-29, v1.0.5)
Sammelkonten pro Kategorie (z.B. Spesen). Migration 026 fügt `categories.hasSubAccount` an + erweitert `transactions` um `subAccountPeriodMonth/Year`, `excludeFromStats`, `isSubAccountSettlement`, `affectsAccountBalance`. Neue Tabelle `sub_account_settlements` als Audit-Trail.

**Konzept:**
- Eine Kategorie mit `hasSubAccount=true` ist ein Sammelbecken.
- Buchungen in dieser Kategorie haben `excludeFromStats=true` → tauchen NICHT in Monats-/Jahres-/Trends-Statistiken auf.
- Jede Buchung wird einer Period zugeordnet (`subAccountPeriodMonth/Year`, Default = aktuelle Period gemäß `monthStartDay`).
- Auf `/sub-accounts` sieht der User Salden pro Period.
- Klick auf „Schließen" erzeugt eine **Settlement-Buchung** mit `isSubAccountSettlement=true`, `excludeFromStats=false`, `affectsAccountBalance=false` (virtuell — kein Konto-Saldo bewegt). Diese Buchung erscheint dann in der Statistik als income (Saldo > 0) oder expense (Saldo < 0).
- Settlement kann rückgängig gemacht werden (DELETE-Endpoint).

**Statistik-Filter:** Alle Statistik-Endpoints filtern `excludeFromStats: { [Op.ne]: true }` zusätzlich zum `isRecurring`-Filter. Pattern in `routes/statistics.js` für neue Endpoints beibehalten.

**Konto-Saldo:** `routes/accounts.js#computeBalance` filtert `affectsAccountBalance: { [Op.ne]: false }` — virtuelle Settlements bewegen keinen Konto-Saldo, weil Cash-Flow schon über die Einzelbuchungen lief.

**Endpoints:**
- `GET /api/sub-accounts?householdId=` → `{ subAccounts: [{ category, periods: [{ year, month, income, expense, balance, settledAt? }] }] }`
- `POST /api/sub-accounts/:categoryId/settle` (Body: `{ householdId, year, month, accountId? }`) → erzeugt Settlement + Audit-Eintrag. UNIQUE(householdId, categoryId, year, month) verhindert mehrfaches Schließen.
- `DELETE /api/sub-accounts/:categoryId/settle?year=&month=&householdId=` → macht Schließen rückgängig.
- `POST /api/sub-accounts/:categoryId/backfill` (Body: `{ householdId }`) → ordnet alle bestehenden Buchungen dieser Kategorie nachträglich zu (Period aus Buchungs-Datum via `getPeriodForDate(date, monthStartDay)`, excludeFromStats=true). Idempotent: bereits zugeordnete Buchungen + Settlements werden übersprungen.
- `PUT /api/categories/:id` (Body: `{ hasSubAccount, householdId? }`) → Sub-Konto pro Kategorie an-/abschalten. Funktioniert auch für System-Kategorien.

**Frontend:**
- `web/src/pages/SubAccountsPage.tsx` → Sidebar-Eintrag „Sub-Konten" (Briefcase-Icon).
  - Header-Button „Kategorie als Sub-Konto" öffnet Picker-Modal mit Dropdown aller (noch nicht aktivierten) Kategorien — eigene + System.
  - Pro Sub-Konto-Section: Link „Bestehende einsortieren" triggert Backfill-Endpoint, „Sub-Konto deaktivieren" macht hasSubAccount=false.
- TransactionsPage: Period-Picker erscheint im Buchungs-Formular nur wenn die ausgewählte Kategorie `hasSubAccount=true`. Default = `selectedMonth/Year` aus dem PeriodStore (folgt `monthStartDay`). Layout: `grid grid-cols-2 gap-3` mit `w-full` auf Monat-Dropdown + Jahr-Input.
- Kategorie-Anlegen-Modal: Checkbox „Mit Sub-Konto".

**Pitfalls:**
- Beim PUT/Edit einer Buchung: Wenn die Kategorie GEWECHSELT wird, werden `excludeFromStats` + Period-Felder neu gesetzt (entweder true + Period übernehmen, oder zurück auf normal). Siehe transactions.js PUT-Endpoint.
- Settlement-Buchung hat `type=income` oder `expense` je nach Vorzeichen — wird mit Math.abs(balance) gespeichert, das Vorzeichen kommt aus `type`.
- Bei `affectsAccountBalance=false` darf das Frontend die Buchung trotzdem auflisten — sie ist normal sichtbar, beeinflusst aber keinen Konto-Saldo.

## Versionsnummer
Die App-Version wird in der Sidebar des Webs (Footer, immer sichtbar — auch bei zugeklappter Sidebar) als `v1.0.X` angezeigt — so sieht der User auf einen Blick, welche Version live ist. Aktueller Stand: **v1.0.48** (Stand 2026-10-03). Erstes GitHub-Release: v1.0.21 — Releases nur auf ausdrücklichen Wunsch.

**Quelle der Wahrheit:** `web/src/version.ts` → `APP_VERSION`. **User-Regel:** Bei JEDER Änderung Patch-Stelle um 1 hochzählen (1.0.7 → 1.0.8 → 1.0.9 …), unabhängig vom Umfang. Siehe Memory `feedback_version_bump.md`.

**Synchron halten:** Beim Bump immer alle 5 Stellen anpassen, sonst zeigt UI/Stores eine andere Version als das Bundle:
- `web/src/version.ts`
- `web/package.json`
- `backend/package.json`
- `mobile/package.json`
- `mobile/app.json` (`expo.version` — wichtig für TestFlight/Store-Submissions)

Mobile-App zeigt die Version aktuell noch nicht in der UI (kann später via `Constants.expoConfig?.version` ergänzt werden — z.B. in einem Settings-Screen).

## Kalender-Feature (seit 2026-06-18, v1.0.9)
Kalenderansicht pro Haushaltsbuch — zeigt je Kalendertag (Vergangenheit + Zukunft) die Buchungen sowie den Konto-Saldo am Tagesende. Migration 027 fügt `accounts.startingBalanceDate` (DATE, nullbar) an.

**Stichtag-Saldo (`startingBalanceDate`):** Der eingegebene `startingBalance` ist der Saldo am **Ende des Stichtags** (Tagesabschluss). `accounts.js#computeBalance` filtert `date > startingBalanceDate` (seit v1.0.11 **exklusiv** `Op.gt`, nicht `>=`) — Buchungen am Stichtag selbst UND davor gelten als bereits im Saldo enthalten; nur Buchungen DANACH werden addiert. NULL = alle Buchungen zählen (rückwärtskompatibel). Kalender-Running-Balance konsistent: Event übersprungen wenn `ev.date <= startingBalanceDate`.
- ⚠️ **UX-Falle:** Das Feld hieß ursprünglich „Aktueller Saldo" → User gaben den HEUTIGEN Saldo mit einem VERGANGENEN Stichtag ein, wodurch die Buchungen seither oben drauf addiert wurden (schien „komplett falsch"/verdoppelt). Fix v1.0.11: Labels „Kontostand am Stichtag" / „Stichtag" + Erklärtext + **Live-Vorschau** des resultierenden heutigen Saldos im Modal.
- **Endpoint `GET /api/accounts/:id/net-after?date=`** → `{ netAfter }` (income − expense + transferIn − transferOut für `date > date`). Frontend-Vorschau: `signedStart + netAfter`.

**Daueraufträge-Projektion:** Zukünftige Tage zeigen noch nicht erzeugte wiederkehrende Buchungen als Vorschau (`projected:true`) + projizierten Saldo. Projektion startet exakt bei `recurringNextDate` (reale Cron-Kopien existieren nur davor) → kein Doppelzählen. Logik (`calcNextDate`) ist UTC-basiert in `routes/calendar.js` nachgebaut (identisch zu `cronService.calcNextDate`).

**Endpoint:** `GET /api/calendar?householdId=&year=&month=` (year+month = **Kalendermonat**, unabhängig von `monthStartDay` — ein Kalender zeigt echte Tage). Response: `{ year, month, gridStart, gridEnd, today, accounts:[{id,name,icon,color,type,startingBalance,startingBalanceDate}], days:[{date, day, inMonth, isToday, isFuture, balances:{accId:num}, total, transactions:[...]}] }`. Gitter = Montag der Woche des 1. bis Sonntag der Woche des Letzten. Salden werden kumulativ aus allen realen Buchungen (≤ gridEnd) + projizierten Daueraufträgen berechnet; `total` = Gesamtvermögen (signiert) am Tagesende.

**Frontend:** `web/src/pages/CalendarPage.tsx` → Sidebar-Eintrag „Kalender" (CalendarDays-Icon, zwischen Sub-Konten und Statistiken). Monatsgitter mit Pfeil-Navigation + Heute-Button (eigener `year`/`month`-State, NICHT der periodStore — Kalender ≠ Period). Klick auf Tag → Detail-Panel rechts: Kontostände am Tagesende (je Konto + Gesamt) + Buchungsliste (projizierte gestrichelt markiert „Vorschau"). `calendarAPI.get` in `services/api.ts`.

**Buchung bearbeiten aus dem Kalender (v1.0.12):** Klick auf eine Buchung im Detail-Panel → `setPeriod()` auf die Period des Buchungsdatums (gleiche Logik wie `getPeriodForDate`) + `navigate('/transactions?edit=<id>')`. TransactionsPage liest `?edit=` via `useSearchParams`, sucht die Buchung in der geladenen Period und ruft `openEdit(t)` (Effect wartet auf `loading=false`). Projizierte Dauerauftrag-Vorschauen (id `proj-…`) sind nicht direkt editierbar → Toast-Hinweis auf Tab „Wiederkehrend".

## Betrags-Suche in Buchungen (seit 2026-06-18, v1.0.9)
Das Suchfeld in TransactionsPage durchsucht zusätzlich zum Text (description/merchant) auch den **Betrag**. Backend (`transactions.js` GET /): `amount` wird als Text gecastet und per `iLike '%term%'` gematcht (Komma → Punkt normalisiert, nur wenn Suchterm eine Ziffer enthält) → Teiltreffer wie „12" oder „12,50" funktionieren. Placeholder: „Suchen (Text oder Betrag)...".

## Wichtige Konventionen
- Web-Build: `npm install` (kein `npm ci`, kein Lockfile committed)
- DB-User: `haushalt`, DB-Name: `haushaltsbuch`
- 18 Systemkategorien automatisch geseedet (inkl. "Kredit" 💳) — `seedCategories.js` nutzt `findOrCreate` und läuft bei jedem Server-Start (neue Kategorien werden auch auf bestehenden Installs ergänzt)
- Themes: `feminine` = rosa/hell, `masculine` = dunkelblau
- API-Routes unter `/api/...` (Reverse Proxy → Port 8081 → nginx im web-Container → Backend)
- **Niemals** `sequelize.sync()` in Produktion — nur Migrations-Runner verwenden
- **Migrations-Parameter:** `sequelize` (Instanz), nicht `queryInterface`!
- Paperless: `paperlessId` (Integer) für Paperless-API, `id` (UUID) für interne DB — beim Upload immer `paperlessId` senden
- React Native: Komponenten **nicht** innerhalb anderer Komponenten definieren (`const Foo = () =>`) — führt zu Remount bei jedem Render (Eingabefeld verliert Fokus). Stattdessen Render-Funktion (`const renderFoo = (...)`) verwenden.
- React Native Modal vs Paper Portal: Paper `Portal`/`Modal` bricht `ScrollView` + `maximumZoomScale` auf iOS → für Vollbild-Zoom nativen `Modal as RNModal` aus `react-native` verwenden
- **Tailwind `.input` Klasse:** Hat `@apply px-3` → überschreibt Utility-Klasse `pl-9`. Fix: `style={{ paddingLeft: '2.25rem' }}` inline
- **Button-Klassen:** `.btn-primary` (Primäraktion) + `.btn-secondary` (Abbrechen/Sekundär) — beide passen sich dem Professional-Theme an (`rounded-xl` → `rounded`). Nie hardcoded `rounded-xl` für Buttons verwenden!
- **Sequelize Association-Naming:** `h.HouseholdMembers` (Default), nicht `h.members`
- **Datenmodelle:** `Household` in der DB = "Haushaltsbuch" in der UI (siehe Begriffe-Sektion oben)
- **FormData-Felder:** Niemals dasselbe Feld mehrfach `append`-en — multer macht daraus ein Array, das Sequelize crasht. Backend nutzt `firstValue()` zur Defensive (siehe „Wiederkehrende Buchungen → FormData-Falle").
- **Backend-Errors an Client:** POST/PUT in `transactions.js` geben jetzt die echte Fehlermeldung (`Fehler: <err.message>`) zurück, nicht generisches „Failed to ...". Pattern für andere Routes übernehmen, wenn Fehler-Diagnose schwierig ist.

## Bank-Sync: Hintergrund & Parser (seit 2026-07-28)
Manueller CSV/MT940-Datei-Import von Kontoumsätzen. Getestet mit Sparda-Bank Nürnberg und ING (Christians Banken) — muss aber für beliebige deutsche Banken funktionieren (siehe „Projektziel"). Migration 028 legt `bank_import_profiles` + `merchant_category_mappings` an + `transactions."externalRef"` (Dedup-Hash, partial UNIQUE INDEX auf `(accountId, externalRef)`).

**Architektur-Entscheidung:** Ein direkter FinTS/HBCI-Live-Zugang wurde verworfen — das erfordert eine PSD2-Produktregistrierung bei der Deutschen Kreditwirtschaft (kostenlos, aber ~10–15 Werktage, an Hersteller/Firmen adressiertes Formular), was damals (fälschlich als „privates Projekt" eingeordnet) zu aufwendig erschien. **Seit 2026-10-02 neu zu bewerten:** Für ein öffentliches Open-Source-Projekt ist die Registrierung angemessen (siehe „Projektziel"). Stattdessen: Sparda-Bank Nürnberg bietet im Online-Banking CSV-/MT940-/CAMT.052-Export, ING bietet CSV-Export unter „Umsätze" — beides manuell exportierbar und hochladbar, ohne PIN-Speicherung oder Sidecar-Service.

**Parser (`backend/src/utils/bankImport.js`):**
- **MT940** via npm-Paket `mt940js` (`new mt940js.Parser().parse(text)`), Format-Erkennung: Datei beginnt mit `:20:`.
- **CSV** via npm-Paket `papaparse` (robustes Delimiter/Quoting-Handling für deutsche Bank-Exporte). Spalten-Mapping (Datum/Betrag/Verwendungszweck/Empfänger) wird per Header-Namen automatisch geraten (`suggestMapping`) und vom User im Frontend bestätigt/korrigiert.
- Deutsches Zahlenformat (`1.234,56`) und deutsches Datumsformat (`DD.MM.YYYY`) werden normalisiert.
- Gemeinsame Ausgabe: `{ date, amount, purpose, counterpartyName, counterpartyIban }[]`.

**Aktueller Stand** (Vorschlagsquellen, Abgleich vorhandener Buchungen, Umbuchungen, KI, Paperless, Schnellerfassung, Endpoints) → Abschnitt „Bank-Sync-Feature (v1.0.13–v1.0.31, Migrationen 028–033)“ am Ende. Die frühere ±3-Tage-Warnung `possibleDuplicate` gibt es seit v1.0.23 nicht mehr (ersetzt durch Verschmelzen vorhandener Buchungen).

**Bekannte Einschränkung:** CAMT.052 (von Sparda-Bank Nürnberg ebenfalls angeboten) wird nicht geparst — bewusst nicht umgesetzt, MT940 deckt den Anwendungsfall ab.

## Bank-Sync-Feature (v1.0.13–v1.0.31, Migrationen 028–033)
Kontoumsätze per **CSV/MT940-Datei** importieren (kein FinTS: bräuchte PSD2-Produktregistrierung). Getestet: Sparda-Bank Nürnberg (CSV/MT940), ING (CSV). Web: `BankSyncPage.tsx` (Tabs „Import“ / „Zuordnung & KI“ via `?tab=settings`), Komponenten in `web/src/components/bankSync/`.

**Ablauf:** `POST /api/bank-sync/preview` (Datei → Zeilen mit `alreadyImported` + `suggestion`, `aiStatus`, `paperlessStatus`, `unmatchedQuickEntries`) → User prüft/ändert → `POST /api/bank-sync/import` (JSON, kein erneuter Upload). Der Vorschau-Entwurf liegt in `web/src/store/bankSyncDraftStore.ts` (zustand + sessionStorage, `useDraftState`) und übersteht Seitenwechsel; die `File` lebt nur im Speicher.

**Endpoints (`/api/bank-sync`):** `POST /preview` (multipart), `POST /import`, `GET|PUT /settings`, `POST /settings/test-local` (eigener KI-Server, nur Admins, listet `/models`), `GET|POST /rules`, `PUT|DELETE /rules/:id`, `GET /quick-entries`, `PUT /quick-entries/:id/dismiss` („Bar bezahlt“), `POST /bootstrap-mappings`, `DELETE /imported?householdId&accountId` (löscht auch nur-Ziel-Umbuchungen, löst sonst `transferExternalRef`). Außerdem `GET|PUT /api/transactions/quick-categories` und `GET /api/paperless/data/:hid` liefert `baseUrl` für Dokument-Links.

**Dedup:** `externalRef` = SHA-256(Datum|Betrag|Verwendungszweck|Gegenkonto-Name). Bei Umbuchungen zusätzlich `transferExternalRef` (Ziel-Seite). `findImported(accountId, ref)` prüft beide. Parser-Änderungen ändern den Hash → vorher „Importierte Buchungen löschen“ (Wartung). ⚠️ `description`/`merchant` sind VARCHAR(255) → kürzen, voller Text in `note`. IBAN (`counterpartyIban`, MT940 `?31`) fließt NICHT in den Hash.

**Vorschlagsquellen (Reihenfolge, `bankCategorizer.js` + `routes/bankSync.js#buildSuggestions`):**
1. **Vorhandene Buchung** (`loadMatchCandidates`/`matchExistingEntries`): externalRef NULL, keine Dauerauftrags-Vorlage, Konto gleich oder NULL (App-Buchungen haben kein Konto); Betrag ±0,01, Datum ±5 Tage (`recurringSourceId` → ±7); 1:1 nach Datumsabstand. Source `quick` (pendingBankMatch) oder `existing`. Beim Import **verschmolzen**, **Bankdatum und Bankbetrag gelten immer** (User-Entscheidung 2026-10-01), Kategorie/Beschreibung bleiben. Umbuchungen: `entrySide(entry, accountId)` → out/in.
   - **Späte Abbuchung** (v1.0.48, Migration 036): Spesen-/Rechnungsausgaben werden oft Wochen später abgebucht (Zahlungsziel, PayPal, Klarna). Fenster nach vorne pro Kategorie: `households."bankSyncLateMatchDays"` JSON `{categoryId: Tage}` (bewusst pro Haushaltsbuch, nicht an der Kategorie — Systemkategorien sind global). Ohne Eintrag: Sub-Konto-Kategorien `SUB_ACCOUNT_LATE_MATCH_DAYS = 45`, sonst normales Fenster; 0 = aus. Nur nach vorne (`matchWindow`: before = ±5/7, after = max(base, late)). Treffer außerhalb des normalen Fensters → `matchLate` + `matchDistanceDays`, Badge „spät · N Tage". UI: Bank-Sync → Zuordnung & KI → „Späte Abbuchung" (`GET|PUT /settings` → `lateMatchDays`).
   - **Von Hand verknüpfen:** Preview liefert `openEntries` (offene Ausgaben/Einnahmen, 180 Tage zurück, Betrag ±max(2 €, 10 %)), Frontend bietet sie pro Zeile an („🔗 Mit offener Buchung verknüpfen", `RowEdit.manualMatchId`). Toleranz-Formel in `bankSync.js#manualMatchTolerance` und `BankSyncPage.tsx` synchron halten. `findMergeTarget` lehnt Buchungen anderer Konten ab.
   - **Sub-Konto-Monat:** Die Period hängt an der Ausgabe, nicht an der Abbuchung. Beim Verschmelzen bleibt die gespeicherte Period (sonst Period des ursprünglichen Buchungsdatums, `mergedSubAccountFields`); Kategorie weg vom Sub-Konto → Felder zurücksetzen. Vorschau zeigt Monatswähler für Sub-Konto-Kategorien, Vorgabe: verknüpfte Buchung → Paperless-Dokumentdatum → Bankdatum (`defaultPeriod`); Request-Felder `subAccountPeriodMonth/Year`.
   - **Geschlossene Monate:** Preview liefert `settledPeriods`, Zeilen mit Saldo-Änderung in einem geschlossenen Monat zeigen einen Hinweis; `/import` antwortet mit `settledWarnings` (`touchedSettledPeriods`) → Hinweis „Abschluss rückgängig machen und neu schließen" mit Link auf `/sub-accounts`. Kein automatisches Neu-Schließen.
2. **Eigene IBAN** (`accounts.iban`) → Umbuchung (source `account`).
3. **Regeln** (`bank_categorization_rules`: field any|counterparty|purpose|iban, contains, min/maxAmount → `categoryId` ODER `targetAccountId`).
4. **Gelernt** (`merchant_category_mappings`: `categoryId` ODER `targetAccountId`, plus `description`). Schlüssel aus `utils/merchantLearning.js` (seit v1.0.38, Migration 034): **Händler|Betrag** (`"spotify ab|-10.99"`, vorzeichenrichtig, mit Beschreibung, hat Vorrang) und **Händler** (nur Kategorie). **Zahlungsdienstleister** (PayPal, Klarna, Amazon Payments, …) werden nie selbst als Händler gelernt: echter Händler aus dem Verwendungszweck („Ihr Einkauf bei …", `PP.1234.PP . X`); ohne Treffer nur Betrags-Schlüssel mit Dienstleister-Name. Gelernt wird beim Import bei source quick/existing/ai/manual (Paperless-Titel nicht als Beschreibung) und im PUT-Hook in transactions.js. `POST /bootstrap-mappings` lernt Händler (häufigste Kategorie) + Händler|Betrag ab 2 Buchungen (häufigste eigene Beschreibung via `customDescription`) und löscht alte reine Dienstleister-Mappings.
5. **KI** (opt-in pro Haushaltsbuch, `households.bankSync*`): Claude (Default `claude-haiku-4-5`, structured outputs via `output_config.format` über SDK 0.36.3 — Body-Passthrough funktioniert; Sonnet/Opus 5.5 mit `effort: low` + `fallbacks: "default"`) oder **eigener OpenAI-kompatibler Server** (`bankSyncLocalUrl/Model/ApiKey`, nur Admins, `json_schema` mit Fallback ohne `response_format`, Chunks à 25, 5 min Timeout). Nur Betrag/Empfänger/Verwendungszweck/Kategorienamen gehen raus.
Zusätzlich **Paperless-Dokument** (`paperlessMatcher.js`): liefert nur Beschreibung (Titel) + `paperlessDocId`. Treffer nur mit Dokumentdatum im Fenster [−45, +5 Tage] UND (Bestellnummer `\w+-\d{3,}-\d{3,}` im Dokument ODER Betrag/Kunden-/Mandatsnummer + Absender-Match). Absender-Match = erstes aussagekräftiges Wort des Korrespondenten (Stopwortliste: europe, deutschland, payments, gmbh …). ⚠️ Lehren aus dem Praxistest: reine Betragstreffer und Referenzen ohne Datumsfenster lieferten Lotterie-Übersichten bzw. alte Kontoauszüge als Beschreibung.

**Timeouts:** Vorschau kann mit KI Minuten dauern → axios-Timeout 30 min für `/bank-sync/preview` + eigener nginx-`location` mit `proxy_read_timeout 1800s` (`web/nginx.conf`).

**Schnellerfassung (Mobile, `mobile/app/quick-add.tsx`):** natives Modal (`presentation: "modal"`) → ⚠️ Paper-`Portal`/`Modal` rendern DAHINTER, nur React-Native-`<Modal>` verwenden. Legt Buchung mit `pendingBankMatch=true` an (auch Offline-Queue). Kacheln: `GET/PUT /api/transactions/quick-categories` (pro Mitglied in `household_members.quickCategories` JSON `{expense:[],income:[]}`, max. 11; ohne eigene Auswahl Top-7 der letzten 90 Tage nur aus Handbuchungen).


