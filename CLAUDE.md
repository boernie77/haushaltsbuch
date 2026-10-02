# Haushaltsbuch – Claude Code Instructions

## Projektübersicht
Budget-App für Haushalte mit Web, Mobile (iOS/Android) und KI-OCR-Quittungsanalyse.
- **GitHub:** https://github.com/boernie77/haushaltsbuch (privat)
- **Produktion:** https://haushalt.bernauer24.com (Hetzner VPS VPS-IP-ENTFERNT)
- **Deployment:** Docker Compose, **automatischer Deploy bei jedem Push auf `main`** via GitHub Actions

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
│       ├── migrations/             001-initial … 034-merchant-mapping-description
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
| **Haushaltsbuch** | Ein Budget-Buch innerhalb eines Haushalts. Ein User kann mehrere haben (z.B. "Unser Haushalt" + "Christian Privat"). | `Household` |

⚠️ **KRITISCH:** NIEMALS Daten zwischen verschiedenen Haushalten (Personengruppen) verschieben oder teilen! Verschiebungen von Buchungen sind NUR zwischen den eigenen Haushaltsbüchern des angemeldeten Users erlaubt.

## Datenmodelle
- **User**: id, name, email, password, role (superadmin/admin/member), theme (feminine/masculine), aiKeyGranted, `subscriptionType` (trial|monthly|null), `trialStartedAt`, `trialEndsAt`, `subscriptionActive`
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
- Registrierung mit Einladungscode startet automatisch 31-tägiges Testabo (→ Abonnement-System)

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
| täglich 07:00 | `deactivateExpiredTrials` — deaktiviert Konten mit abgelaufenem Testabo |
| täglich 07:30 | `sendTrialExpiryReminders` — E-Mail-Erinnerung 5 Tage + 2 Tage vor Testabo-Ablauf |
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

## Abonnement-System
- **Testabo:** Startet automatisch bei Registrierung mit Einladungscode (31 Tage)
  - `subscriptionType = 'trial'`, `trialStartedAt = now`, `trialEndsAt = now + 31d`
  - Superadmin (erster User) bekommt kein Testabo
- **Ablauf:** Login prüft Ablauf + deaktiviert Konto automatisch; Cron 07:00 räumt auf
- **Erinnerungen:** Cron 07:30 schickt E-Mail 5 Tage + 2 Tage vor Ablauf
- **Monatsabo:** Superadmin setzt `subscriptionActive = true` → Konto bleibt aktiv, reaktiviert falls deaktiviert
- **API:** `PUT /api/admin/users/:id/subscription` — `{ subscriptionActive: bool }`
- **AdminPage:** Spalte "Registriert / Testabo" zeigt Registrierungsdatum + Restlaufzeit (grau → orange ≤5d → rot ≤2d)
  - Status-Badge und Abo-Badge sind direkt anklickbar zum Umschalten
- **Schutz:** Superadmin kann sich nicht selbst deaktivieren (Frontend + Backend)

## Backup-System
**Haushalt-Backup:**
- `GET /api/backup/export?householdId=&format=json|csv`
- `POST /api/backup/import` — Duplikaterkennung aktiv

**Admin-Backup (SFTP):**
- `GET/PUT /api/admin/backup/config`, `POST /api/admin/backup/test`, `POST /api/admin/backup/run`
- Format: alle Tabellen als JSON, gzip-komprimiert

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

## E-Mail-Konfiguration
- **SMTP:** smtp.strato.de, Port 465 (SSL)
- **User:** christian@bernauer24.com
- **Absender:** noreply@bernauer24.com (Strato-Alias)
- **Verwendet für:** Passwort-Reset-E-Mails, Monatsberichte, Testabo-Ablauf-Erinnerungen
- ENV-Variablen: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`

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
- Auf dem VPS: `/opt/haushaltsbuch/data/db/` und `/opt/haushaltsbuch/data/uploads/`

## Deployment
```bash
# Automatisch bei push auf main (GitHub Actions)
# Manuell: Actions → Deploy to Hetzner VPS → Run workflow

# Deploy-Script:
#   1. git pull
#   2. docker-compose build --no-cache
#   3. docker-compose up -d
#   4. node src/utils/migrate.js
#   5. seedSystemCategories()

