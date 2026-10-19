-- 029: mo ta ngan cho nguoi dai dien hien tren landing.
--
-- Cot nay la NOI DUNG TRANG, khong phai ho so nhan su. Ten cot noi ro dieu do
-- ('landing_') de sau nay khong ai nham no voi mot truong ho so that su —
-- chuc danh, tieu su — thu ma phong nhan su moi la nguoi giu.
--
-- Vi sao dat tren users chu khong lam mot bang rieng: mot nguoi dai dien
-- KHONG phai mot ban ghi doc lap, no la mot tai khoan da duoc bat co
-- is_landing_representative. Bang rieng nghia la hai duong ghi cho cung mot
-- nguoi, va mot ngay nao do hai duong do noi hai thu khac nhau.
--
-- NULL duoc: nguoi chua viet mo ta van hien binh thuong, chi thieu mot dong
-- chu. Ep NOT NULL DEFAULT '' thi chuoi rong va NULL cung nghia nhung phai
-- kiem hai kieu o moi cho doc.
--
-- Idempotent.

BEGIN;

SET lock_timeout = '3s';

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS landing_description text;

COMMENT ON COLUMN users.landing_description IS
  'Mo ta ngan hien duoi ten nguoi dai dien tren landing. NULL = chua viet.';

COMMIT;
