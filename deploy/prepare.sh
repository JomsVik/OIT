#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ ! -f .env ]]; then
  read -r -s -p 'Первый пароль директора (12–72 символа ASCII): ' oit_password
  printf '\n'
  if [[ ${#oit_password} -lt 12 || ${#oit_password} -gt 72 || ! "$oit_password" =~ ^[a-zA-Z0-9_@%+=:,./-]+$ ]]; then
    printf 'Используйте 12–72 латинских букв, цифр и символов _@%%+=:,./- .\n' >&2
    exit 1
  fi
  umask 077
  cp .env.example .env
  sed -i "s|^BOOTSTRAP_PASSWORD=.*|BOOTSTRAP_PASSWORD=${oit_password}|" .env
  unset oit_password
else
  printf '.env уже существует: проверьте, что BOOTSTRAP_PASSWORD заполнен.\n'
fi
mkdir -p data backups
sudo chown 10001:10001 data backups
sudo chmod 700 data backups
printf 'Готово. Для Docker: sudo docker compose up -d --build\n'
