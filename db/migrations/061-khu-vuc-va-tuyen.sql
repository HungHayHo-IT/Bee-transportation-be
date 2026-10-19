-- 061 - Khu vuc, tuyen cua khu vuc, gia theo DICH VU CON + TRONG TAI XE.
--
-- Man "Khu vuc va tuyen" (UI moi) can mot hinh dang khac han route_prices:
--
--   route_prices  (phien, diem di, diem den, don vi tinh) -> MOT con so
--   man moi       (diem di, diem den, dich vu con, trong tai) -> hai con so
--                 (mot chieu / hai chieu) + so km hai chieu
--
-- Khong nhoi vao route_prices: lam the thi service_child_id, vehicle_load,
-- round_trip_km, round_trip_price deu phai NULL duoc, va unit_code phai NULL
-- duoc — tuc la bang do khong con rang buoc nao con y nghia. Hai bang moi
-- re hon mot bang ma moi cot deu "tuy truong hop".
--
-- route_prices GIU NGUYEN: gia tham khao tren man don hang (028/055) dang doc
-- no, va phien 6 dang ap dung co 630 dong that.
--
-- KHU VUC THUOC DIA DIEM, KHONG THUOC TUYEN
--
-- UI gui kem region_id tren tung tuyen. Khong luu theo cach do: khu vuc cua
-- mot tuyen la khu vuc cua DIA DIEM NHAN, nen luu ca hai cho la hai nguon su
-- that co the lech nhau — y hệt loi "hai o chon tinh trong form don" vua sua
-- o 060. Luu MOT cho (locations.region_id) va suy ra khu vuc cua tuyen qua
-- phep join. Doi khu vuc cua mot dia diem thi moi tuyen di tu do chuyen theo,
-- va hai man hinh khong bao gio noi hai dieu khac nhau.
--
-- Hai tuyen Bac-Nam (HCM -> HN) vi the nam o khu vuc cua dau NHAN: mien Nam.
--
-- Idempotent.

BEGIN;

SET lock_timeout = '3s';

