-- 080 - Dieu van xem don theo DICH VU phong tich, khong theo khu vuc (16/10/2026).
--
-- Bo dau tich "Dieu van" (079). Thay vao do:
-- * Chi PHONG BAO GIA duoc chia don.
-- * Phong khac tich dich vu tren ma tran dinh tuyen = Dieu van va Truong phong
--   cua phong do XEM duoc don DA CHOT thuoc cac dich vu ay (chi xem).
-- Khu vuc bang gia khong con gan phong dieu van.
--
-- Nhan vien da doi sang vai 'dispatcher' o 079 giu nguyen.

BEGIN;
SET lock_timeout = '3s';

ALTER TABLE departments DROP CONSTRAINT IF EXISTS departments_dieu_van_khong_dich_vu;
ALTER TABLE departments DROP CONSTRAINT IF EXISTS departments_mot_loai;
ALTER TABLE departments DROP COLUMN IF EXISTS is_dispatch;
ALTER TABLE departments ADD CONSTRAINT departments_mot_loai CHECK (NOT (is_sales AND is_quoting));

ALTER TABLE price_regions DROP COLUMN IF EXISTS department_id;

COMMIT;
