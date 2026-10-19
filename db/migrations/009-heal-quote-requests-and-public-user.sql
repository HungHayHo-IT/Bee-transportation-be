-- 009 — Vá lỗi seed sai của migration runner. Bản chất là chạy lại nội dung
-- migration 007 + 008 dưới dạng idempotent, để mọi VM (kể cả các VM mà runner
-- lỡ tick 007/008 là "đã chạy" trong khi thực tế chưa có bảng) đều có đúng
-- bảng quote_requests và user hệ thống public@bee.internal.
--
-- File này CHỈ để chữa cháy — kể từ migration 010 trở đi lại theo quy trình
-- bình thường.
--
-- An toàn khi chạy trên VM đã có sẵn quote_requests: CREATE TABLE IF NOT EXISTS
-- và ON CONFLICT DO NOTHING đảm bảo không đụng gì tới data cũ.

BEGIN;

CREATE TABLE IF NOT EXISTS quote_requests (
  id                     serial PRIMARY KEY,
  customer_name          text NOT NULL,
  phone                  text NOT NULL,
  email                  text,
  service_id             int REFERENCES services(id),
  origin_province        text,
  destination_province   text,
  note                   text,
  status                 text NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending','converted','rejected')),
  created_by             int REFERENCES users(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  reviewed_by            int REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at            timestamptz,
  converted_to_order_id  int REFERENCES orders(id) ON DELETE SET NULL,
  reject_reason          text
);

CREATE INDEX IF NOT EXISTS quote_requests_status_idx
  ON quote_requests (status, created_at DESC);

INSERT INTO users (email, full_name, password_hash, roles, must_change_password, is_active)
VALUES ('public@bee.internal', 'Khách online', 'DISABLED', ARRAY['sale']::text[], false, true)
ON CONFLICT (email) DO NOTHING;

COMMIT;