-- --------------------------------------------------------------- khu vuc
-- Admin tu them bot. Ten la khoa so sanh: hai khu vuc cung ten la mot cai
-- menu ben trai co hai dong giong nhau ma khong ai biet dong nao chua gi.
CREATE TABLE IF NOT EXISTS price_regions (
  id         serial PRIMARY KEY,
  name       text NOT NULL,
  sort_order int  NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS price_regions_name_uk
  ON price_regions (lower(btrim(name)));

INSERT INTO price_regions (name, sort_order) VALUES
  ('Miền Bắc', 1), ('Miền Trung', 2), ('Miền Nam', 3)
ON CONFLICT DO NOTHING;

-- ON DELETE SET NULL: xoa mot khu vuc KHONG duoc xoa dia diem. Dia diem con
-- nam trong bang gia cu va trong don hang cu; mat no la mat ca hai.
ALTER TABLE locations
  ADD COLUMN IF NOT EXISTS region_id int REFERENCES price_regions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS locations_region_idx
  ON locations (region_id) WHERE region_id IS NOT NULL;

-- Chia san 34 don vi hanh chinh sau sap nhap 2025 theo ba mien. Chi dien cho
-- dia diem CHUA co khu vuc, nen chay lai khong de len thay doi lam tay.
-- Admin sua lai tung dia diem duoc: day la diem khoi dau, khong phai luat.
UPDATE locations l
   SET region_id = r.id, updated_at = now()
  FROM (VALUES
    ('Hà Nội'),    ('Hải Phòng'), ('Quảng Ninh'),  ('Bắc Ninh'),   ('Hưng Yên'),
    ('Ninh Bình'), ('Phú Thọ'),   ('Thái Nguyên'), ('Lạng Sơn'),   ('Cao Bằng'),
    ('Tuyên Quang'), ('Lào Cai'), ('Lai Châu'),    ('Điện Biên'),  ('Sơn La')
  ) AS m(province)
  JOIN price_regions r ON lower(btrim(r.name)) = 'miền bắc'
 WHERE l.province = m.province AND l.region_id IS NULL;

UPDATE locations l
   SET region_id = r.id, updated_at = now()
  FROM (VALUES
    ('Thanh Hóa'), ('Nghệ An'),  ('Hà Tĩnh'),   ('Quảng Trị'), ('Huế'),
    ('Đà Nẵng'),   ('Quảng Ngãi'), ('Gia Lai'), ('Đắk Lắk'),
    ('Khánh Hòa'), ('Lâm Đồng')
  ) AS m(province)
  JOIN price_regions r ON lower(btrim(r.name)) = 'miền trung'
 WHERE l.province = m.province AND l.region_id IS NULL;

UPDATE locations l
   SET region_id = r.id, updated_at = now()
  FROM (VALUES
    ('TP. Hồ Chí Minh'), ('Đồng Nai'), ('Tây Ninh'), ('Cần Thơ'),
    ('An Giang'), ('Đồng Tháp'), ('Vĩnh Long'), ('Cà Mau')
  ) AS m(province)
  JOIN price_regions r ON lower(btrim(r.name)) = 'miền nam'
 WHERE l.province = m.province AND l.region_id IS NULL;

-- --------------------------------------------------------------- tuyen
-- Mot CAP dia diem la mot tuyen, bat ke dich vu nao chay tren no — dich vu
-- nam o bang gia ben duoi. Khong co session_id: man moi khong co o chon phien
-- nao, va mot cot luon bang mot gia tri thi no khong phai du lieu.
CREATE TABLE IF NOT EXISTS region_routes (
  id             serial PRIMARY KEY,
  origin_id      int NOT NULL REFERENCES locations(id),
  destination_id int NOT NULL REFERENCES locations(id),
  created_by     int REFERENCES users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT region_routes_khac_nhau_ck CHECK (origin_id <> destination_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS region_routes_uk
  ON region_routes (origin_id, destination_id);
CREATE INDEX IF NOT EXISTS region_routes_dest_idx ON region_routes (destination_id);

-- --------------------------------------------------------------- gia
-- MOT bang cho ca "dich vu con" lan "muc gia": khoi dich vu tren giao dien
-- khong co thuoc tinh nao ngoai cai id cua no, nen mot bang trung gian
-- region_route_services chi de giu id la mot phep join khong mua duoc gi.
-- API gom theo service_child_id luc tra ve.
--
-- Hai gia deu cho phep NULL nhung KHONG duoc cung NULL: tuyen chi chay mot
-- chieu la that, con mot dong khong co gia nao thi khong phai mot muc gia.
CREATE TABLE IF NOT EXISTS region_route_prices (
  id               serial PRIMARY KEY,
  route_id         int NOT NULL REFERENCES region_routes(id) ON DELETE CASCADE,
  service_child_id int NOT NULL REFERENCES service_children(id) ON DELETE CASCADE,
  -- Trong tai xe, don vi TAN. numeric vi bang gia that co bac 1.4T va 2.4T.
  vehicle_load     numeric(6, 2) NOT NULL,
  -- Quang duong HAI CHIEU, km. NULL = chua khai.
  round_trip_km    int,
  one_way_price    numeric(15, 0),
  round_trip_price numeric(15, 0),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT region_route_prices_load_ck CHECK (vehicle_load > 0),
  CONSTRAINT region_route_prices_km_ck
    CHECK (round_trip_km IS NULL OR round_trip_km >= 0),
  CONSTRAINT region_route_prices_duong_ck
    CHECK (coalesce(one_way_price, 0) >= 0 AND coalesce(round_trip_price, 0) >= 0),
  CONSTRAINT region_route_prices_co_gia_ck
    CHECK (one_way_price IS NOT NULL OR round_trip_price IS NOT NULL)
);
-- Mot tuyen + mot dich vu con + mot bac tai = MOT muc gia. Trung thi hai dong
-- cung noi ve cung mot thu va khong ai biet dong nao dang duoc bao cho khach.
CREATE UNIQUE INDEX IF NOT EXISTS region_route_prices_uk
  ON region_route_prices (route_id, service_child_id, vehicle_load);

COMMIT;

-- Kiem chung:
--   SELECT name, sort_order FROM price_regions ORDER BY sort_order;
--   SELECT r.name, count(*) FROM locations l
--     JOIN price_regions r ON r.id = l.region_id GROUP BY r.name;
--   SELECT count(*) FROM locations WHERE region_id IS NULL;
