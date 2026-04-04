#!/bin/bash
# Haushaltsbuch – Libre Workspace Addon Setup
# Wird als root ausgeführt.
# Verfügbare Variablen: $DOMAIN, $ADMIN_PASSWORD, $IP, $LDAP_DC, $LANGUAGE_CODE

set -euo pipefail

APP_NAME="haushaltsbuch"
APP_DIR="/root/${APP_NAME}"
APP_DOMAIN="${APP_NAME}.${DOMAIN}"
REPO_URL="https://github.com/boernie77/haushaltsbuch.git"

echo "[haushaltsbuch] Erstelle Verzeichnisse..."
mkdir -p "${APP_DIR}/data/db"
mkdir -p "${APP_DIR}/data/uploads"

echo "[haushaltsbuch] Generiere Zugangsdaten..."
DB_PASSWORD=$(libre-workspace-generate-secret 32)
JWT_SECRET=$(libre-workspace-generate-secret 64)
ENCRYPTION_KEY=$(openssl rand -hex 32)

echo "[haushaltsbuch] Erstelle .env..."
cat > "${APP_DIR}/.env" << ENV
DATABASE_URL=postgres://haushalt:${DB_PASSWORD}@db:5432/haushaltsbuch
DB_PASSWORD=${DB_PASSWORD}
JWT_SECRET=${JWT_SECRET}
ENCRYPTION_KEY=${ENCRYPTION_KEY}
PORT=3000
NODE_ENV=production
APP_URL=https://${APP_DOMAIN}
API_URL=https://${APP_DOMAIN}/api
ALLOWED_ORIGINS=https://${APP_DOMAIN}
FAMILY_MODE=true
ENV

echo "[haushaltsbuch] Klone Repository..."
if [ -d "${APP_DIR}/src/.git" ]; then
    git -C "${APP_DIR}/src" pull --ff-only
else
    git clone --depth 1 "${REPO_URL}" "${APP_DIR}/src"
fi

echo "[haushaltsbuch] Erstelle docker-compose.yml..."
cat > "${APP_DIR}/docker-compose.yml" << 'COMPOSE'
services:
  db:
    image: postgres:16-alpine
    container_name: haushaltsbuch-db
    restart: unless-stopped
    environment:
      POSTGRES_DB: haushaltsbuch
      POSTGRES_USER: haushalt
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - ./data/db:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U haushalt -d haushaltsbuch"]
      interval: 10s
      timeout: 5s
      retries: 5

  backend:
    build: ./src/backend
    container_name: haushaltsbuch-backend
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
    env_file: .env
    environment:
      DATABASE_URL: postgres://haushalt:${DB_PASSWORD}@db:5432/haushaltsbuch
      PORT: "3000"
      NODE_ENV: production
    volumes:
      - ./data/uploads:/app/uploads
      - /etc/ssl/certs:/etc/ssl/certs:ro
    extra_hosts:
      - "host.docker.internal:host-gateway"

  web:
    build:
      context: ./src/web
      args:
        VITE_API_URL: ${API_URL}
    container_name: haushaltsbuch-web
    restart: unless-stopped
    depends_on:
      - backend
    extra_hosts:
      - "host.docker.internal:host-gateway"
COMPOSE

echo "[haushaltsbuch] Baue und starte Container..."
cd "${APP_DIR}" && docker-compose build --no-cache
cd "${APP_DIR}" && docker-compose up -d

echo "[haushaltsbuch] Warte auf Backend-Start..."
sleep 10

echo "[haushaltsbuch] Konfiguriere Caddy Reverse-Proxy..."
cat > "/etc/caddy/sites/${APP_NAME}.caddy" << CADDY
${APP_DOMAIN} {
    reverse_proxy localhost:8081
}
CADDY

systemctl reload caddy || caddy reload --config /etc/caddy/Caddyfile 2>/dev/null || true

echo "[haushaltsbuch] Installation abgeschlossen."
echo "[haushaltsbuch] Erreichbar unter: https://${APP_DOMAIN}"
echo "[haushaltsbuch] Beim ersten Aufruf einen Account anlegen — dieser wird automatisch zum Admin."
