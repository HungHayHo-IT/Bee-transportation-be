-- 055 - Dung lai bang gia tuyen: mot gia moi DON VI TINH, khong phai mot gia
-- moi tuyen.
--
-- VAN DE. route_prices dang la (phien, diem di, diem den, dich vu) -> MOT gia.
-- Bang gia that khong co hinh dang do. Doc file COSTING TRUCKING - DAD.xlsx:
--
--   Cont duong ngan   8 muc/tuyen   20'DC va 40'DC, moi loai 4 bac tai
--   LCL duong ngan    6 muc/tuyen   tai trong xe 1.4T -> 10T
--   LCL duong dai    11 muc/tuyen   CBM, Tan, 4 loai pallet, pallet vuot kho,
--                                   xe nguyen chuyen 5T/8-10T/15T
--
-- Mot cot `price` khong chua noi. Nhap file nay vao bang hien tai la mat 7/8
-- so lieu va khong con biet con so con lai la cua loai xe nao.
--
-- CACH LAM. Them mot chieu `unit_code` vao khoa. Mot dong = (phien, diem di,
-- diem den, dich vu, DON VI TINH) -> gia. Danh muc don vi tinh nam o bang
-- price_units, nen them mot loai xe moi la them MOT DONG, khong phai mot
-- migration.
--
-- FCL hay LCL doc tu `kind` cua don vi tinh, dung luat Bee dat ra: loai nao la
-- DC thi FCL, loai nao tinh theo TAN thi LCL. Hang khong (tu san bay ve) cung
-- la LCL - do la van chuyen duong bo mot dau o san bay, khong phai dich vu
-- hang khong.
--
-- DIA DIEM. `locations` da co unique tren lower(name), nhung the van lot trung:
-- trong chinh file nay co 7 cho viet hai kieu, chi khac dau cham voi dau phay
-- ('KCN CAO, HOA KHANH' va 'KCN CAO. HOA KHANH'). Doi sang khoa chuan hoa: gop
-- dau cham vao dau phay, nen khoang trang, bo dau cau o hai dau. Gop cac dong
-- da trung TRUOC khi dung khoa moi, neu khong index khong tao duoc.
--
-- VAN PHONG la thuoc tinh cua DIA DIEM chu khong phai cua gia: mot dia chi
-- thuoc vung nao thi van phong vung do phu trach. File nay la mien Trung.
--
-- Idempotent.

BEGIN;

SET lock_timeout = '3s';

-- =====================================================================
-- 1. DIA DIEM: van phong phu trach + khoa chong trung that
-- =====================================================================

ALTER TABLE locations
  ADD COLUMN IF NOT EXISTS office_code text;

COMMENT ON COLUMN locations.office_code IS
  'Van phong phu trach dia diem nay (BEEDN, BEEDAD, CHANH_HCM, CHANH_HAN...). '
  'Suy ra tu vung cua dia chi, khong phai mot chieu cua gia.';

-- Khoa chuan hoa. Bat buoc IMMUTABLE moi dung duoc trong index, nen viet thang
-- bieu thuc chu khong goi ham lower() cua citext.
CREATE OR REPLACE FUNCTION loc_name_key(p_name text) RETURNS text
  LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT btrim(
           regexp_replace(
             upper(translate(p_name, '.', ',')),
             '[[:space:]]+', ' ', 'g'),
           ' ,.-');
$$;

COMMENT ON FUNCTION loc_name_key(text) IS
  'Khoa so sanh ten dia diem. Gop dau cham vao dau phay va nen khoang trang: '
  'trong bang gia that, cung mot KCN duoc go ca hai kieu.';

-- Gop cac dia diem da trung theo khoa moi: giu dong id nho nhat, tro moi tham
-- chieu ve no, roi xoa phan con lai. Lam TRUOC khi tao index, neu khong index
-- khong dung duoc va ca migration dung lai.
CREATE TEMP TABLE gop_dia_diem ON COMMIT DROP AS
SELECT l.id AS cu,
       min(l.id) OVER (PARTITION BY loc_name_key(l.name), coalesce(l.province, '')) AS moi
  FROM locations l;

DELETE FROM gop_dia_diem WHERE cu = moi;

UPDATE route_prices rp SET origin_id = g.moi
  FROM gop_dia_diem g WHERE rp.origin_id = g.cu;
UPDATE route_prices rp SET destination_id = g.moi
  FROM gop_dia_diem g WHERE rp.destination_id = g.cu;
UPDATE orders o SET origin_location_id = g.moi
  FROM gop_dia_diem g WHERE o.origin_location_id = g.cu;
UPDATE orders o SET destination_location_id = g.moi
  FROM gop_dia_diem g WHERE o.destination_location_id = g.cu;
DELETE FROM locations WHERE id IN (SELECT cu FROM gop_dia_diem);

-- Hai dia diem cung ten o hai tinh khac nhau la hai noi khac nhau, nen khoa
-- gom ca tinh. `coalesce` vi province cho phep NULL, ma NULL trong unique
-- index thi khong chan duoc gi.
DROP INDEX IF EXISTS locations_name_uk;
CREATE UNIQUE INDEX IF NOT EXISTS locations_name_province_uk
  ON locations (loc_name_key(name), coalesce(province, ''));

-- =====================================================================
-- 2. DANH MUC DON VI TINH
-- =====================================================================

