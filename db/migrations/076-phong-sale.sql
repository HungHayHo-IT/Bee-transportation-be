-- 076 - Phong SALE (14/10/2026).
--
-- Danh dau tren Ma tran dinh tuyen: phong do la phong kinh doanh. Sale cua
-- phong tao duoc don moi dich vu (tao don von khong gioi han theo phong),
-- nhung phong KHONG tham gia bao gia: khong duoc phan don, khong nhan chuyen
-- phong, khong duoc them lam phong phu trach.
--
-- Phong sale khong giu dich vu nao trong service_ids — CHECK chot o day, de
-- moi cau truy van phan phoi ("phong nao co dich vu X") tu nhien bo qua no ma
-- khong noi nao phai nho them dieu kien.

BEGIN;
SET lock_timeout = '3s';

ALTER TABLE departments ADD COLUMN IF NOT EXISTS is_sales boolean NOT NULL DEFAULT false;

ALTER TABLE departments DROP CONSTRAINT IF EXISTS departments_sale_khong_dich_vu;
ALTER TABLE departments ADD CONSTRAINT departments_sale_khong_dich_vu
  CHECK (NOT is_sales OR cardinality(service_ids) = 0);

COMMENT ON COLUMN departments.is_sales IS
  'Phong kinh doanh: Sale tao don moi dich vu, phong khong tham gia bao gia.';

COMMIT;
