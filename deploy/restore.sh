#!/usr/bin/env bash
# Khôi phục từ bản sao lưu.  ./deploy/restore.sh /srv/backup/beeops/db-2026-08-22-0200.dump
# GHI ĐÈ toàn bộ dữ liệu hiện tại — hỏi lại trước khi chạy trên máy chủ thật.
set -euo pipefail

DUMP="${1:?Thiếu đường dẫn file .dump}"
APP_DIR="${APP_DIR:-/srv/beeops}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
cd "$APP_DIR"

read -rp "GHI ĐÈ toàn bộ DB hiện tại bằng $DUMP ? Gõ 'yes' để tiếp tục: " a
[ "$a" = "yes" ] || { echo "Đã hủy."; exit 1; }

docker compose -f "$COMPOSE_FILE" stop api

docker compose -f "$COMPOSE_FILE" exec -T db \
  psql -U "${POSTGRES_USER:-beeops}" -d postgres \
  -c "DROP DATABASE IF EXISTS ${POSTGRES_DB:-beeops};" \
  -c "CREATE DATABASE ${POSTGRES_DB:-beeops} OWNER ${POSTGRES_USER:-beeops};"

docker compose -f "$COMPOSE_FILE" exec -T db \
  pg_restore -U "${POSTGRES_USER:-beeops}" -d "${POSTGRES_DB:-beeops}" --no-owner < "$DUMP"

docker compose -f "$COMPOSE_FILE" start api
echo "Khôi phục xong. Kiểm tra: curl -fsS http://127.0.0.1/api/health"
