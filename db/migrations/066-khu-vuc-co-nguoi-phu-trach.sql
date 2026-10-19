-- 066 - Moi khu vuc co MOT TRUONG PHONG phu trach, va chi nguoi do xem duoc
--       bang gia cua khu vuc do.
--
-- Truoc do bang gia la tat ca hoac khong co gi: 060 dong lai chi con Quan tri
-- va Giam doc. Nhung mot Truong phong mien Trung thi can gia mien Trung de bao
-- khach — con gia mien Bac va mien Nam thi khong viec gi phai thay, do la toan
-- bo co cau chi phi cua Bee tren nhung tuyen ho khong chay.
--
-- Nen mo `priceList` cho vai `manager` o bac XEM, va cat du lieu theo nguoi
-- phu trach: Truong phong chi thay khu vuc minh dung ten. Admin va Giam doc
-- van thay het.
--
-- Chi mot nguoi moi khu vuc. Can nhieu nguoi thi doi thanh bang noi rieng, chu
-- khong nhet them cot manager_id_2 — khi do no la quan he nhieu-nhieu that su.
--
-- ON DELETE SET NULL: xoa mot tai khoan KHONG duoc xoa khu vuc va bang gia cua
-- no. Khu vuc khi do khong co nguoi phu trach, va chi Quan tri / Giam doc thay
-- — dung cai can xay ra khi nguoi phu trach nghi viec.
--
-- Idempotent.

BEGIN;

SET lock_timeout = '3s';

ALTER TABLE price_regions
  ADD COLUMN IF NOT EXISTS manager_id int REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS price_regions_manager_idx
  ON price_regions (manager_id) WHERE manager_id IS NOT NULL;

-- Truong phong duoc XEM bang gia. Khong phai 'edit': bang gia la mot ban, sua
-- o mot khu vuc van la sua vao phien dang ap dung cho ca cong ty.
UPDATE role_page_permissions
   SET level = 'view', updated_at = now()
 WHERE page_key = 'priceList' AND role = 'manager' AND level = 'none';

INSERT INTO role_page_permissions (role, page_key, level)
SELECT 'manager', 'priceList', 'view'
 WHERE NOT EXISTS (
   SELECT 1 FROM role_page_permissions WHERE role = 'manager' AND page_key = 'priceList');

COMMIT;

-- Kiem chung:
--   SELECT name, manager_id FROM price_regions ORDER BY sort_order;
--   SELECT role, level FROM role_page_permissions WHERE page_key = 'priceList';
