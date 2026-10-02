# 💰 Haushaltsbuch

Freies Haushaltsbuch zum **Selbsthosten**: Web-App, Handy-App (iOS/Android),
KI-Quittungserkennung, Bank-Import (CSV/MT940) und Paperless-ngx-Anbindung.
Kostenlos, ohne Abo, deine Daten bleiben auf deinem Server.

Lizenz: [GNU AGPL v3.0](LICENSE)

## Funktionen

- **Buchungen** mit Kategorien, Suche (auch nach Betrag), wiederkehrenden Buchungen
  und Duplikat-Warnung
- **Mehrere Haushaltsbücher** pro Person, gemeinsame Bücher für Familien,
  Rollen Admin / Mitglied / Betrachter
- **Konten** (Giro, Kreditkarte, Bargeld, Darlehen …) mit Umbuchungen und
  Vermögensübersicht, **Sub-Konten** (z. B. Spesen), **Kalender** mit
  Kontostand-Verlauf und Vorschau der Daueraufträge
- **Budgets, Sparziele, Statistiken** (Monat, Jahr, Trends, Vermögen, Personen,
  fester Saldo), frei wählbarer Monatsbeginn (z. B. Gehalt am 27.)
- **Bank-Import** aus CSV- und MT940-Dateien des Online-Bankings, mit Abgleich
  vorhandener Buchungen, Regeln, Lernen aus deinen Zuordnungen und optionalen
  KI-Vorschlägen (Claude oder eigener OpenAI-kompatibler Server wie Ollama)
- **KI-Quittungserkennung** per Foto (Claude, optional)
- **Paperless-ngx**: Belege archivieren und beim Bank-Import zuordnen
- **Handy-App** mit Offline-Erfassung und Schnellerfassung
- Vollständige Backups der Datenbank (Download oder automatisch per SFTP) mit
  Wiederherstellung in der Administration, Export pro Haushaltsbuch (JSON/CSV),
  Monatsberichte per E-Mail,
  optional Single Sign-on per OpenID Connect (z. B. Authentik)

Die ausführliche Bedienungsanleitung steht in [ANLEITUNG.md](ANLEITUNG.md) und in
der App unter „Anleitung".

## Installation mit Docker

Voraussetzungen: ein Linux-Server mit Docker und Docker Compose, eine Domain und
ein Reverse Proxy mit HTTPS (z. B. Caddy, Traefik oder nginx).

```bash
git clone https://github.com/boernie77/haushaltsbuch.git
cd haushaltsbuch
cp .env.example .env
# .env anpassen (siehe unten)
docker compose up -d --build
```

Danach laufen:

| Dienst | Port auf dem Host | Zweck |
|---|---|---|
| Web (nginx) | `8081` | Web-App und `/api` (leitet ans Backend weiter) |
| Backend | `3001` | API direkt (nur für Tests nötig) |

Den Reverse Proxy auf Port **8081** zeigen lassen, z. B. mit Caddy:

```
haushalt.example.com {
    reverse_proxy localhost:8081
}
```

Die Datenbank-Migrationen laufen beim Start des Backends automatisch. Daten
liegen unter `./data/db` (PostgreSQL) und `./data/uploads` (Belegfotos).

**Backup:** Unter *Administration → Backup* lässt sich jederzeit ein
vollständiges Datenbank-Backup herunterladen oder ein automatisches Backup per
SFTP einrichten (`pg_dump`-Format, `.dump`). Dort wird es auch wieder
eingespielt. Belegfotos aus `./data/uploads` separat sichern, und den
`ENCRYPTION_KEY` getrennt aufbewahren.

**Erster Start:** Die erste Person, die sich registriert, wird **Superadmin** und
bekommt ein Haushaltsbuch. Alle weiteren brauchen einen Einladungscode, den der
Superadmin (neuer Haushalt) oder ein Haushalts-Admin (Mitglied) erzeugt.

**Update:**

```bash
git pull
docker compose up -d --build
```

## Konfiguration (`.env`)

| Variable | Pflicht | Beschreibung |
|---|---|---|
| `DB_PASSWORD` | ja | Passwort der PostgreSQL-Datenbank |
| `JWT_SECRET` | ja | Langer Zufallswert, z. B. `openssl rand -hex 32` |
| `ENCRYPTION_KEY` | ja | Verschlüsselt API-Keys, Tokens und Passwörter in der Datenbank. `openssl rand -hex 32` (64 Hex-Zeichen). **Getrennt von den Backups sichern** – ohne ihn sind diese Felder nach einer Wiederherstellung unlesbar. Fehlt er, speichert die App im Klartext und warnt beim Start |
| `APP_URL` | ja | Öffentliche Adresse, z. B. `https://haushalt.example.com` |
| `API_URL` | ja | `APP_URL` + `/api` |
| `ALLOWED_ORIGINS` | ja | Erlaubte Ursprünge, kommagetrennt (mindestens `APP_URL`) |
| `ANTHROPIC_API_KEY` | nein | Claude-Key für KI-Funktionen. Alternativ hinterlegt jedes Haushaltsbuch einen eigenen Key in der App |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | nein | E-Mail für Passwort-Reset und Monatsberichte |
| `OIDC_ISSUER_URL`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` | nein | Single Sign-on per OpenID Connect; leer = aus |
| `LEGAL_NAME`, `LEGAL_ADDRESS`, `LEGAL_EMAIL` | nein* | Betreiberangaben für Impressum und Datenschutz (`LEGAL_ADDRESS` kommagetrennt, z. B. `Musterstr. 1, 12345 Musterstadt`) |
| `LEGAL_HOSTING`, `LEGAL_AUTHORITY` | nein | Speicherort/Hoster und zuständige Datenschutz-Aufsichtsbehörde für die Datenschutzerklärung |
| `SOURCE_URL` | nein | Link zum Quellcode, falls du eine geänderte Version betreibst (Pflicht nach AGPL) |

\* Wer die Installation öffentlich für andere betreibt, braucht in Deutschland
in der Regel ein Impressum. Für eine rein private Installation im Heimnetz
können die Felder leer bleiben.

## Handy-App

Beim ersten Anmelden trägst du die **Server-Adresse** deiner Installation ein
(z. B. `https://haushalt.example.com`); die App merkt sie sich.

Selbst bauen (Expo SDK 52):

```bash
cd mobile
npm install
# optional: Server-Adresse vorbelegen
echo "EXPO_PUBLIC_API_URL=https://haushalt.example.com/api" > .env
npx expo prebuild
npx expo run:ios      # bzw. run:android
```

## Entwicklung

```bash
# Backend (braucht eine PostgreSQL-Datenbank)
cd backend && npm install
cp .env.example .env   # DATABASE_URL usw. anpassen
npm run dev

# Web
cd web && npm install && npm run dev

# Mobile
cd mobile && npm install && npm start
```

Aufbau: `backend/` (Node.js, Express, Sequelize, PostgreSQL), `web/` (React,
Vite, Tailwind), `mobile/` (React Native, Expo). Code-Stil: Biome/Ultracite
(`npm exec -- ultracite fix`).

## Lizenz

Haushaltsbuch ist freie Software: Du darfst sie unter den Bedingungen der
[GNU Affero General Public License v3.0](LICENSE) nutzen, verändern und
weitergeben. Wer eine veränderte Version als Webdienst für andere betreibt, muss
deren Quellcode den Nutzern zugänglich machen.
