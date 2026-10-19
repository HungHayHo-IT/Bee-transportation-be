#!/usr/bin/env bash
#
# XOÁ SẠCH dữ liệu rồi dựng lại danh mục + sơ đồ tổ chức + tài khoản test.
#
# KHÔNG HOÀN TÁC ĐƯỢC. Chỉ chạy trên môi trường thử nghiệm.
#
# Cách dùng:
#   ./scripts/reset-test-data.sh                     # qua container beeops-postgres
#   PG_CONTAINER=ten-khac ./scripts/reset-test-data.sh
#   USE_DOCKER=0 PGHOST=... PGUSER=... ./scripts/reset-test-data.sh   # psql trực tiếp
#
set -euo pipefail

DB="${PGDATABASE:-beeops}"
PG_CONTAINER="${PG_CONTAINER:-beeops-postgres}"
PG_USER="${PGUSER:-beeops}"
USE_DOCKER="${USE_DOCKER:-1}"

cd "$(dirname "$0")/.."

if [ "$USE_DOCKER" = "1" ]; then
  run_sql() { docker exec -i "$PG_CONTAINER" psql -U "$PG_USER" -d "$DB" -v ON_ERROR_STOP=1 -q "$@"; }
  TARGET="container $PG_CONTAINER"
else
  run_sql() { psql -U "$PG_USER" -d "$DB" -v ON_ERROR_STOP=1 -q "$@"; }
  TARGET="${PGHOST:-localhost}:${PGPORT:-5432}"
fi

cat <<WARN

  ╔════════════════════════════════════════════════════════════════╗
  ║  XOÁ SẠCH TOÀN BỘ DỮ LIỆU                                      ║
  ╚════════════════════════════════════════════════════════════════╝

  Database : $DB
  Đích     : $TARGET

  Sẽ xoá VĨNH VIỄN: đơn hàng, báo giá, khách hàng, yêu cầu báo giá,
  bình luận, file đính kèm, thông báo, nhật ký hoạt động, tài khoản
  người dùng và phòng ban.

  KHÔNG có bước hoàn tác. Nếu dữ liệu này còn cần, hãy Ctrl-C ngay và
  sao lưu trước:

      pg_dump -U $PG_USER -d $DB > backup-\$(date +%F-%H%M).sql

WARN

printf '  Gõ XOA (in hoa, không dấu) để xác nhận: '
read -r ANSWER
[ "$ANSWER" = "XOA" ] || { echo "  Đã huỷ, không đụng gì tới dữ liệu."; exit 1; }

echo
echo "==> Đếm dữ liệu trước khi xoá"
run_sql -tAc "
  SELECT '    ' || relname || ': ' || n_live_tup
  FROM pg_stat_user_tables WHERE n_live_tup > 0 ORDER BY n_live_tup DESC;" || true

echo
echo "==> Xoá sạch mọi bảng trong schema public"
# Liệt kê bảng động thay vì viết cứng: thêm bảng mới sau này không phải nhớ sửa
# script, và không bao giờ sót một bảng nào.
run_sql -c "
DO \$\$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('TRUNCATE TABLE %I RESTART IDENTITY CASCADE', r.tablename);
  END LOOP;
END \$\$;"
echo "    xong"

echo
echo "==> Nạp lại danh mục gốc"
for f in db/seed.sql db/migrations/003-service-fields-seed.sql; do
  run_sql -f - < "$f"
  echo "    $f"
done

echo
echo "==> Dựng sơ đồ tổ chức + tài khoản test"
run_sql -f - < db/seed-test-accounts.sql
echo "    db/seed-test-accounts.sql"

echo
echo "==> Kết quả"
run_sql -tAc "
  SELECT '    ' || u.email || '  [' || array_to_string(u.roles, ',') || ']'
         || coalesce('  @ ' || d.name, '')
  FROM users u LEFT JOIN departments d ON d.id = u.department_id
  ORDER BY u.email;"
echo
run_sql -tAc "
  SELECT '    ' || coalesce(p.name || ' / ', '') || d.name
         || '  (' || coalesce(nullif(array_length(d.service_ids, 1), 0)::text, '0') || ' dịch vụ)'
  FROM departments d LEFT JOIN departments p ON p.id = d.parent_id
  ORDER BY coalesce(p.name, d.name), d.parent_id NULLS FIRST, d.name;"

echo
echo "  Xong. Mật khẩu chung: xem src/common/config/test-accounts.json"
echo "  Các tài khoản này KHÔNG đổi được mật khẩu (API trả 403)."
