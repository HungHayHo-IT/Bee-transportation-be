-- 028: don hang tro toi DIA DIEM dau tuyen, de tra duoc gia niem yet.
--
-- VAN DE: bang gia khoa theo (dia diem di, dia diem den, dich vu), con don
-- hang chi co origin_province / destination_province — tinh/thanh. Hai ben noi
-- hai thu khac nhau, nen khong co khoa nao de tra gia. Don biet "Da Nang ->
-- Quang Nam", bang gia noi "Kho Da Nang -> Kho Tam Ky", va mot tinh co nhieu
-- kho voi gia khac nhau — do chinh la ly do danh muc dia diem tach rieng khoi
-- danh muc 63 tinh thanh.
--
-- HAI COT MOI, ca hai NULL duoc, va do la chu y:
--
-- * Don CU khong co dia diem. Bat NOT NULL la phai bia ra mot dia diem cho
--   moi don da ton tai, tuc la bia ra du lieu.
-- * Don tu FORM CONG KHAI cung khong co: form do chi hoi ten, so dien thoai
--   va dich vu. Nguoi tiep nhan dien sau.
-- * Co chuyen hang den mot dia chi khong phai kho nao ca. Ep chon kho la ep
--   nguoi ta chon bua mot cai gan gan.
--
-- Tinh/thanh GIU NGUYEN, khong thay the: no van la thu bao cao va bo loc dang
-- chay tren, va mot dia chi giao tan noi thi tinh/thanh moi la thong tin dung.
-- Dia diem la THEM VAO de tra gia, khong phai doi cach mo ta don.
--
-- Idempotent.

BEGIN;

SET lock_timeout = '3s';

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS origin_location_id      int REFERENCES locations(id),
  ADD COLUMN IF NOT EXISTS destination_location_id int REFERENCES locations(id);

-- Tra gia cho mot don la mot lan doc theo cap dia diem. Chi muc nay phuc vu
-- chieu nguoc lai: "nhung don nao di tuyen nay" — cau hoi cua bao cao tuyen.
CREATE INDEX IF NOT EXISTS orders_location_route_idx
  ON orders (origin_location_id, destination_location_id)
  WHERE origin_location_id IS NOT NULL;

COMMENT ON COLUMN orders.origin_location_id IS
  'Dia diem dau tuyen, de tra gia niem yet. NULL = don chua khai (don cu, don tu form cong khai, hoac giao tan noi).';

COMMIT;
