-- 057 - Sale va Pricing thoi duyet ca bang gia; chi con tra tung tuyen.
--
-- VAN DE. Bang gia niem yet la tai san: no la toan bo co cau chi phi cua Bee
-- tren moi tuyen. Hien ma tran cho `sale` va `staff` (Pricing) mo thang man
-- "Tuyen & gia" va doc het — ke ca xuat ra Excel.
--
-- Luat moi:
--   Giam doc (leader) va Truong phong (manager)  -> xem TOAN BO config gia
--   Sale, Pricing                                -> KHONG duyet danh sach;
--     chi tra duoc GIA CUA MOT TUYEN, va chi khi da du ca cap diem di/diem den
--     va bang gia that su co dong do.
--
-- Vi the tach `/route-prices/lookup` ra mot khoa trang rieng `priceLookup`.
-- Khong the de no duoi `priceList`: ha `priceList` xuong `none` thi chinh o
-- goi y gia trong man bao gia cung 403, tuc la go mot tinh nang dang dung.
-- Va khong the de no mo cho moi nguoi khong qua ma tran: ma tran phai la noi
-- DUY NHAT quyet dinh, neu khong sua ma tran xong van bi chan ma khong ai hieu
-- vi sao.
--
-- `systemSettings` la khoa trang cho man cau hinh he thong, noi dat gioi han
-- so lan tra gia mot gio. Chi Admin.
--
-- Idempotent.

BEGIN;

SET lock_timeout = '3s';

-- ---------------------------------------------------------------------
-- 1. Sale va Pricing thoi duyet bang gia
-- ---------------------------------------------------------------------
UPDATE role_page_permissions
   SET level = 'none', updated_at = now()
 WHERE page_key = 'priceList'
   AND role IN ('sale', 'staff')
   AND level IS DISTINCT FROM 'none';

-- ---------------------------------------------------------------------
-- 2. Tra gia MOT TUYEN: khoa trang rieng
-- ---------------------------------------------------------------------
-- Doi tac (Bee Logistics) KHONG co: ho xem bang gia cong bo cho ho qua
-- `priceList`, con day la duong tra theo tung cap dia diem noi bo.
INSERT INTO role_page_permissions (page_key, role, level) VALUES
  ('priceLookup', 'admin',   'view'),
  ('priceLookup', 'leader',  'view'),
  ('priceLookup', 'manager', 'view'),
  ('priceLookup', 'sale',    'view'),
  ('priceLookup', 'staff',   'view'),
  ('priceLookup', 'partner', 'none')
ON CONFLICT (role, page_key) DO NOTHING;

-- ---------------------------------------------------------------------
-- 3. Man cau hinh he thong
-- ---------------------------------------------------------------------
INSERT INTO role_page_permissions (page_key, role, level) VALUES
  ('systemSettings', 'admin',   'full'),
  ('systemSettings', 'leader',  'none'),
  ('systemSettings', 'manager', 'none'),
  ('systemSettings', 'sale',    'none'),
  ('systemSettings', 'staff',   'none'),
  ('systemSettings', 'partner', 'none')
ON CONFLICT (role, page_key) DO NOTHING;

-- ---------------------------------------------------------------------
-- 4. Gioi han so lan tra gia mot gio, moi nguoi
-- ---------------------------------------------------------------------
-- Vi sao can: Sale va Pricing khong duyet duoc danh sach nua, nhung van tra
-- duoc tung tuyen. Khong co tran thi ngoi tra lan luot tung cap dia diem la
-- dung lai ca bang gia — chi lau hon.
--
-- 60 la mot ngay lam viec binh thuong: moi don tra vai lan, mot nguoi lam vai
-- chuc don mot ngay. Sua duoc o man Cau hinh he thong.
INSERT INTO app_settings (key, value) VALUES
  ('pricing_lookup_per_hour', '60')
ON CONFLICT (key) DO NOTHING;

COMMIT;

-- Kiem chung:
--   SELECT page_key, role, level FROM role_page_permissions
--    WHERE page_key IN ('priceList','priceLookup','systemSettings')
--    ORDER BY page_key, role;
--   SELECT * FROM app_settings WHERE key = 'pricing_lookup_per_hour';
