#!/bin/bash
# Haushaltsbuch – Libre Workspace Addon Entfernen

set -euo pipefail

APP_DIR="/root/haushaltsbuch"

echo "[haushaltsbuch] Stoppe und entferne Container..."
if [ -f "${APP_DIR}/docker-compose.yml" ]; then
    cd "${APP_DIR}" && docker-compose down --volumes --remove-orphans || true
fi

echo "[haushaltsbuch] Entferne Docker-Images..."
docker rmi haushaltsbuch-backend haushaltsbuch-web 2>/dev/null || true

echo "[haushaltsbuch] Entferne Caddy-Konfiguration..."
rm -f /etc/caddy/sites/haushaltsbuch.caddy
systemctl reload caddy || caddy reload --config /etc/caddy/Caddyfile 2>/dev/null || true

echo "[haushaltsbuch] Entferne App-Verzeichnis (inkl. Daten)..."
rm -rf "${APP_DIR}"

libre-workspace-remove-webserver-entry haushaltsbuch 2>/dev/null || true

echo "[haushaltsbuch] Deinstallation abgeschlossen."
