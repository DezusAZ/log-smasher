#!/bin/bash
# Deploy/redeploy Log Smasher.
#   Source of truth : /DATA/projects/log-smasher   (NEVER bind-mounted — CasaOS uninstall
#                     deletes an app's mount source tree, which would wipe the project)
#   Serving copy    : /DATA/AppData/log-smasher     (what the container mounts)
set -e
SRC=/DATA/projects/log-smasher
APP=/DATA/AppData/log-smasher

mkdir -p "$APP/static"
# Sync into the EXISTING mounted dir. Clear its CONTENTS (mindepth 1) but never remove the
# dir itself — deleting the mounted dir detaches the container's bind mount (→ 403s).
find "$APP/static" -mindepth 1 -delete
cp -a "$SRC/static/." "$APP/static/"
cp -a "$SRC/nginx.conf" "$APP/nginx.conf"
chmod -R a+rX "$APP"           # nginx (container user) must be able to read
echo "synced static + nginx.conf -> $APP"

# Register/refresh the CasaOS tile (idempotent). Then ensure the container is live with the
# freshly-synced files (restart re-reads the mount; falls back to compose up if absent).
casaos-cli app-management install -f "$SRC/docker-compose.yml" >/dev/null 2>&1 || true
docker restart log-smasher >/dev/null 2>&1 || docker compose -f "$SRC/docker-compose.yml" up -d
sleep 2
code=$(curl -s -o /dev/null -w '%{http_code}' http://100.102.144.73:8810/ || echo "000")
echo "deployed: http://100.102.144.73:8810/  (HTTP $code)"