# Direkt auf VPS (SSH-Key-Setup ggf. neu — siehe unten):
ssh root@VPS-IP-ENTFERNT
cd /opt/haushaltsbuch && git pull && docker-compose up -d --build
```

### Deploy-Verifikation (ohne SSH-Zugang)
- `index.html`-Last-Modified prüfen: `curl -s -I https://haushalt.bernauer24.com/ | grep last-modified`
- Bundle-Hash prüfen: `curl -s https://haushalt.bernauer24.com/ | grep -oE "index-[A-Za-z0-9]+\.js"` (ändert sich bei jedem Vite-Build)
- Neue Code-Strings im Bundle suchen: `curl -s https://haushalt.bernauer24.com/assets/index-XXXX.js | grep -oE "neuerString"`
- Seit v1.0.39 liefert `web/nginx.conf` `index.html` mit `Cache-Control: no-cache` (Bundles unter `/assets/` mit `immutable`) → neue Versionen erscheinen beim normalen Neuladen. Wer noch eine vor v1.0.39 gecachte `index.html` hat, braucht einmalig einen Hard-Reload (`Strg+Shift+R` / `Cmd+Shift+R`).

### ⚠️ OIDC-Schutz beim Deploy
Vor jedem Deploy prüfen, dass `backend/src/routes/oidc.js`, `LoginPage.tsx`, `docker-compose.yml` (OIDC_*-Env-Vars) und `.github/workflows/deploy.yml` (set_env OIDC_*) nicht versehentlich angefasst wurden. SSO via Authentik bricht sonst.

### SSH-Status (Stand 2026-08-30, neuer Mac)
- Aktiv: `~/.ssh/emailrelay_vps` (ED25519) — funktioniert direkt als root auf dem großen VPS, kein sshpass nötig. `~/.ssh/id_rsa` geht ebenfalls als Fallback.
- `~/.ssh/id_ed25519` existiert auf diesem Mac **nicht** (frühere Doku-Referenz veraltet).
- Alternativ Deploy via `git push origin main` (GitHub Actions hat eigenen Key in Secret `HETZNER_SSH_KEY`); VPS-Inspektion via curl auf Public-URL

## iOS Mobile App
- **Expo SDK 52**, expo-router
- **Bundle ID:** `de.bernauer24.haushaltsbuch`
- **Apple Development Team:** APPLE-TEAM-ID (Stand 2026-09-30 im Xcode-Projekt; früher APPLE-TEAM-ID)
- **Gerät:** „Christians Iphone 15pro“, UDID `GERAETE-UDID-ENTFERNT` — muss für Build/Install **entsperrt** sein
- **Signing:** Automatic (Xcode verwaltet Provisioning Profile)
- **Testgerät:** Physisches iPhone, App läuft als **Release-Build** (kein Metro!)
- **Push Notifications:** NICHT aktiviert — `aps-environment` muss aus `.entitlements` entfernt bleiben, `expo-notifications` Plugin darf nicht in `app.json` stehen
- **API-URL:** `https://haushalt.bernauer24.com/api` (in `mobile/src/services/api.ts`). Kein Fallback auf IP-Adressen — Domainname erzwingen!
- **metro.config.cjs:** Dateiname `.cjs` erzwingen (nicht `.js`) — Biome würde `.js` anfassen und `__dirname` → `import.meta.dirname` umschreiben, was Metro crasht

### iOS neu bauen (nach JS-Änderungen):
1. **⇧⌘K** — Clean Build Folder
2. **⌘R** — Build & Run

Oder per CLI (funktioniert, ~5–10 min):
```bash
cd mobile/ios
xcodebuild -workspace Haushaltsbuch.xcworkspace -scheme Haushaltsbuch -configuration Release \
  -destination "id=GERAETE-UDID-ENTFERNT" -derivedDataPath build -allowProvisioningUpdates clean build
xcrun devicectl device install app --device GERAETE-UDID-ENTFERNT build/Build/Products/Release-iphoneos/Haushaltsbuch.app
xcrun devicectl device process launch --device GERAETE-UDID-ENTFERNT de.bernauer24.haushaltsbuch
```
Prüfen, ob neuer Code drin ist: `LC_ALL=C grep -a -c "<neuer Text>" build/Build/Products/Release-iphoneos/Haushaltsbuch.app/main.jsbundle` (Hermes-Bytecode, Strings bleiben lesbar).

### iOS Rebuild nach nativen Änderungen (app.json, neue native Module):
```bash
cd mobile && expo prebuild --clean
# Danach in Xcode: Team + Bundle ID prüfen, dann bauen
```

### Expo-Module als direkte Abhängigkeiten
Expo-Module die nur transitive Dependencies sind (via expo-router etc.) werden von `use_expo_modules!` im Podfile **nicht** gelinkt → native Module fehlen → Runtime-Crash.
Immer explizit in `mobile/package.json` aufnehmen und danach `pod install` ausführen:
- `expo-linking` — muss direkte Dep sein, auch wenn expo-router es mitbringt

### pod install Reihenfolge
```bash
cd mobile/ios && pod install
# Danach in Xcode: ⌘R (KEIN erneutes ⇧⌘K nötig)
```

