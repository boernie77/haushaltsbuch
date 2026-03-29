# 💰 Haushaltsbuch

Ein modernes Haushaltstagebuch mit mobilen Apps (iOS/Android), Desktop-Web-App, KI-gestützter Quittungsanalyse und Paperless-ngx Integration.

## Features

### Kernfunktionen
- 📊 **Statistiken**: Monats- & Jahresausgaben, Kategorienübersicht, Tagesverlauf
- 🗂️ **17 Kategorien**: Lebensmittel, Restaurant, Transport, Gesundheit, Kleidung, Haushalt, Unterhaltung, Sport, Bildung, Urlaub, Elektronik, Kinder, Schönheit, Versicherungen, Sparen, Einnahmen, Sonstiges
- 📷 **KI-Quittungsanalyse**: Foto aufnehmen → Betrag & Kategorie werden automatisch erkannt (Claude AI)
- 💳 **Budget-Management**: Monats- & Kategoriebudgets mit Warnschwellen (z.B. bei 80%)
- 🏠 **Mehrere Haushalte**: Geteilte Familienbücher + private Bücher
- 👥 **Mehrbenutzerverwaltung**: Admin, Mitglied, Betrachter

### Paperless-ngx Integration
- 🔗 Verbindung zu eigenem Paperless-Server
- 📄 Quittungen automatisch in Paperless archivieren
- 🏷️ Dokumententypen, Korrespondenten und Tags verwalten & auswählen
- 🔄 Synchronisation mit vorhandenen Paperless-Daten

### Design & Themes
- 🌸 **Feminines Design**: Rosa/Blush-Töne, abgerundete Ecken
- 💙 **Maskulines Design**: Dark Mode, Blau/Slate-Töne

### Plattformen
- 📱 iOS App (React Native + Expo)
- 📱 Android App (React Native + Expo)
- 💻 Web-App / Desktop (React + Vite, läuft im Browser)

## Architektur

```
haushaltsbuch/
├── backend/          # Node.js/Express REST API
│   ├── src/
│   │   ├── models/       # Sequelize/PostgreSQL Modelle
│   │   ├── routes/       # API Routen
│   │   ├── middleware/   # JWT Auth
│   │   ├── services/     # Budget-Service
│   │   └── utils/        # Kategorie-Seeder
│   └── Dockerfile
├── mobile/           # React Native + Expo (iOS & Android)
│   ├── app/
│   │   ├── (auth)/       # Login, Registrierung
│   │   └── (tabs)/       # Übersicht, Buchungen, Hinzufügen, Statistiken, Einstellungen
│   └── src/
│       ├── themes/       # Feminines & Maskulines Theme
│       ├── store/        # Zustand (Zustand)
│       └── services/     # API-Client
├── web/              # React + Vite Desktop-App
│   ├── src/
│   │   ├── pages/        # Dashboard, Buchungen, Statistiken, Budget, Haushalt, Paperless, Admin
│   │   ├── components/   # Layout, Sidebar
│   │   ├── store/        # Auth Store
│   │   └── services/     # API-Client
│   └── Dockerfile
└── docker-compose.yml
```

## Schnellstart

### 1. Repository klonen
```bash
git clone https://github.com/boernie77/haushaltsbuch.git
cd haushaltsbuch
```

### 2. Umgebungsvariablen
```bash
cp .env.example .env
# .env mit eigenen Werten anpassen
```

### 3. Mit Docker starten
```bash
docker compose up -d
```

Die Web-App ist dann unter **http://localhost:8080** erreichbar.

### 4. Erster Start
- Öffne http://localhost:8080
- Registriere den ersten Benutzer → wird automatisch **Superadmin**
- Ein Standard-Haushalt wird automatisch erstellt

## Konfiguration

### Wichtige .env Variablen

| Variable | Beschreibung |
|----------|--------------|
| `DB_PASSWORD` | PostgreSQL Passwort |
| `JWT_SECRET` | Geheimer JWT Schlüssel (min. 32 Zeichen) |
| `ANTHROPIC_API_KEY` | Claude API Key für OCR (https://console.anthropic.com) |
| `ALLOWED_ORIGINS` | Erlaubte Ursprünge (Komma-getrennt) |

### Anthropic API Key (für KI-Quittungsanalyse)
1. Account bei https://console.anthropic.com erstellen
2. API Key generieren
3. In `.env` als `ANTHROPIC_API_KEY` eintragen

### Paperless-ngx verbinden
1. In der App/Web unter **Paperless** navigieren
2. URL deines Paperless-Servers eingeben (z.B. `https://paperless.home.de`)
3. API Token aus Paperless Einstellungen → API Token

## Mobile App (Expo)

### Voraussetzungen
- Node.js 18+
- Expo CLI: `npm install -g expo-cli`

### Entwicklung
```bash
cd mobile
npm install
# .env erstellen:
echo "EXPO_PUBLIC_API_URL=http://dein-server:3000/api" > .env
npm start
```

### Build für Produktion
```bash
# EAS Build Setup
eas build --platform android
eas build --platform ios
```

## Benutzerrollen

| Rolle | Beschreibung |
|-------|--------------|
| `superadmin` | Vollzugriff, Benutzer verwalten, Einladungscodes erstellen |
| `admin` | Haushalt verwalten, Mitglieder einladen |
| `member` | Buchungen erstellen & bearbeiten |
| `viewer` | Nur lesen |

## GitHub Actions / CI/CD

Für automatisches Deployment folgende GitHub Secrets setzen:
- `SERVER_HOST`, `SERVER_USER`, `SERVER_SSH_KEY`
- `DEPLOY_PATH` (z.B. `/opt/haushaltsbuch`)
- Alle `.env` Variablen als Secrets

## Lokale Entwicklung (ohne Docker)

```bash
# Backend
cd backend && npm install
cp .env.example .env  # anpassen
npm run dev

# Web-Frontend
cd web && npm install
npm run dev

# Mobile
cd mobile && npm install
npm start
```
