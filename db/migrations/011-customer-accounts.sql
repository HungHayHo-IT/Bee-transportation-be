-- 011 — Tài khoản khách hàng: đăng ký/đăng nhập bằng Email+OTP+PIN, hoặc
-- Google/Apple. Tách hoàn toàn khỏi users (nhân viên nội bộ) — hai role model
-- khác nhau, không lẫn.
--
-- Idempotent.

BEGIN;

CREATE TABLE IF NOT EXISTS customer_accounts (
  id                    serial PRIMARY KEY,
  email                 citext UNIQUE NOT NULL,
  phone                 text,
  full_name             text NOT NULL DEFAULT '',
  -- PIN 6 số bcrypt hash. Có thể NULL nếu khách chỉ đăng ký qua OAuth và
  -- chưa đặt PIN — trường hợp đó chỉ login được bằng provider tương ứng.
  pin_hash              text,
  email_verified_at     timestamptz,
  is_active             boolean NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- Liên kết Provider (Google/Apple/Email) → 1 customer. Cho phép 1 customer
-- có nhiều provider để linking. UK (provider, provider_user_id) đảm bảo 1 tài
-- khoản Google/Apple duy nhất chỉ gắn được 1 customer.
CREATE TABLE IF NOT EXISTS customer_identities (
  id                    serial PRIMARY KEY,
  customer_id           int NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
  provider              text NOT NULL CHECK (provider IN ('google', 'apple', 'email')),
  provider_user_id      text NOT NULL,
  provider_email        text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_identities_uk UNIQUE (provider, provider_user_id)
);
CREATE INDEX IF NOT EXISTS customer_identities_cust_idx ON customer_identities(customer_id);

-- OTP một lần. purpose: 'register' | 'login' | 'reset_pin' | 'change_email'.
-- Bảng viết vào rồi verify+xoá; không dùng lịch sử. Rate-limit ở app (attempts).
CREATE TABLE IF NOT EXISTS customer_otps (
  id                    serial PRIMARY KEY,
  email                 citext NOT NULL,
  code_hash             text NOT NULL,             -- bcrypt của mã 6 số
  purpose               text NOT NULL CHECK (purpose IN ('register','login','reset_pin','change_email')),
  attempts              int NOT NULL DEFAULT 0,
  expires_at            timestamptz NOT NULL,
  consumed_at           timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customer_otps_email_idx ON customer_otps(email, purpose, created_at DESC);

COMMIT;
