#!/bin/bash
# Haushaltsbuch – Libre Workspace Addon Update

set -euo pipefail

APP_DIR="/root/haushaltsbuch"

if [ ! -d "${APP_DIR}" ]; then
    echo "[haushaltsbuch] App-Verzeichnis nicht gefunden, Update übersprungen."
    exit 0
fi

echo "[haushaltsbuch] Aktualisiere Repository..."
if [ -d "${APP_DIR}/src/.git" ]; then
    git -C "${APP_DIR}/src" pull --ff-only
else
    echo "[haushaltsbuch] Kein Git-Repository gefunden, Update übersprungen."
    exit 0
fi

echo "[haushaltsbuch] Baue neue Images..."
cd "${APP_DIR}" && docker-compose build --no-cache

echo "[haushaltsbuch] Starte Container neu..."
cd "${APP_DIR}" && docker-compose up -d

echo "[haushaltsbuch] Update abgeschlossen."