## VPS-Wartung
- **Docker-Disk-Cleanup:** `docker system prune -af --volumes=false` — entfernt ungenutzte Images/Container. Docker overlay2 kann sich auf 50+ GB ansammeln wenn viele Deploys stattfanden.
- Disk prüfen: `df -h /`
- Bei vollem Disk: PostgreSQL schreibt keine Checkpoints mehr → DB-Container unhealthy → Backend-Fehler 500

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
Die App-Version wird in der Sidebar des Webs (Footer, immer sichtbar — auch bei zugeklappter Sidebar) als `v1.0.X` angezeigt — so sieht der User auf einen Blick, welche Version live ist. Aktueller Stand: **v1.0.40** (Stand 2026-10-02). Erstes GitHub-Release: v1.0.21 — Releases nur auf ausdrücklichen Wunsch.

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
- Hauptrepo-VPS verwendet `docker-compose` (mit Bindestrich, nicht Plugin `docker compose`)
- haushaltsbuch-home auf VPS verwendet `docker compose` (Plugin-Variante — anderer Stack!)
- SSH-Key für VPS: `~/.ssh/emailrelay_vps` (funktioniert direkt, kein sshpass nötig; `~/.ssh/id_rsa` als Fallback)
- Web-Build: `npm install` (kein `npm ci`, kein Lockfile committed)
- Backend ENV auf VPS: `/opt/haushaltsbuch/.env`
- DB-User: `haushalt`, DB-Name: `haushaltsbuch`
- 18 Systemkategorien automatisch geseedet (inkl. "Kredit" 💳) — `seedCategories.js` nutzt `findOrCreate` und läuft bei jedem Server-Start (neue Kategorien werden auch auf bestehenden Installs ergänzt)
- Themes: `feminine` = rosa/hell, `masculine` = dunkelblau
- API-Routes unter `/api/...` (Caddy → Port 8081 → nginx → Backend Port 3001)
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
Manueller CSV/MT940-Datei-Import von Kontoumsätzen für Sparda-Bank Nürnberg und ING. Rein privat für Christian selbst (kein SaaS-Ziel, siehe Memory `project_commercial_intent.md`). Migration 028 legt `bank_import_profiles` + `merchant_category_mappings` an + `transactions."externalRef"` (Dedup-Hash, partial UNIQUE INDEX auf `(accountId, externalRef)`).

**Architektur-Entscheidung:** Ein direkter FinTS/HBCI-Live-Zugang wurde verworfen — das erfordert eine PSD2-Produktregistrierung bei der Deutschen Kreditwirtschaft (kostenlos, aber ~10–15 Werktage, an Hersteller/Firmen adressiertes Formular), was für ein privates Projekt zu aufwendig ist. Stattdessen: Sparda-Bank Nürnberg bietet im Online-Banking CSV-/MT940-/CAMT.052-Export, ING bietet CSV-Export unter „Umsätze" — beides manuell exportierbar und hochladbar, ohne PIN-Speicherung oder Sidecar-Service.

**Parser (`backend/src/utils/bankImport.js`):**
- **MT940** via npm-Paket `mt940js` (`new mt940js.Parser().parse(text)`), Format-Erkennung: Datei beginnt mit `:20:`.
- **CSV** via npm-Paket `papaparse` (robustes Delimiter/Quoting-Handling für deutsche Bank-Exporte). Spalten-Mapping (Datum/Betrag/Verwendungszweck/Empfänger) wird per Header-Namen automatisch geraten (`suggestMapping`) und vom User im Frontend bestätigt/korrigiert.
- Deutsches Zahlenformat (`1.234,56`) und deutsches Datumsformat (`DD.MM.YYYY`) werden normalisiert.
- Gemeinsame Ausgabe: `{ date, amount, purpose, counterpartyName, counterpartyIban }[]`.

**Aktueller Stand** (Vorschlagsquellen, Abgleich vorhandener Buchungen, Umbuchungen, KI, Paperless, Schnellerfassung, Endpoints) → Abschnitt „Bank-Sync-Feature (v1.0.13–v1.0.31, Migrationen 028–033)“ am Ende. Die frühere ±3-Tage-Warnung `possibleDuplicate` gibt es seit v1.0.23 nicht mehr (ersetzt durch Verschmelzen vorhandener Buchungen).

**Bekannte Einschränkung:** CAMT.052 (von Sparda-Bank Nürnberg ebenfalls angeboten) wird nicht geparst — bewusst nicht umgesetzt, MT940 deckt den Anwendungsfall ab.