CREATE TABLE IF NOT EXISTS price_units (
  code       text PRIMARY KEY,
  label      text NOT NULL,
  -- 'FCL' | 'LCL'. Luat Bee: DC -> FCL, tinh theo Tan -> LCL.
  kind       text NOT NULL,
  sort_order int  NOT NULL DEFAULT 0,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE price_units
  DROP CONSTRAINT IF EXISTS price_units_kind_ck;
ALTER TABLE price_units
  ADD CONSTRAINT price_units_kind_ck CHECK (kind IN ('FCL', 'LCL'));

INSERT INTO price_units (code, label, kind, sort_order) VALUES
  -- Container: DC -> FCL. Bac tai lay nguyen van tu bang gia.
  ('CONT20DC_LE17T', e'20\'DC ≤ 17 tấn',  'FCL', 10),
  ('CONT20DC_LE18T', e'20\'DC ≤ 18 tấn',  'FCL', 11),
  ('CONT20DC_LE22T', e'20\'DC ≤ 22 tấn',  'FCL', 12),
  ('CONT20DC_GT22T', e'20\'DC > 22 tấn',       'FCL', 13),
  ('CONT40DC_LE16T', e'40\'DC ≤ 16 tấn',  'FCL', 20),
  ('CONT40DC_LE17T', e'40\'DC ≤ 17 tấn',  'FCL', 21),
  ('CONT40DC_LE22T', e'40\'DC ≤ 22 tấn',  'FCL', 22),
  ('CONT40DC_GT22T', e'40\'DC > 22 tấn',       'FCL', 23),

  -- Xe tai theo chuyen: tinh theo tan -> LCL.
  ('TRUCK_1T4',  'Xe 1.4T',  'LCL', 30),
  ('TRUCK_2T4',  'Xe 2.4T',  'LCL', 31),
  ('TRUCK_3T5',  'Xe 3.5T',  'LCL', 32),
  ('TRUCK_5T',   'Xe 5T',    'LCL', 33),
  ('TRUCK_7T',   'Xe 7T',    'LCL', 34),
  ('TRUCK_10T',  'Xe 10T',   'LCL', 35),

  -- Duong dai: tinh theo khoi/trong luong/pallet.
  ('CBM', e'Theo khối (CBM)', 'LCL', 40),
  ('TON', e'Theo tấn',        'LCL', 41),
  ('PALLET_STACK_LT500',
     e'Pallet tiêu chuẩn — chồng đôi, <500kg', 'LCL', 50),
  ('PALLET_STACK_600_700',
     e'Pallet tiêu chuẩn — chồng đôi, 600–700kg', 'LCL', 51),
  ('PALLET_NOSTACK',
     e'Pallet tiêu chuẩn — không chồng được', 'LCL', 52),
  ('PALLET_H19',
     e'Pallet cao trên 1m9, >800kg', 'LCL', 53),
  ('PALLET_OVERSIZE',
     e'Pallet vượt khổ / kiện dài', 'LCL', 54),

  -- Nguyen chuyen duong dai.
  ('FULL_5T_BAT',  e'Xe 5T nguyên chuyến — thùng bạt', 'LCL', 60),
  ('FULL_5T_KIN',  e'Xe 5T nguyên chuyến — thùng kín', 'LCL', 61),
  ('FULL_8_10T',   e'Xe 8T/10T nguyên chuyến',                      'LCL', 62),
  ('FULL_15T',     e'Xe 15T nguyên chuyến',                         'LCL', 63),

  -- Dong gia CU, truoc 055: khong biet la loai xe nao. Giu lai de khong mat
  -- du lieu va de man hinh noi that rang no khong xac dinh.
  ('LEGACY', e'Giá chung (dữ liệu trước 07/10/2026)', 'LCL', 99)
ON CONFLICT (code) DO NOTHING;

-- =====================================================================
-- 3. GIA TUYEN: them chieu don vi tinh
-- =====================================================================

ALTER TABLE route_prices
  ADD COLUMN IF NOT EXISTS unit_code text;

UPDATE route_prices SET unit_code = 'LEGACY' WHERE unit_code IS NULL;

ALTER TABLE route_prices
  ALTER COLUMN unit_code SET NOT NULL;

ALTER TABLE route_prices
  DROP CONSTRAINT IF EXISTS route_prices_unit_fk;
ALTER TABLE route_prices
  ADD CONSTRAINT route_prices_unit_fk
  FOREIGN KEY (unit_code) REFERENCES price_units(code);

-- Khoa chong trung moi gom ca don vi tinh. Bo khoa cu TRUOC: giu lai thi mot
-- tuyen van chi nhan duoc dung mot dong, tuc la chieu vua them vo nghia.
ALTER TABLE route_prices DROP CONSTRAINT IF EXISTS route_prices_uk;
DROP INDEX IF EXISTS route_prices_uk;
CREATE UNIQUE INDEX IF NOT EXISTS route_prices_uk
  ON route_prices (session_id, origin_id, destination_id, service_id, unit_code);

COMMIT;

-- Kiem chung:
--   SELECT kind, count(*) FROM price_units GROUP BY kind;
--   SELECT u.kind, count(*) FROM route_prices p
--     JOIN price_units u ON u.code = p.unit_code GROUP BY u.kind;
--   SELECT loc_name_key(name), coalesce(province,''), count(*)
--     FROM locations GROUP BY 1,2 HAVING count(*) > 1;   -- phai rong
