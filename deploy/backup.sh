#!/usr/bin/env bash
# Sao lưu DB + file đính kèm. Đặt vào cron 2:00 hằng ngày:
#   0 2 * * * /srv/beeops/deploy/backup.sh >> /var/log/beeops-backup.log 2>&1
set -euo pipefail

APP_DIR="${APP_DIR:-/srv/beeops}"
# Máy đã có reverse proxy sẵn thì dùng docker-compose.vm.yml — đặt biến này
# trong crontab hoặc /etc/environment thay vì sửa script.
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
BACKUP_DIR="${BACKUP_DIR:-/srv/backup/beeops}"
KEEP_DAYS="${KEEP_DAYS:-30}"
STAMP="$(date +%F-%H%M)"

mkdir -p "$BACKUP_DIR"
cd "$APP_DIR"

# -Fc = định dạng nén, khôi phục bằng pg_restore
docker compose -f "$COMPOSE_FILE" exec -T db \
  pg_dump -U "${POSTGRES_USER:-beeops}" -d "${POSTGRES_DB:-beeops}" -Fc \
  > "$BACKUP_DIR/db-$STAMP.dump"

tar czf "$BACKUP_DIR/uploads-$STAMP.tgz" -C "$APP_DIR" uploads

find "$BACKUP_DIR" -name 'db-*.dump'      -mtime "+$KEEP_DAYS" -delete
find "$BACKUP_DIR" -name 'uploads-*.tgz'  -mtime "+$KEEP_DAYS" -delete

echo "[$(date +%F' '%T)] backup xong: db-$STAMP.dump ($(du -h "$BACKUP_DIR/db-$STAMP.dump" | cut -f1))"
