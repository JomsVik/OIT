#!/usr/bin/env bash
# Run on a Linux computer with Internet and the same CPU architecture as the server.
set -euo pipefail
cd "$(dirname "$0")/.."
oit_output="${1:-oit-offline}"
if [[ -e "$oit_output" ]]; then
  printf 'Каталог назначения уже существует: %s\n' "$oit_output" >&2
  exit 1
fi
docker build --tag oit-portal:2.0.0 .
mkdir -p "$oit_output/deploy"
docker image save oit-portal:2.0.0 | gzip > "$oit_output/oit-portal-image.tar.gz"
cp compose.yaml .env.example "$oit_output/"
cp deploy/prepare.sh deploy/backup.sh "$oit_output/deploy/"
cat > "$oit_output/START.txt" <<'EOF'
На целевой Ubuntu должны быть Docker и Compose.
1. sudo docker load -i oit-portal-image.tar.gz
2. bash deploy/prepare.sh
3. Отредактируйте LISTEN_IP в .env для доступа по сети.
4. sudo docker compose up -d --no-build --pull never
5. curl --fail http://IP_ИЗ_LISTEN_IP:3000/api/health
Для переноса данных поместите согласованную резервную копию в data/oit.sqlite3
до запуска. Владелец: 10001:10001. Не переносите живой WAL-файл по частям.
EOF
printf 'Перенесите каталог %s на сервер. Пароль и рабочие данные в пакет не включены.\n' "$oit_output"
