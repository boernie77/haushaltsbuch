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
│       ├── migrations/             001-initial … 021-recurring-end-date,
│       │                           022-oidc-subject
│       ├── routes/                 Express-Router (auth, households, transactions, admin, backup, ocr, paperless, …)
│       ├── services/
│       │   ├── backupService.js    Export/Import/SFTP-Upload/runGlobalBackup
│       │   └── cronService.js      Cron: Backup + Wiederkehrende Buchungen + Paperless-Auto-Sync
│       ├── middleware/auth.js      JWT + Role Guards
│       └── utils/
│           ├── migrate.js          Migrations-Runner (_migrations-Tabelle)
│           ├── receiptProcessor.js Sharp-Pipeline (B&W Dokumenten-Scan-Filter)
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
- Cache-Keys: `overview_{householdId}`, `budgets_{householdId}`, `transactions_{householdId}`
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
- ⚠️ Vor Klage „der Fix ist nicht da": Browser-Hard-Reload (`Strg+Shift+R` / `Cmd+Shift+R`) ist Pflicht — das Production-`index.html` hat zwar dynamische Bundle-Hashes, aber die HTML selbst kann gecacht werden.

### ⚠️ OIDC-Schutz beim Deploy
Vor jedem Deploy prüfen, dass `backend/src/routes/oidc.js`, `LoginPage.tsx`, `docker-compose.yml` (OIDC_*-Env-Vars) und `.github/workflows/deploy.yml` (set_env OIDC_*) nicht versehentlich angefasst wurden. SSO via Authentik bricht sonst.

### SSH-Status (Stand 2026-04-28)
- Alter Key `~/.ssh/emailrelay_vps` ist auf dem aktuellen Dev-Rechner **nicht mehr vorhanden** (Neuinstallation von `~/.ssh/`)
- Aktiv: `~/.ssh/id_ed25519` — muss noch in `/root/.ssh/authorized_keys` auf dem VPS eingetragen werden (via Hetzner Cloud Console, https://console.hetzner.cloud)
- Bis dahin: Deploy nur via `git push origin main` (GitHub Actions hat eigenen Key in Secret `HETZNER_SSH_KEY`); VPS-Inspektion via curl auf Public-URL

## iOS Mobile App
- **Expo SDK 52**, expo-router
- **Bundle ID:** `de.bernauer24.haushaltsbuch`
- **Apple Development Team:** APPLE-TEAM-ID (Persönliches Team)
- **Signing:** Automatic (Xcode verwaltet Provisioning Profile)
- **Testgerät:** Physisches iPhone, App läuft als **Release-Build** (kein Metro!)
- **Push Notifications:** NICHT aktiviert — `aps-environment` muss aus `.entitlements` entfernt bleiben, `expo-notifications` Plugin darf nicht in `app.json` stehen
- **API-URL:** `https://haushalt.bernauer24.com/api` (in `mobile/src/services/api.ts`). Kein Fallback auf IP-Adressen — Domainname erzwingen!
- **metro.config.cjs:** Dateiname `.cjs` erzwingen (nicht `.js`) — Biome würde `.js` anfassen und `__dirname` → `import.meta.dirname` umschreiben, was Metro crasht

### iOS neu bauen (nach JS-Änderungen):
1. **⇧⌘K** — Clean Build Folder
2. **⌘R** — Build & Run

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

## Wichtige Konventionen
- Hauptrepo-VPS verwendet `docker-compose` (mit Bindestrich, nicht Plugin `docker compose`)
- haushaltsbuch-home auf VPS verwendet `docker compose` (Plugin-Variante — anderer Stack!)
- SSH-Key für VPS: `~/.ssh/id_ed25519` (funktioniert direkt, kein sshpass nötig)
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
- SSH-Key zum VPS: `~/.ssh/id_ed25519` funktioniert direkt (`ssh root@VPS-IP-ENTFERNT`)
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
