-- 014 — Thiết bị nhận push của khách hàng (FCM token).
--
-- Chỉ là nơi CHỨA token để bước sau gửi push; chưa có gì gọi Firebase.
-- Tách khỏi notifications (bảng đó trỏ users — nhân viên nội bộ, role model khác).
--
-- Idempotent.

BEGIN;

CREATE TABLE IF NOT EXISTS customer_devices (
  id            serial PRIMARY KEY,
  customer_id   int NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
  fcm_token     text NOT NULL,
  platform      text NOT NULL CHECK (platform IN ('web','android','ios')),
  -- Cập nhật mỗi lần FE đăng ký lại (app mở lại / FCM rotate token). Dùng để
  -- dọn token chết sau này, khi đã có luồng gửi push thật.
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),

  -- UNIQUE trên token MỘT MÌNH, cố ý không phải (customer_id, fcm_token).
  -- Một token = một bản cài app trên một máy. Khách A logout rồi khách B login
  -- trên cùng máy thì FCM trả về đúng token cũ; nếu unique theo cặp thì DB có
  -- 2 dòng và máy đó nhận push của cả hai người — rò dữ liệu giữa hai khách.
  CONSTRAINT customer_devices_token_uk UNIQUE (fcm_token)
);

CREATE INDEX IF NOT EXISTS customer_devices_cust_idx ON customer_devices(customer_id);

COMMIT;
