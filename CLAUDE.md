# Haushaltsbuch – Claude Code Instructions

## Projektübersicht
Budget-App für Haushalte mit Web, Mobile (iOS/Android) und KI-OCR-Quittungsanalyse.
- **GitHub:** https://github.com/boernie77/haushaltsbuch (privat)
- **Produktion:** https://haushalt.bernauer24.com (Hetzner VPS 37.27.193.27)
- **Deployment:** Docker Compose, manueller Deploy via GitHub Actions (`workflow_dispatch`)

## Stack
| Bereich | Technologie |
|---------|-------------|
| Backend | Node.js/Express, Sequelize ORM, PostgreSQL |
| Web | React + Vite + Tailwind CSS, React Router v6, Recharts |
| Mobile | React Native + Expo, expo-router, react-native-paper, Zustand |
| Auth | JWT (30 Tage), bcryptjs |
| KI/OCR | Anthropic Claude API (`claude-opus-4-6`) |
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
│       ├── migrations/             Migrationsfiles (001-initial, 002-backup, 003-invite-type)
│       ├── routes/                 Express-Router (auth, households, transactions, admin, backup, ocr, …)
│       ├── services/
│       │   ├── backupService.js    Export/Import/SFTP-Upload/runGlobalBackup
│       │   └── cronService.js      Cron-Job für automatische Backups
│       ├── middleware/auth.js      JWT + Role Guards
│       └── utils/
│           ├── migrate.js          Migrations-Runner (_migrations-Tabelle)
│           └── seedCategories.js   17 Systemkategorien
├── web/
│   └── src/
│       ├── pages/                  Alle Seiten
│       ├── services/api.ts         Axios-Wrapper (transactionAPI, householdAPI, adminAPI, backupAPI, ocrAPI, …)
│       ├── store/authStore.ts      Zustand Store
│       └── components/Layout.tsx  Sidebar + Household-Switcher
├── mobile/
│   ├── app/                        expo-router Screens
│   └── src/
│       ├── services/api.ts         Mobile Axios-Wrapper
│       ├── store/authStore.ts      Zustand + SecureStore
│       └── themes/index.ts         Feminine/Masculine Themes
├── docker-compose.yml
├── CLAUDE.md
└── .github/workflows/deploy.yml   Manueller SSH-Deploy (workflow_dispatch)
```

## Datenmodelle
- **User**: id, name, email, password, role (superadmin/admin/member), theme (feminine/masculine), aiKeyGranted
- **Household**: id, name, currency, monthlyBudget, budgetWarningAt, anthropicApiKey, aiEnabled, adminUserId
- **HouseholdMember**: householdId, userId, role (admin/member/viewer)
- **Transaction**: amount, description, date, type (expense/income), categoryId, householdId, userId, receiptImage, merchant, tags
- **Category**: name, nameDE, icon, color, isSystem, householdId (null = global Systemkategorie)
- **Budget**: householdId, categoryId, limitAmount, month, year, warningAt
- **GlobalSettings**: id='global', anthropicApiKey, aiKeyPublic (single-row)
- **InviteCode**: code, **type** (new_household|add_member), householdId, role, useCount, maxUses, expiresAt
- **BackupConfig**: sftpHost, sftpPort, sftpUser, sftpPassword, sftpPath, schedule, scheduleLabel, isActive, lastRunAt, lastRunStatus
- **PaperlessConfig/DocumentType/Correspondent/Tag**: householdId-basiert

## Einladungs- und Registrierungslogik
Zwei Arten von Einladungscodes:

| Typ | Erstellt von | Wo | Effekt bei Registrierung |
|-----|-------------|-----|--------------------------|
| `new_household` | Superadmin | Admin → Einladungen | Registrant bekommt eigenen neuen Haushalt, wird dessen Admin |
| `add_member` | Haushalt-Admin | Haushalt → Einladen | Registrant tritt dem Haushalt als Mitglied bei |

- **Erster User:** wird automatisch superadmin + eigener Haushalt, kein Code nötig
- **Alle weiteren User:** Einladungscode zwingend erforderlich
- Admin verwaltet **keine** fremden Haushalte — sieht nur Statistiken (Anzahl Haushalte/Mitglieder)

## Migrations-System
Eigener leichtgewichtiger Runner (`src/utils/migrate.js`):
- Verwaltet eine `_migrations`-Tabelle in der DB
- Liest JS-Files aus `src/migrations/` (alphabetisch sortiert)
- Alle Migrations-SQL verwenden `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` → sicher auf bestehenden DBs
- Wird automatisch bei Server-Start ausgeführt (vor `app.listen`)
- Für neue DB-Änderungen: neues File in `src/migrations/` anlegen, niemals `sync()` verwenden

## Backup-System
**Haushalt-Backup** (jeder Nutzer für seinen Haushalt):
- `GET /api/backup/export?householdId=&format=json|csv` — Download
- `POST /api/backup/import` — Upload JSON/CSV, Duplikaterkennung aktiv
- Web: HouseholdPage → Datensicherung-Sektion

**Admin-Backup** (globales SFTP-Backup):
- `GET/PUT /api/admin/backup/config` — SFTP-Konfiguration
- `POST /api/admin/backup/test` — Verbindungstest
- `POST /api/admin/backup/run` — Sofortiges Backup
- Cron-Zeitpläne: täglich (02:00), wöchentlich (So), monatlich (1.)
- Backup-Format: alle Tabellen als JSON, gzip-komprimiert
- Web: AdminPage → Backup-Tab

## KI-OCR API-Key-Auflösung (3 Stufen)
1. Haushalt eigener Key (`household.aiEnabled && household.anthropicApiKey`)
2. Globaler Admin-Key (`globalSettings.aiKeyPublic` ODER `user.aiKeyGranted`)
3. Server ENV `ANTHROPIC_API_KEY`

API-Key-Validierung: Beim Speichern wird gegen `claude-haiku-4-5-20251001` getestet (max_tokens: 5).

## Deployment
```bash
# Manuell via GitHub Actions (Actions → Deploy to Hetzner VPS → Run workflow)
# Deploy-Script führt automatisch aus:
#   1. git pull
#   2. docker-compose build --no-cache
#   3. docker-compose up -d
#   4. node src/utils/migrate.js   ← Migrationen
#   5. seedSystemCategories()

# Direkt auf VPS:
ssh -i ~/.ssh/emailrelay_vps root@37.27.193.27
cd /opt/haushaltsbuch && git pull && docker-compose up -d --build
```

## Wichtige Konventionen
- VPS verwendet `docker-compose` (mit Bindestrich, nicht Plugin `docker compose`)
- SSH-Key für VPS: `~/.ssh/emailrelay_vps`
- Web-Build: `npm install` (kein `npm ci`, kein Lockfile committed)
- Backend ENV auf VPS: `/opt/haushaltsbuch/.env`
- DB-User: `haushalt`, DB-Name: `haushaltsbuch`
- 17 Systemkategorien automatisch geseedet
- Themes: `feminine` = rosa/hell, `masculine` = dunkelblau
- API-Routes unter `/api/...` (Caddy → Port 8081 → nginx → Backend Port 3001)
- **Niemals** `sequelize.sync()` in Produktion — nur Migrations-Runner verwenden
