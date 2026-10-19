-- 030: anh dai dien hien tren landing.
--
-- Cung ho voi landing_description (migration 029) va co y dat cung tien to
-- 'landing_': day la NOI DUNG TRANG, khong phai anh ho so nhan su. Mot ngay nao
-- do cong ty muon anh the nhan vien that thi do la mot cot khac, voi quyen xem
-- khac — nham hai thu la dua anh noi bo len trang cong khai.
--
-- Luu URL chu khong luu byte: anh nam tren S3 (cung bucket voi anh bai viet va
-- anh CMS), backend chi ky URL cho trinh duyet tai thang len. Bang du lieu giu
-- mot chuoi, khong giu file.
--
-- NULL duoc: chua co anh thi landing ve chu cai dau ten nhu hien nay. Ep
-- NOT NULL DEFAULT '' thi chuoi rong va NULL cung nghia ma phai kiem hai kieu
-- o moi cho doc.
--
-- Idempotent.

BEGIN;

SET lock_timeout = '3s';

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS landing_avatar_url text;

COMMENT ON COLUMN users.landing_avatar_url IS
  'URL anh dai dien hien tren landing. NULL = chua co anh, landing ve chu cai dau ten.';

COMMIT;
