-- 006 — Cờ "hiện trên trang landing" cho nhân viên.
--
-- Trang landing (public, không cần đăng nhập) hiển thị các "người đại diện"
-- do Admin bật ở /sale/representatives. Cột này giữ trạng thái đó, mặc định
-- FALSE nên tuyệt đối không lộ ai ra ngoài trước khi Admin chọn.
--
-- Chạy:
--   docker compose -f docker-compose.vm.yml exec -T db \
--     psql -U beeops -d beeops -v ON_ERROR_STOP=1 -f - < db/migrations/006-users-landing-representative.sql
--
-- Idempotent.

BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_landing_representative boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS users_landing_rep_idx
  ON users (is_landing_representative)
  WHERE is_landing_representative = true;

COMMIT;
