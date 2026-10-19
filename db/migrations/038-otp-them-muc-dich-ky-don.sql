-- 038: cho phep OTP mang muc dich 'sign_order'.
--
-- Luong ky dien tu dung lai dung co che OTP cua khach hang, nhung voi mot
-- `purpose` RIENG. Tach purpose chu khong muon lai 'login': hai luong chay song
-- song thi ma cua luong nay se dot ma cua luong kia — khach dang ky don ma
-- bam gui lai ma dang nhap la ma ky chet, va khong ai hieu vi sao.
--
-- Rang buoc CHECK o migration 011 liet ke bon gia tri, nen them mot luong moi
-- la phai noi rong no. Khong noi rong thi loi hien ra o tan tang Postgres,
-- giua luc khach dang cho ma — da do that: bam gui OTP tra ve 500.
--
-- Idempotent.

BEGIN;

SET lock_timeout = '3s';

ALTER TABLE customer_otps
  DROP CONSTRAINT IF EXISTS customer_otps_purpose_check;

ALTER TABLE customer_otps
  ADD CONSTRAINT customer_otps_purpose_check
  CHECK (purpose IN ('register','login','reset_pin','change_email','sign_order'));

COMMIT;
