-- 007 — Yêu cầu báo giá công khai. Khách nhập form ngoài trang landing gửi lên,
-- Admin/Sale duyệt xong mới chuyển thành order thực sự. Tách bảng riêng để đơn
-- thật (orders) luôn có creator là nhân viên nội bộ, không lẫn với data khách gửi.
--
-- Chạy:
--   docker compose -f docker-compose.vm.yml exec -T db \
--     psql -U beeops -d beeops -v ON_ERROR_STOP=1 -f - < db/migrations/007-quote-requests.sql
--
-- Idempotent.

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
  -- 'pending' -> chưa xử lý; 'converted' -> đã tạo order; 'rejected' -> từ chối.
  status                 text NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending','converted','rejected')),
  -- Null nếu khách gửi mà không đăng nhập. Không phải FK cascade — user bị xóa
  -- thì request vẫn phải giữ lịch sử, chỉ mất tên người submit.
  created_by             int REFERENCES users(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  reviewed_by            int REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at            timestamptz,
  converted_to_order_id  int REFERENCES orders(id) ON DELETE SET NULL,
  reject_reason          text
);

CREATE INDEX IF NOT EXISTS quote_requests_status_idx
  ON quote_requests (status, created_at DESC);

COMMIT;