## Session-Notizen 2026-10-02 (v1.0.38–v1.0.40)
- **v1.0.38: Lernen über Händler + Betrag, PayPal & Co. über den echten Händler** (Details: Bank-Sync-Feature → Vorschlagsquelle 4 „Gelernt"). Anlass: Vorher wurde nur über den Empfängernamen gelernt → jede PayPal-Zahlung bekam die zuletzt bestätigte Kategorie. Neu: `utils/merchantLearning.js`, Migration 034 (`merchant_category_mappings.description`), Badge „Gelernt · wiederkehrend" in der Vorschau. „Aus bestehenden Buchungen lernen" wurde danach in Produktion ausgeführt (User-Bestätigung: hat geklappt).
  - Muster für den echten Händler (`REAL_MERCHANT_PATTERNS`) sind aus typischen PayPal-Texten abgeleitet, nicht aus echten Exporten. Taucht PayPal trotzdem als „? bitte zuordnen" ohne „wiederkehrend" auf → Verwendungszweck-Beispiel holen und Muster anpassen.
- **v1.0.39: `index.html` mit `Cache-Control: no-cache`** (`web/nginx.conf`), `/assets/` mit `immutable`. Vorher zeigte der Browser nach Deploys die alte Version. Ab jetzt reicht normales Neuladen.
- Werkzeug-Hinweise: Lokal kein Docker-Zugriff (Socket-Rechte) und keine `node_modules` in `web/` → `tsc`/Biome laufen hier nicht. In diesem Repo ist kein `git user.email` gesetzt → Commits mit `git -c user.name=boernie77 -c user.email=115419572+boernie77@users.noreply.github.com commit …`. Direkte Lese-Abfragen auf die Produktions-DB per SSH wurden vom Auto-Modus blockiert → Daten-Checks über die UI/API machen oder den User fragen.
- Beim Warten auf den Deploy immer per `gh run list --commit <sha>` auf den eigenen Commit warten — `--limit 1` direkt nach dem Push zeigt oft noch den vorherigen Lauf.
- **v1.0.40:** nur Doku-Stand (CLAUDE.md-Session-Notizen).

## Session-Notizen 2026-09-30 / 2026-10-01 (v1.0.17–v1.0.32)
- Bank-Sync stark ausgebaut (siehe „Bank-Sync-Feature (v1.0.13–v1.0.31 …)“): Schnellerfassung (Mobile), Regeln, KI (Claude oder eigener OpenAI-kompatibler Server), Paperless-Abgleich (inkl. Bestellnummern), Verschmelzen vorhandener Buchungen mit Bankdatum, Umbuchungen beidseitig, IBAN bei Konten, Vorschau-Entwurf übersteht Seitenwechsel.
- Mobile: Schnellerfassung mit eigenen Kacheln (v1.0.17/19/21), Monatsnavigation auf der Startseite (v1.0.32).
- Anleitung (ANLEITUNG.md + HelpPage) um Kapitel 15 Bank-Import und 16 Schnellerfassung ergänzt (v1.0.31).
- Erstes GitHub-Release v1.0.21. Releases künftig nur auf ausdrücklichen Wunsch.
- Praxistest-Lehren Paperless-Abgleich: reine Betragstreffer → Fehlzuordnungen (Lotterie-Übersichten); Referenzen ohne Datumsfenster → alte Kontoauszüge als Beschreibung. Beides behoben (v1.0.28, v1.0.30).
- Kreditkarte: Anbieter bietet online CSV → kein PDF-Import nötig.

## Session-Notizen 2026-07-28
- Bank-Sync (siehe „Bank-Sync: Hintergrund & Parser“) — **zwei Anläufe in derselben Session:**
  1. Erster Entwurf: FinTS/HBCI-Live-Sync über Python-Sidecar (`fints-service/`, FastAPI + `python-fints`, TAN-Flow via `pause_dialog()`/`deconstruct()`). Wurde komplett gebaut, dann verworfen, nachdem klar wurde, dass die PSD2-Produktregistrierung (~10-15 Werktage, Formular an Hersteller/Firmen adressiert) für ein privates Projekt zu aufwendig ist.
  2. Zweiter Entwurf (umgesetzt): manueller CSV/MT940-Datei-Upload, kein Produkt-ID/PIN/Sidecar nötig. `fints-service/` gelöscht, `docker-compose.yml` zurückgesetzt, Migration 028 umgeschrieben (`bank_import_profiles` statt `bank_connections`). `Transaction.externalRef` + `MerchantCategoryMapping` aus dem ersten Entwurf blieben unverändert bestehen.
  - **Lektion:** Bei Bank-Integrationen immer zuerst prüfen, ob die Bank strukturierten Datei-Export (CSV/MT940/CAMT.052) anbietet, bevor ein FinTS/HBCI-Live-Zugang samt PSD2-Registrierung geplant wird — für Privatnutzer meist der pragmatischere Weg.
- Nachträgliche Härtung vor Deploy: Fuzzy-Duplikat-Erkennung (`possibleDuplicate`) gegen manuell erfasste Buchungen ergänzt (der ursprüngliche `externalRef`-Dedup erkannte nur bereits importierte, nicht handisch eingetippte Buchungen). `/import` läuft jetzt JSON-basiert mit Zeilen aus `/preview` statt erneutem Datei-Upload, damit einzelne Zeilen per Checkbox ausgeschlossen werden können. Zusätzlich `POST /api/bank-sync/bootstrap-mappings` — lernt einmalig rückwirkend aus bestehenden manuell kategorisierten Buchungen (häufigste Kategorie pro Merchant), nicht nur vorwärts ab dem ersten Import.
- Projektkontext geändert: App wird aktuell nur noch privat für Christian weiterentwickelt, kein 1000+-Haushalte-SaaS-Ziel mehr (siehe Memory `project_commercial_intent.md`, aktualisiert).

## Session-Notizen 2026-06-18
- **v1.0.9:** **Kalender-Feature** (siehe Section oben). Migration 027 (`accounts.startingBalanceDate`), neue Route `/api/calendar`, neue Seite `CalendarPage` (Sidebar „Kalender", CalendarDays-Icon). Daueraufträge werden in die Zukunft projiziert; `computeBalance` respektiert jetzt `startingBalanceDate`.
- **v1.0.9:** **Betrags-Suche** — Suchfeld in TransactionsPage matcht zusätzlich den Betrag (amount-Cast → iLike, Komma→Punkt). Backend-only Filter im GET `/api/transactions`.
- **v1.0.10:** **In-App-Anleitung** — neue Seite `HelpPage.tsx` (Sidebar „Anleitung", BookOpen-Icon, Route `/help`), Inhaltsverzeichnis + 14 Sektionen, inhaltlich synchron zu `ANLEITUNG.md` (Repo-Root). Bewusst als JSX gepflegt (kein Markdown-Renderer). **Fix Betrags-Suche:** `sequelize.col("amount")` war mehrdeutig (TransactionSplit-Include „splits" hat auch `amount`) → ganze Suche brach ab. Jetzt `Transaction.amount` qualifiziert.
- **v1.0.11:** **Stichtag-Saldo-Fix** (siehe Kalender-Section). `Op.gte` → `Op.gt` (Tagesabschluss-Semantik), klarere Labels „Kontostand am Stichtag"/„Stichtag", Erklärtext, **Live-Vorschau** via neuem Endpoint `GET /api/accounts/:id/net-after`. Ursache der User-Verwirrung: heutiger Saldo mit vergangenem Stichtag eingegeben → spätere Buchungen addiert.
- **v1.0.12:** **Buchung aus Kalender bearbeiten** — Klick auf Buchung im Detail-Panel → `setPeriod()` (Period des Buchungsdatums) + `navigate('/transactions?edit=<id>')`. TransactionsPage liest `?edit=` (`useSearchParams`), findet Buchung in geladener Period, ruft `openEdit` (Effect wartet auf `loading=false`). Projizierte Vorschauen (`proj-…`) nicht editierbar → Toast.

## Session-Notizen 2026-05-29
- **v1.0.2:** Period bleibt session-übergreifend bei Seitenwechsel erhalten — neuer `web/src/store/periodStore.ts` (Memory, nicht localStorage) + `web/src/hooks/usePeriod.ts` kapselt `selectedMonth/Year` + `prev/next/reset/Label`. DashboardPage, TransactionsPage, StatisticsPage, BudgetPage nutzen den Hook; 4-fache Period-Duplizierung im Web ist damit weg (Mobile hat noch 4 eigene Stellen). Letztes Haushaltsbuch wird im `localStorage` unter `last_household_id` gemerkt — `authStore.setCurrentHousehold` schreibt es, `loadStoredAuth`/`login`/`register` lesen es als initialen Wert.
- **v1.0.3:** Klick auf Stift-Icon in der Buchungsliste scrollt automatisch zum Bearbeitungs-Formular oben (formRef + `scrollIntoView({behavior: 'smooth', block: 'start'})` — `window.scrollTo` wirkt NICHT, weil `<main>` der echte Scroll-Container ist).
- **v1.0.4:** Kategorie-Filter in der Buchungsliste — Dropdown neben den Type-Filtern + X-Button zum Zurücksetzen. Backend akzeptierte `categoryId` schon, nur Frontend fehlte. Treffer-Summen-Zeile erscheint jetzt auch bei aktivem Kategorie-Filter (vorher nur bei Suchwort).
- **v1.0.5:** **Sub-Konten-Feature** (großer Brocken, siehe Section oben). Migration 026 + neue Route `/api/sub-accounts` + neue Seite `SubAccountsPage` mit Briefcase-Icon. Alle Statistik-Endpoints filtern jetzt zusätzlich `excludeFromStats: { Op.ne: true }`; `accounts.computeBalance` filtert `affectsAccountBalance: { Op.ne: false }` für virtuelle Settlement-Buchungen.
- **v1.0.6:** Bestehende Kategorie als Sub-Konto aktivieren — Picker-Modal auf SubAccountsPage mit Dropdown aller noch nicht aktivierten Kategorien. Nutzt vorhandenen PUT-Endpoint `/api/categories/:id`.
- **v1.0.7:** Bulk-Backfill — neuer Endpoint `POST /api/sub-accounts/:categoryId/backfill` ordnet alle bestehenden Buchungen einer Sub-Konto-Kategorie nachträglich der Period zu (Period aus Buchungs-Datum via `getPeriodForDate(date, monthStartDay)`). Idempotent — bereits zugeordnete Buchungen + Settlements werden übersprungen. UI: Link „Bestehende einsortieren" pro Sub-Konto-Section.
- **v1.0.8:** Sub-Konto Period-Picker Layout-Fix — `grid grid-cols-2 gap-3` mit `w-full` auf Monat-Dropdown + Jahr-Input statt vorher `flex-1`+`w-24`. Vorher kollabierte das Monatsfeld in der breiten `md:col-span-2`-Spalte.
- **Versionsregel:** User möchte bei JEDER Änderung Patch-Stelle +1. Siehe Memory `feedback_version_bump.md`.
- **Toaster-Position:** Von `top-right` auf `bottom-right` umgestellt (kollidierte mit „Neue Buchung"-Button oben rechts).
- **AccountsPage Vorzeichen-Konvention:** Saldi werden vorzeichenrichtig gespeichert (Schulden = negativ). Migration 025 normalisiert bestehende positive Liability-Salden. Display ist eine einzige Regel: `balance < 0` = rot, `≥ 0` = grün. Im Anlegen-Modal fragt das Liability-Konto nach „Aktuelle Schulden" (positiv) und speichert intern als negativ.
- **Statistik-Endpoints folgen jetzt alle dem `monthStartDay`-Period-Schema** (`/yearly`, `/wealth`, `/trends`, `/fixed-balance`) — vorher waren `/yearly` und `/wealth` bewusst Kalender-basiert via `EXTRACT(MONTH FROM date)`. JS-seitige Aggregation via `getPeriodForDate()`.
- **Fester Saldo-Feature:** Migration 023 (`monthly_fixed_snapshots`), `fixedBalanceService.js`, Cron 1. jeden Monats 02:00 friert Vormonats-Period ein, neuer Tab „Fester Saldo" in StatisticsPage.
- **Konten-Feature (v1.0.1):** Migration 024 + AccountsPage + Konto-Auswahl im Buchungs-Formular. Transfer zwischen eigenen Konten ist neutral in Statistiken.

## Session-Notizen 2026-05-28
- Feature: Spaltenkopf Datum/Betrag in TransactionsPage klickbar zum Sortieren (lokal, kein Reload). Default bleibt Datum absteigend
- Feature: Summen-Karten oberhalb der Wiederkehrend-Tabelle (Ausgaben/Einnahmen/Saldo, monatlich hochgerechnet — weekly × 52/12, yearly ÷ 12)
- Feature: Treffer-Summen-Zeile bei aktivem Suchfeld in TransactionsPage (Anzahl + Ausgaben + Einnahmen + Saldo, respektiert Type-Filter)
- Feature: Fester Saldo — neue Migration 023 (`monthly_fixed_snapshots`), `fixedBalanceService.js`, Cron 1. jeden Monats 02:00 friert Vormonats-Period ein, Endpoint `/api/statistics/fixed-balance`, neuer Tab "Fester Saldo" in StatisticsPage (KPI-Karten + LineChart + Tabelle + Button "Aktuellen Monat festhalten")
- Fix: ALLE Statistik-Endpoints folgen jetzt dem `monthStartDay`-Period-Schema (`/yearly`, `/wealth`, `/trends`, `/fixed-balance`). Vorher waren `/yearly` und `/wealth` bewusst Kalender-basiert via `EXTRACT(MONTH FROM date)`. JS-seitige Aggregation via `getPeriodForDate()`; bei sehr großen Haushalten (>10000 Buchungen/Jahr) ggf. später optimieren
- CLAUDE.md: alter Hinweis "yearly/wealth bewusst Kalender" entfernt, neue Doku zu Fester Saldo + Cron-Tabelle aktualisiert

## Session-Notizen 2026-04-28
- Bug behoben: Wiederkehrende Buchung direkt anlegen schlug fehl wegen doppeltem `recurringEndDate` in FormData → multer-Array → Sequelize-Crash
- Bug behoben: Dashboard-„Vormonat"-Zeile bei Einnahmen zeigte fälschlich `lastMonth` (Ausgaben) → jetzt `lastMonthIncome`
- Feature: Eigene Kategorien anlegen via „+"-Button neben Kategorie-Dropdown im Buchungsformular
- Feature: Pfeil-Navigation auf Dashboard (← →, Heute-Button), `statsAPI.overview` akzeptiert `month`/`year`, Prognose-Karte nur für laufenden Monat
- SSH-Key zum VPS: `~/.ssh/emailrelay_vps` funktioniert direkt (`ssh -i ~/.ssh/emailrelay_vps root@VPS-IP-ENTFERNT`) — Stand 2026-04-28 war hier `~/.ssh/id_ed25519` genannt, der auf dem aktuellen Mac nicht existiert
- haushaltsbuch-home mit Hauptrepo synchronisiert (alle Fixes seit 2026-04-05 portiert, inkl. OIDC)
- haushaltsbuch-home auf VPS deployed: https://money.bernauer24.com (Port 8481, `/opt/haushaltsbuch-home/`)
- `/api/config` gibt jetzt `oidcEnabled` zurück; SSO-Button nur sichtbar wenn OIDC konfiguriert
- Migration 020 (Professional Themes) im haushaltsbuch-home safe gemacht: No-Op wenn kein ENUM existiert

## haushaltsbuch-home (Self-Hosting-Fork)
- **GitHub:** https://github.com/boernie77/haushaltsbuch-home (öffentlich)
- **Produktion:** https://money.bernauer24.com (gleicher Hetzner VPS, Port 8481)
- **Pfad auf VPS:** `/opt/haushaltsbuch-home/`, ENV: `/opt/haushaltsbuch-home/.env`
- **Docker:** `docker compose` (Plugin — VPS nutzt hier Plugin-Variante, nicht `docker-compose`!)
- **Images:** `ghcr.io/boernie77/haushaltsbuch-home-backend:latest` + `web:latest`
- **Build:** GitHub Actions bei push auf main → ghcr.io; Watchtower zieht täglich
- **FAMILY_MODE=true** fest im Dockerfile eingebaut — kein Trial, alle User dauerhaft aktiv
- **OIDC:** optional (nur wenn OIDC_ISSUER_URL/CLIENT_ID/SECRET gesetzt), SSO-Button versteckt sich sonst
- **theme-Spalte:** VARCHAR (kein PostgreSQL ENUM) → Migration 020 ist No-Op auf Frisch-Install

## Bank-Sync-Feature (v1.0.13–v1.0.31, Migrationen 028–033)
Kontoumsätze per **CSV/MT940-Datei** importieren (kein FinTS: bräuchte PSD2-Produktregistrierung). Getestet: Sparda-Bank Nürnberg (CSV/MT940), ING (CSV). Web: `BankSyncPage.tsx` (Tabs „Import“ / „Zuordnung & KI“ via `?tab=settings`), Komponenten in `web/src/components/bankSync/`.

**Ablauf:** `POST /api/bank-sync/preview` (Datei → Zeilen mit `alreadyImported` + `suggestion`, `aiStatus`, `paperlessStatus`, `unmatchedQuickEntries`) → User prüft/ändert → `POST /api/bank-sync/import` (JSON, kein erneuter Upload). Der Vorschau-Entwurf liegt in `web/src/store/bankSyncDraftStore.ts` (zustand + sessionStorage, `useDraftState`) und übersteht Seitenwechsel; die `File` lebt nur im Speicher.

**Endpoints (`/api/bank-sync`):** `POST /preview` (multipart), `POST /import`, `GET|PUT /settings`, `POST /settings/test-local` (eigener KI-Server, nur Admins, listet `/models`), `GET|POST /rules`, `PUT|DELETE /rules/:id`, `GET /quick-entries`, `PUT /quick-entries/:id/dismiss` („Bar bezahlt“), `POST /bootstrap-mappings`, `DELETE /imported?householdId&accountId` (löscht auch nur-Ziel-Umbuchungen, löst sonst `transferExternalRef`). Außerdem `GET|PUT /api/transactions/quick-categories` und `GET /api/paperless/data/:hid` liefert `baseUrl` für Dokument-Links.

**Dedup:** `externalRef` = SHA-256(Datum|Betrag|Verwendungszweck|Gegenkonto-Name). Bei Umbuchungen zusätzlich `transferExternalRef` (Ziel-Seite). `findImported(accountId, ref)` prüft beide. Parser-Änderungen ändern den Hash → vorher „Importierte Buchungen löschen“ (Wartung). ⚠️ `description`/`merchant` sind VARCHAR(255) → kürzen, voller Text in `note`. IBAN (`counterpartyIban`, MT940 `?31`) fließt NICHT in den Hash.

**Vorschlagsquellen (Reihenfolge, `bankCategorizer.js` + `routes/bankSync.js#buildSuggestions`):**
1. **Vorhandene Buchung** (`loadMatchCandidates`/`matchExistingEntries`): externalRef NULL, keine Dauerauftrags-Vorlage, Konto gleich oder NULL (App-Buchungen haben kein Konto); Betrag ±0,01, Datum ±5 Tage (`recurringSourceId` → ±7); 1:1 nach Datumsabstand. Source `quick` (pendingBankMatch) oder `existing`. Beim Import **verschmolzen**, **Bankdatum gilt immer** (User-Entscheidung 2026-10-01), Kategorie/Beschreibung bleiben. Umbuchungen: `entrySide(entry, accountId)` → out/in.
2. **Eigene IBAN** (`accounts.iban`) → Umbuchung (source `account`).
3. **Regeln** (`bank_categorization_rules`: field any|counterparty|purpose|iban, contains, min/maxAmount → `categoryId` ODER `targetAccountId`).
4. **Gelernt** (`merchant_category_mappings`: `categoryId` ODER `targetAccountId`, plus `description`). Schlüssel aus `utils/merchantLearning.js` (seit v1.0.38, Migration 034): **Händler|Betrag** (`"spotify ab|-10.99"`, vorzeichenrichtig, mit Beschreibung, hat Vorrang) und **Händler** (nur Kategorie). **Zahlungsdienstleister** (PayPal, Klarna, Amazon Payments, …) werden nie selbst als Händler gelernt: echter Händler aus dem Verwendungszweck („Ihr Einkauf bei …", `PP.1234.PP . X`); ohne Treffer nur Betrags-Schlüssel mit Dienstleister-Name. Gelernt wird beim Import bei source quick/existing/ai/manual (Paperless-Titel nicht als Beschreibung) und im PUT-Hook in transactions.js. `POST /bootstrap-mappings` lernt Händler (häufigste Kategorie) + Händler|Betrag ab 2 Buchungen (häufigste eigene Beschreibung via `customDescription`) und löscht alte reine Dienstleister-Mappings.
5. **KI** (opt-in pro Haushaltsbuch, `households.bankSync*`): Claude (Default `claude-haiku-4-5`, structured outputs via `output_config.format` über SDK 0.36.3 — Body-Passthrough funktioniert; Sonnet/Opus 5.5 mit `effort: low` + `fallbacks: "default"`) oder **eigener OpenAI-kompatibler Server** (`bankSyncLocalUrl/Model/ApiKey`, nur Admins, `json_schema` mit Fallback ohne `response_format`, Chunks à 25, 5 min Timeout). Nur Betrag/Empfänger/Verwendungszweck/Kategorienamen gehen raus.
Zusätzlich **Paperless-Dokument** (`paperlessMatcher.js`): liefert nur Beschreibung (Titel) + `paperlessDocId`. Treffer nur mit Dokumentdatum im Fenster [−45, +5 Tage] UND (Bestellnummer `\w+-\d{3,}-\d{3,}` im Dokument ODER Betrag/Kunden-/Mandatsnummer + Absender-Match). Absender-Match = erstes aussagekräftiges Wort des Korrespondenten (Stopwortliste: europe, deutschland, payments, gmbh …). ⚠️ Lehren aus dem Praxistest: reine Betragstreffer und Referenzen ohne Datumsfenster lieferten Lotterie-Übersichten bzw. alte Kontoauszüge als Beschreibung.

**Timeouts:** Vorschau kann mit KI Minuten dauern → axios-Timeout 30 min für `/bank-sync/preview` + eigener nginx-`location` mit `proxy_read_timeout 1800s` (`web/nginx.conf`).

**Schnellerfassung (Mobile, `mobile/app/quick-add.tsx`):** natives Modal (`presentation: "modal"`) → ⚠️ Paper-`Portal`/`Modal` rendern DAHINTER, nur React-Native-`<Modal>` verwenden. Legt Buchung mit `pendingBankMatch=true` an (auch Offline-Queue). Kacheln: `GET/PUT /api/transactions/quick-categories` (pro Mitglied in `household_members.quickCategories` JSON `{expense:[],income:[]}`, max. 11; ohne eigene Auswahl Top-7 der letzten 90 Tage nur aus Handbuchungen).

**Paperless-Seite (Christians Instanz):** Tika (gepinnt 3.2.2.0, 4.x → 406) + Gotenberg + Mail-Regeln für Amazon-/PayPal-Mails als .eml; Paperless-AI auf Unraid setzte Datum auf 01.01. (Prompt angepasst). Details in `~/Projekte/Paperless_Admin/CLAUDE.md`.

