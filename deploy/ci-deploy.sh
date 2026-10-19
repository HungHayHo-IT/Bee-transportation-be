#!/usr/bin/env bash
# Triển khai BeeOps. Chạy TRÊN MÁY CHỦ, gọi qua SSH forced command từ GitHub Actions.
#
# Nhận mã nguồn qua STDIN dưới dạng tar.gz thay vì `git pull`: tổ chức đã tắt Deploy
# keys, và gắn khóa cá nhân lên máy chủ thì khóa đó có quyền như chính người dùng.
# Cách này máy chủ KHÔNG cần bất kỳ thông tin xác thực nào với GitHub.
#
# Cài đặt: xem DEPLOY.md §12.
set -euo pipefail

APP_DIR="${APP_DIR:-/srv/beeops}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.vm.yml}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:8087/api/health}"
HEALTH_TRIES="${HEALTH_TRIES:-30}"
STAGING="$APP_DIR/.staging"
PREV_TREE="/var/tmp/beeops-prev-tree.tar.gz"

log() { echo "[$(date +%F' '%T)] $*"; }
cd "$APP_DIR"

# --- 1. nhận mã nguồn từ stdin -------------------------------------------------
log "nhận gói mã nguồn..."
TARBALL="$(mktemp /var/tmp/beeops-release.XXXXXX.tar.gz)"
cat > "$TARBALL"
if ! tar tzf "$TARBALL" >/dev/null 2>&1; then
  log "GÓI HỎNG — không phải tar.gz hợp lệ. Dừng, không đụng tới bản đang chạy."
  rm -f "$TARBALL"
  exit 1
fi
log "gói hợp lệ ($(du -h "$TARBALL" | cut -f1))"

# --- 2. sao lưu dữ liệu và cây mã nguồn hiện tại --------------------------------
log "sao lưu dữ liệu..."
COMPOSE_FILE="$COMPOSE_FILE" ./deploy/backup.sh

log "sao lưu cây mã nguồn hiện tại để còn quay lui..."
tar czf "$PREV_TREE" --exclude=./uploads --exclude=./node_modules \
  --exclude=./.staging --exclude=./dist -C "$APP_DIR" . 2>/dev/null || true

# --- 3. giải nén và đồng bộ ----------------------------------------------------
rm -rf "$STAGING" && mkdir -p "$STAGING"
tar xzf "$TARBALL" -C "$STAGING"
rm -f "$TARBALL"

# .env và uploads là dữ liệu của máy chủ, không nằm trong gói và không được đụng tới.
if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete \
    --exclude='.env' --exclude='uploads/' --exclude='node_modules/' \
    --exclude='dist/' --exclude='.staging/' \
    "$STAGING"/ "$APP_DIR"/
else
  # Không có rsync: chép đè. File bị xóa ở bản mới sẽ còn sót lại.
  log "CẢNH BÁO: thiếu rsync, chép đè (apt-get install -y rsync để sạch hơn)"
  cp -a "$STAGING"/. "$APP_DIR"/
fi
rm -rf "$STAGING"
chmod +x "$APP_DIR"/deploy/*.sh

VERSION="$(cat "$APP_DIR/.release" 2>/dev/null || echo 'không rõ')"
log "phiên bản mới: $VERSION"

# --- 4. build, khởi động, kiểm tra ---------------------------------------------
health() {
  for _ in $(seq 1 "$HEALTH_TRIES"); do
    sleep 2
    curl -fsS --max-time 5 "$HEALTH_URL" >/dev/null 2>&1 && return 0
  done
  return 1
}

# --- build API, chiu duoc loi mang nhat thoi -----------------------------------
#
# `docker compose build` phai hoi Docker Hub de giai `FROM node:20-bookworm-slim`
# o moi lan build. Mot cu TLS handshake timeout — rat hay gap tu may chu dat tai
# VN — the la ca lan trien khai do, du ma nguon khong co van de gi.
#
# Da xay ra that: 02/10/2026, bat tay TLS voi registry-1.docker.io qua han, deploy
# quay lui trong khi ban moi hoan toan lanh lan.
#
# Thu lai BA lan, gian cach tang dan (10s, 20s). Co y KHONG them buoc "dung image
# nen trong cache": `--pull` cua docker compose la co bat/tat chu khong nhan gia
# tri, nen moi cach viet nhu `--pull never` deu bi hieu thanh ten dich vu va lam
# hong build — mot buoc du phong chua kiem chung duoc con nguy hon la khong co.
build_api() {
  local lan
  for lan in 1 2 3; do
    if docker compose -f "$COMPOSE_FILE" build api; then return 0; fi
    [ "$lan" = 3 ] && break
    log "build API hong (lan $lan/3) — co the do mang, cho $((lan * 10))s roi thu lai..."
    sleep $((lan * 10))
  done
  log "build API hong ca ba lan."
  return 1
}

rollback() {
  log "TRIỂN KHAI HỎNG — khôi phục cây mã nguồn cũ"
  if [ -f "$PREV_TREE" ]; then
    tar xzf "$PREV_TREE" -C "$APP_DIR"
    # Quay lui cung phai build lai. Dung cung ham co thu lai: neu Docker Hub dang
    # khong voi toi duoc thi day la luc KHONG duoc phep hong them lan nua.
    build_api || true
    docker compose -f "$COMPOSE_FILE" up -d api || true
    if health; then
      log "đã quay lui, hệ thống chạy lại bình thường."
    else
      log "QUAY LUI CŨNG HỎNG — cần vào máy chủ xử lý tay."
      docker compose -f "$COMPOSE_FILE" logs --tail=50 api
    fi
  else
    log "KHÔNG CÓ BẢN CŨ ĐỂ QUAY LUI."
  fi
  exit 1
}

log "đảm bảo container DB đang chạy để áp migration..."
docker compose -f "$COMPOSE_FILE" up -d db
# Chờ DB sẵn sàng nhận kết nối — cài mới hoặc restart thì psql cần vài giây.
for _ in $(seq 1 30); do
  if docker compose -f "$COMPOSE_FILE" exec -T db pg_isready -U "${POSTGRES_USER:-beeops}" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

log "chạy migration còn thiếu (nếu có)..."
COMPOSE_FILE="$COMPOSE_FILE" ./deploy/apply-migrations.sh || rollback

log "build và khởi động lại API..."
build_api || rollback
docker compose -f "$COMPOSE_FILE" up -d api || rollback

log "chờ health check..."
health || rollback

docker image prune -f --filter 'until=168h' >/dev/null 2>&1 || true
log "TRIỂN KHAI XONG — $VERSION"
curl -fsS "$HEALTH_URL"; echo
