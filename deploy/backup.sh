#!/usr/bin/env bash
set -euo pipefail
umask 077
cd "$(dirname "$0")"
PB_ENV_FILE="${1:-.env}"
PB_BACKUP_DIR="${2:-./backups}"
mkdir -p "$PB_BACKUP_DIR"
PB_BACKUP_FILE="$(mktemp "$PB_BACKUP_DIR/pb-$(date -u +%Y%m%dT%H%M%SZ)-XXXXXX.dump")"
trap 'rm -f "$PB_BACKUP_FILE"' ERR
docker compose --env-file "$PB_ENV_FILE" -f compose.yaml exec -T postgres sh -c 'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner' > "$PB_BACKUP_FILE"
printf '%s\n' "$PB_BACKUP_FILE"
