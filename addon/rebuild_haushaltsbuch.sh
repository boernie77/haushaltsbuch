#!/bin/bash
# Haushaltsbuch – Libre Workspace Addon Rebuild
# Rekonstruiert die App ohne Datenverlust (Datenbank und Uploads bleiben erhalten).

set -euo pipefail

APP_DIR="/root/haushaltsbuch"

if [ ! -d "${APP_DIR}" ]; then
    echo "[haushaltsbuch] App-Verzeichnis nicht gefunden."
    exit 1
fi

echo "[haushaltsbuch] Stoppe Container (Daten bleiben erhalten)..."
cd "${APP_DIR}" && docker-compose down --remove-orphans

echo "[haushaltsbuch] Entferne alte Images..."
docker rmi haushaltsbuch-backend haushaltsbuch-web 2>/dev/null || true

echo "[haushaltsbuch] Aktualisiere Repository..."
if [ -d "${APP_DIR}/src/.git" ]; then
    git -C "${APP_DIR}/src" pull --ff-only
fi

echo "[haushaltsbuch] Baue neue Images..."
cd "${APP_DIR}" && docker-compose build --no-cache

echo "[haushaltsbuch] Starte Container..."
cd "${APP_DIR}" && docker-compose up -d

echo "[haushaltsbuch] Rebuild abgeschlossen. Daten sind erhalten."
