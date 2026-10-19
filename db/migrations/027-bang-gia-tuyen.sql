-- 027: dia diem, phien gia, va bang gia tuyen.
--
-- Ba bang, va ly do chia lam ba:
--
-- * locations — danh muc dia diem tu khai (Kho DN, Kho Tam Ky). KHONG dung
--   danh muc 63 tinh/thanh co san, vi hai cai kho trong cung mot tinh la hai
--   dau tuyen khac nhau, va gia giua chung khac nhau. Co cot province de sau
--   nay doi chieu voi origin_province/destination_province cua don.
--
-- * price_sessions — PHIEN GIA. Bang gia khong phai mot bang duy nhat song
--   mai: no doi theo quy, theo mua. Neu sua thang len dong gia cu thi hai thu
--   mat cung luc — khong tra duoc "hoi thang 6 bao khach bao nhieu", va moi
--   don da chot bong dung tro toi mot con so khac voi luc bao. Moi phien la
--   mot ban sao dong bang, don tro toi phien nao thi doc dung gia cua phien do.
--
-- * route_prices — mot dong = (phien, diem di, diem den, dich vu) -> gia.
--   Gia theo TUNG DICH VU chu khong phai mot gia cho ca tuyen: cung chang
--   DN -> Tam Ky, van chuyen noi dia va da phuong thuc khong the cung gia.
--
-- Chi MOT phien duoc 'active' tai mot thoi diem — ep bang index mot phan o
-- duoi, chu khong bang ma ung dung: hai phien cung active thi man gia niem
-- yet hien mot trong hai, va khong ai biet no chon cai nao.
--
-- Idempotent.

BEGIN;

SET lock_timeout = '3s';

-- ---------------------------------------------------------------- dia diem
CREATE TABLE IF NOT EXISTS locations (
  id         serial PRIMARY KEY,
  name       text NOT NULL,
  -- Tinh/thanh de sau nay tra gia cho don chi khai tinh, chua khai kho.
  province   text,
  address    text,
  is_active  boolean NOT NULL DEFAULT true,
  created_by int REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Ten dia diem la thu nguoi ta go tay o hai man khac nhau; trung ten la hai
-- dong khong phan biet duoc trong o chon tuyen.
CREATE UNIQUE INDEX IF NOT EXISTS locations_name_uk ON locations (lower(name));

-- ---------------------------------------------------------------- phien gia
CREATE TABLE IF NOT EXISTS price_sessions (
  id             serial PRIMARY KEY,
  name           text NOT NULL,
  -- Ngay bat dau ap dung. Khong co ngay ket thuc: phien sau ap dung la phien
  -- truoc het hieu luc, mot moc thoi gian de quen dong bo con hon hai.
  effective_from date NOT NULL,
  -- draft = dang soan, chua ai thay | active = dang ap dung | archived = da
  -- thay the, giu lai de tra cuu.
  status         text NOT NULL DEFAULT 'draft',
  note           text,
  created_by     int REFERENCES users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  activated_by   int REFERENCES users(id) ON DELETE SET NULL,
  activated_at   timestamptz,
  CONSTRAINT price_sessions_status_ck
    CHECK (status IN ('draft', 'active', 'archived'))
);

-- MOT phien active, ep o tang du lieu.
CREATE UNIQUE INDEX IF NOT EXISTS price_sessions_one_active_uk
  ON price_sessions ((status)) WHERE status = 'active';

-- ------------------------------------------------------------- gia tuyen
CREATE TABLE IF NOT EXISTS route_prices (
  id             serial PRIMARY KEY,
  session_id     int NOT NULL REFERENCES price_sessions(id) ON DELETE CASCADE,
  origin_id      int NOT NULL REFERENCES locations(id),
  destination_id int NOT NULL REFERENCES locations(id),
  service_id     int NOT NULL REFERENCES services(id),
  -- Dong, khong le. Cung kieu voi orders.final_amount de khong phai doi kieu
  -- luc doi chieu gia bao voi gia niem yet.
  price          numeric(15, 0) NOT NULL,
  note           text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  -- Di va den phai khac nhau. Mot dong DN -> DN khong co nghia gi, va no lot
  -- vao bang gia thi nguoi tra gia tuong minh tra sai.
  CONSTRAINT route_prices_khac_nhau_ck CHECK (origin_id <> destination_id),
  CONSTRAINT route_prices_duong_ck CHECK (price >= 0)
);

-- Mot tuyen mot dich vu chi co MOT gia trong mot phien. Thieu rang buoc nay
-- thi import hai lan la co hai dong gia khac nhau cho cung mot tuyen, va man
-- hinh hien cai nao la tuy thu tu doc.
CREATE UNIQUE INDEX IF NOT EXISTS route_prices_uk
  ON route_prices (session_id, origin_id, destination_id, service_id);

CREATE INDEX IF NOT EXISTS route_prices_session_idx ON route_prices (session_id);

COMMENT ON TABLE locations IS 'Danh muc dia diem dau tuyen — kho, bai, cang.';
COMMENT ON TABLE price_sessions IS
  'Phien ban cua bang gia. Chi mot phien active; phien cu giu lai de tra cuu.';
COMMENT ON TABLE route_prices IS
  'Gia mot tuyen cho mot dich vu, trong mot phien gia.';

COMMIT;
