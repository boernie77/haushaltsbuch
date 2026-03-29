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
| Reverse Proxy | Caddy (SSL, Port 8081) |

## Verzeichnisstruktur
```
/
├── backend/          Node.js API (Port 3000 intern)
│   └── src/
│       ├── models/index.js       Alle Sequelize-Modelle
│       ├── routes/               Express-Router
│       ├── middleware/auth.js    JWT + Role Guards
│       └── utils/seedCategories.js
├── web/              React/Vite Web-App (Build → nginx Port 80)
│   └── src/
│       ├── pages/                Alle Seiten
│       ├── services/api.ts       Axios-Wrapper
│       ├── store/authStore.ts    Zustand Store
│       └── components/Layout.tsx Sidebar + Household-Switcher
├── mobile/           Expo React Native App
│   ├── app/          expo-router Screens
│   └── src/
│       ├── services/api.ts       Mobile Axios-Wrapper
│       ├── store/authStore.ts    Zustand + SecureStore
│       └── themes/index.ts       Feminine/Masculine Themes
├── docker-compose.yml
└── .github/workflows/deploy.yml  Manueller SSH-Deploy
```

## Datenmodelle (wichtigste Felder)
- **User**: id, name, email, password, role (superadmin/admin/member), theme (feminine/masculine), aiKeyGranted
- **Household**: id, name, currency, monthlyBudget, budgetWarningAt, anthropicApiKey, aiEnabled
- **HouseholdMember**: householdId, userId, role (admin/member/viewer)
- **Transaction**: amount, description, date, type (expense/income), categoryId, householdId, userId, receiptImage, merchant
- **Category**: name, nameDE, icon, color, isSystem, householdId (null = global)
- **GlobalSettings**: id='global', anthropicApiKey, aiKeyPublic (single-row)
- **Budget**: householdId, categoryId, limitAmount, month, year, warningAt
- **PaperlessConfig**: householdId, baseUrl, apiToken

## KI-OCR API-Key-Auflösung (3 Stufen)
1. Haushalt eigener Key (`household.aiEnabled && household.anthropicApiKey`)
2. Globaler Admin-Key (`globalSettings.aiKeyPublic` ODER `user.aiKeyGranted`)
3. Server ENV `ANTHROPIC_API_KEY`

## Deployment
```bash
# Manuell via GitHub Actions (Actions → deploy → Run workflow)
# Oder direkt auf VPS:
ssh root@37.27.193.27
cd /opt/haushaltsbuch
git pull
docker-compose up -d --build
```

## Wichtige Konventionen
- VPS verwendet `docker-compose` (mit Bindestrich, nicht Plugin-Form)
- Web-Build: `npm install` (kein `npm ci`, kein Lockfile committed)
- Backend ENV auf VPS: `/opt/haushaltsbuch/.env`
- 17 Systemkategorien werden beim ersten Start automatisch geseedet
- Themes: `feminine` = rosa/hell, `masculine` = dunkelblau
- Alle API-Routes unter `/api/...` (Caddy proxied zu Port 8081 → nginx → /api zu Backend Port 3001)

## API-Key-Validierung
Beim Speichern eines neuen Anthropic-Keys wird er gegen `claude-haiku-4-5-20251001` getestet (max_tokens: 5). Ungültige Keys werden nicht gespeichert.
