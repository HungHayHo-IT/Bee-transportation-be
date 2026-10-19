-- 015 — Thông báo đẩy (FCM) cho khách hàng.
--
-- Dùng CHUNG bảng notifications thay vì tạo bảng riêng. Phân biệt chủ sở hữu bằng
-- HAI CỘT FK nullable, không phải cột is_customer: users.id và customer_accounts.id
-- là hai sequence độc lập trùng nhau dày đặc, nên nhét customer id vào user_id sẽ
-- làm cron email (JOIN users u ON u.id = n.user_id) gửi thông báo của khách id 5
-- tới nhân viên id 5.
--
-- Idempotent.

BEGIN;

ALTER TABLE notifications ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS customer_id      int REFERENCES customer_accounts(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS quote_request_id int REFERENCES quote_requests(id)    ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS pushed_at        timestamptz;

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_owner_ck;
ALTER TABLE notifications ADD CONSTRAINT notifications_owner_ck CHECK (
  num_nonnulls(user_id, customer_id) = 1
  OR (user_id IS NULL AND customer_id IS NULL AND quote_request_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS notifications_cust_inbox_idx
  ON notifications (customer_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_push_idx ON notifications (created_at)
  WHERE pushed_at IS NULL AND user_id IS NULL;

ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS fcm_token text;
CREATE INDEX IF NOT EXISTS quote_requests_order_idx
  ON quote_requests (converted_to_order_id) WHERE converted_to_order_id IS NOT NULL;

ALTER TABLE customer_accounts
  ADD COLUMN IF NOT EXISTS push_off text[] NOT NULL DEFAULT '{}';

COMMIT;
