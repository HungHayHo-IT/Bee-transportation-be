-- 062 - Gia tuyen khu vuc: dung DON VI TINH co san, va km thuoc TUYEN.
--
-- Hai thay doi, deu den tu file mau nhap lieu that (pricing-template.xlsx):
--
-- 1. BAC TAI -> DON VI TINH. 061 luu `vehicle_load numeric` (so tan). Nhung
--    bang gia that co ca cot '20DC' va '40DC' — do la LOAI CONTAINER, khong
--    phai so tan, va khong co con so nao dien vao o do ma khong phai bia ra.
--    Bang price_units (055) da la dung danh muc do: 28 dong, co ca xe theo tan
--    lan container, va them mot bac moi la them MOT DONG chu khong phai mot
--    migration. Hai khai niem song song cho cung mot thu la mot khai niem thua.
--
-- 2. KM 2 CHIEU -> THUOC TUYEN, khong thuoc tung muc gia. Quang duong Da Nang
--    -> Quang Ngai khong doi theo viec cho hang bang xe 1.4T hay 20DC. Luu o
--    tung muc gia la cung mot con so chep lai 8-10 lan, va chi can mot lan go
--    lech la khong ai biet con nao dung.
--
-- KHONG co du lieu nao bi mat: hai bang nay sinh ra hom nay (061) va dang
-- rong. Neu moi truong nao do da co dong roi thi migration DUNG LAI va bao —
-- tu doi kieu cot gia la cach mat du lieu ma khong ai kip doc log.
--
-- Idempotent.

BEGIN;

SET lock_timeout = '3s';

-- Dung lai neu co du lieu that: doi vehicle_load (so) sang unit_code (ma) la
-- mot phep chuyen khong co cau tra lo i dung, 20DC khong phai mot con so tan.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM region_route_prices LIMIT 1)
     AND EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'region_route_prices' AND column_name = 'vehicle_load')
  THEN
    RAISE EXCEPTION
      'region_route_prices con % dong theo vehicle_load. Xuat ra Excel, xoa bang, chay lai migration roi nhap lai.',
      (SELECT count(*) FROM region_route_prices);
  END IF;
END $$;

-- 1. Km thuoc tuyen.
ALTER TABLE region_routes
  ADD COLUMN IF NOT EXISTS round_trip_km int;
ALTER TABLE region_routes
  DROP CONSTRAINT IF EXISTS region_routes_km_ck;
ALTER TABLE region_routes
  ADD CONSTRAINT region_routes_km_ck
  CHECK (round_trip_km IS NULL OR round_trip_km >= 0);

-- 2. Muc gia khoa theo don vi tinh.
ALTER TABLE region_route_prices
  ADD COLUMN IF NOT EXISTS unit_code text REFERENCES price_units(code);

DROP INDEX IF EXISTS region_route_prices_uk;
ALTER TABLE region_route_prices
  DROP COLUMN IF EXISTS vehicle_load,
  DROP COLUMN IF EXISTS round_trip_km;
ALTER TABLE region_route_prices
  DROP CONSTRAINT IF EXISTS region_route_prices_load_ck,
  DROP CONSTRAINT IF EXISTS region_route_prices_km_ck;

-- Bang dang rong nen dat NOT NULL duoc ngay; de NULL thi mot muc gia khong
-- thuoc don vi tinh nao van ghi duoc, va no se hien ra man hinh o mot cot
-- khong ton tai.
ALTER TABLE region_route_prices
  ALTER COLUMN unit_code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS region_route_prices_uk
  ON region_route_prices (route_id, service_child_id, unit_code);

COMMIT;

-- Kiem chung:
--   \d region_route_prices
--   SELECT count(*) FROM information_schema.columns
--    WHERE table_name='region_route_prices' AND column_name IN ('unit_code','vehicle_load');
