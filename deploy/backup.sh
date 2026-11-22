#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
oit_stamp="$(date -u +%Y%m%dT%H%M%SZ)"
docker compose exec -T portal oit-portal backup "/app/backups/oit-${oit_stamp}.sqlite3"
printf 'Сохранено: backups/oit-%s.sqlite3\n' "$oit_stamp"
