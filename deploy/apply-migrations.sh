#!/usr/bin/env bash
# Chạy các file trong db/migrations/*.sql theo thứ tự tên. Chỉ chạy file CHƯA
# chạy — dấu vết lưu ở bảng schema_migrations (một dòng / một file).
#
# Nguyên tắc:
#  - Mỗi file được chạy trong MỘT giao dịch (BEGIN/COMMIT ở psql -1). Chính file
#    migration cũng nên gói BEGIN/COMMIT — hai lớp lồng nhau vẫn hợp lệ.
#  - Không có "rollback last": Postgres không tự lùi ALTER TABLE cho bạn. Nếu
#    file lỗi giữa chừng, giao dịch rollback về trước lệnh đầu tiên; nhưng đã
#    commit thì lịch sử ghi lại và fix bằng migration KẾ TIẾP, không sửa file cũ.
#  - Tên file quyết định thứ tự — luôn dùng tiền tố số 3 chữ số: 007-, 008-, 009-.
#  - Idempotent: chạy lại không làm gì thêm khi mọi file đã có trong
#    schema_migrations. An toàn khi CI/CD lặp lại.
#
# Cách gọi:
#   COMPOSE_FILE=docker-compose.vm.yml ./deploy/apply-migrations.sh
# hoặc từ ci-deploy.sh (đã tự set biến).

set -euo pipefail

APP_DIR="${APP_DIR:-/srv/beeops}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.vm.yml}"
MIG_DIR="$APP_DIR/db/migrations"

log() { echo "[$(date +%F' '%T)] [migrate] $*"; }

if [ ! -d "$MIG_DIR" ]; then
  log "không có thư mục $MIG_DIR — bỏ qua."
  exit 0
fi

# Có file nào không?
shopt -s nullglob
files=("$MIG_DIR"/*.sql)
shopt -u nullglob
if [ ${#files[@]} -eq 0 ]; then
  log "chưa có migration nào — bỏ qua."
  exit 0
fi

# Tất cả lệnh psql chạy qua service "db" trong compose — không cần lộ cổng ra
# ngoài. -T tắt TTY cho stdin pipe hoạt động.
psql_c() {
  docker compose -f "$COMPOSE_FILE" exec -T db \
    psql -U "${POSTGRES_USER:-beeops}" -d "${POSTGRES_DB:-beeops}" \
    -v ON_ERROR_STOP=1 "$@"
}

# Bảng theo dõi, tạo một lần cho luôn cả các DB đã cài trước tính năng này.
log "chuẩn bị bảng schema_migrations..."
psql_c -c "
CREATE TABLE IF NOT EXISTS schema_migrations (
  filename    text PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now()
);"

# Nếu DB đã có sẵn các bảng chính (chạy từ trước khi bảng schema_migrations tồn
# tại), đánh dấu MỌI migration hiện có là đã áp dụng — tránh chạy lại và cố ép
# schema đã đúng vào một trạng thái nghi ngờ. Điều kiện nhận diện DB cũ: bảng
# users tồn tại nhưng schema_migrations còn trống.
SEED_ROWS=$(psql_c -tAc "SELECT count(*) FROM schema_migrations;")
USERS_EXIST=$(psql_c -tAc "SELECT to_regclass('public.users') IS NOT NULL;")
if [ "$SEED_ROWS" = "0" ] && [ "$USERS_EXIST" = "t" ]; then
  # LỐI TẮT NGUY HIỂM — đọc kỹ trước khi sửa.
  #
  # Nhánh này KHÔNG chạy file nào, chỉ ghi tên chúng vào schema_migrations.
  # Nó đúng cho DB CŨ đã migrate đủ từ trước khi có bảng theo dõi. Nhưng nó
  # KHÔNG phân biệt được ca đó với DB MỚI dựng từ schema.sql — hai ca nhìn y
  # hệt nhau: có bảng users, schema_migrations trống.
  #
  # Với DB mới, phần DDL thì schema.sql đã lo, nhưng phần DỮ LIỆU nằm trong
  # migration thì mất trắng. Đã xảy ra thật: user hệ thống public@bee.internal
  # (migration 008/009) không được tạo trên production, nên MỌI yêu cầu báo giá
  # từ form công khai đều không sinh được đơn — im lặng nhiều ngày.
  #
  # Vì vậy nhánh này giờ phải NÓI TO: liệt kê đúng những file bị bỏ qua, rồi
  # chạy luôn bảng kiểm để người deploy thấy ngay cái gì còn thiếu.
  log "!!! DB đã có bảng users nhưng schema_migrations trống."
  log "!!! Đánh dấu ${#files[@]} migration là ĐÃ CHẠY mà KHÔNG chạy file nào:"
  for f in "${files[@]}"; do
    name="$(basename "$f")"
    log "!!!   - $name (bỏ qua, chỉ ghi nhận)"
    psql_c -c "INSERT INTO schema_migrations (filename) VALUES ('$name')
               ON CONFLICT DO NOTHING;" >/dev/null
  done
  log "!!! Nếu đây là DB MỚI dựng từ schema.sql, phần dữ liệu trong các file"
  log "!!! trên CHƯA được nạp. Bảng kiểm dưới đây cho biết thiếu gì:"

  CHECK_SQL="$APP_DIR/scripts/check-migrations.sql"
  if [ -f "$CHECK_SQL" ]; then
    # Không để lỗi bảng kiểm làm hỏng deploy — nó chỉ để BÁO, không để chặn.
    psql_c -f - < "$CHECK_SQL" || log "!!! (không chạy được bảng kiểm)"
    log "!!! Dòng nào ghi 'THIEU' thì phải nạp tay file tương ứng trước khi dùng."
  else
    log "!!! (không tìm thấy $CHECK_SQL — chạy tay scripts/check-migrations.sql)"
  fi
  exit 0
fi

# Duyệt theo thứ tự tên (LC_ALL=C để chắc chắn ổn định trên mọi locale).
applied=0
for f in $(printf '%s\n' "${files[@]}" | LC_ALL=C sort); do
  name="$(basename "$f")"
  seen=$(psql_c -tAc "SELECT 1 FROM schema_migrations WHERE filename='$name';")
  if [ "$seen" = "1" ]; then
    continue
  fi
  log "áp dụng $name..."
  # Pipe file vào psql qua stdin — không cần copy vào container. -1 bọc TẤT CẢ
  # trong một giao dịch ở tầng psql; file lỗi thì không có gì được ghi và lần
  # chạy sau thử lại tiếp.
  psql_c -1 < "$f"
  psql_c -c "INSERT INTO schema_migrations (filename) VALUES ('$name');" >/dev/null
  applied=$((applied + 1))
  log "  ✓ $name"
done

if [ "$applied" -eq 0 ]; then
  log "không có migration mới."
else
  log "đã áp dụng $applied migration."
fi
