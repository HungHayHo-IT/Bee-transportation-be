-- 012 — Gắn khách hàng đăng nhập vào quote_requests. Cột nullable vì form
-- public vẫn hoạt động ẩn danh (khách chưa/không đăng nhập).
--
-- Idempotent.

BEGIN;

ALTER TABLE quote_requests
  ADD COLUMN IF NOT EXISTS customer_id int REFERENCES customer_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS quote_requests_customer_idx
  ON quote_requests (customer_id, created_at DESC)
  WHERE customer_id IS NOT NULL;

COMMIT;
