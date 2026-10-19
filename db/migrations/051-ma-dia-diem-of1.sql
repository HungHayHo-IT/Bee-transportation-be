-- 051 - Ma dia diem trong MASTER DATA cua OF1, gan vao danh muc dia diem BeeOps.
--
-- Tai lieu OF1-TMS v1.0 muc 4: sender_location_id va receiverLocationId deu
-- BAT BUOC, kieu NUMBER, "Id o master data". Day la id ben OF1, khong phai id
-- cua BeeOps - khong the tu sinh ra, phai xin Bee Logistics danh sach kho/cang.
--
-- NULL = chua xin duoc. Don di qua dia diem do KHONG day sang OF1 duoc, va
-- man hinh se bao ro thieu cai gi thay vi de OF1 tu choi ca request.
--
-- Chi muc duy nhat de hai dia diem BeeOps khong cung tro vao mot kho ben OF1:
-- trung thi don cua dia diem nay di vao kho cua dia diem kia ma khong ai biet.

BEGIN;
SET lock_timeout = '3s';

ALTER TABLE locations ADD COLUMN IF NOT EXISTS of1_id int;

CREATE UNIQUE INDEX IF NOT EXISTS locations_of1_id_uk
  ON locations (of1_id) WHERE of1_id IS NOT NULL;

COMMENT ON COLUMN locations.of1_id IS
  'Id dia diem trong master data cua OF1-TMS. NULL = chua co, don khong day duoc.';

COMMIT;
