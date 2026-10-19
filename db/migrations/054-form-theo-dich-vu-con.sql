-- 054 - Hinh dang form di theo DICH VU CON, khong theo dich vu cha nua.
--
-- VAN DE: co has_domestic_destination nam o dich vu CHA va chi bat cho CBT.
-- Hai hau qua:
--
--   1. Tu migration 050, PRJ mang ca ma CBT_FCL. Don PRJ chon "Xuyen bien gioi
--      nguyen container" van bi doi "Tinh/thanh diem den" la mot tinh Viet Nam.
--   2. LOI CO SAN, khong phai do 050: MMT khong bat co nao, nen MOI don xuat
--      khau tu truoc toi gio van doi tinh/thanh Viet Nam cho diem DEN. Va he
--      thong chua bao gio co co cho diem DI, nen hang nhap khau khong co cach
--      nao khai diem di o nuoc ngoai.
--
-- Diem di/den nam trong nuoc hay khong la thuoc tinh cua PHUONG THUC VAN
-- CHUYEN, khong phai cua nhom dich vu:
--
--   EXPORT_*        di trong nuoc   den NUOC NGOAI
--   IMPORT_*        di NUOC NGOAI   den trong nuoc
--   CBT_*           di trong nuoc   den NUOC NGOAI
--   DOMESTIC_*      ca hai trong nuoc
--   PORTTRANSFER_*  ca hai trong nuoc (chuyen cang giua hai cang trong nuoc)
--
-- NULL o dich vu con = THEO DICH VU CHA. Dich vu khong chia nho (tu van, hai
-- quan, cho thue thiet bi) khong co dong con nao nen van doc co cua cha.
--
-- Them service_fields.service_child_id: o rieng gan duoc vao mot dich vu con.
-- NULL = ap dung cho ca dich vu, dung nhu truoc.

BEGIN;
SET lock_timeout = '3s';

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS has_domestic_origin boolean NOT NULL DEFAULT true;

ALTER TABLE service_children
  ADD COLUMN IF NOT EXISTS has_domestic_origin      boolean,
  ADD COLUMN IF NOT EXISTS has_domestic_destination boolean;

UPDATE service_children SET has_domestic_origin = true, has_domestic_destination = false
 WHERE tms_mode LIKE 'EXPORT%' OR tms_mode LIKE 'CBT%';

UPDATE service_children SET has_domestic_origin = false, has_domestic_destination = true
 WHERE tms_mode LIKE 'IMPORT%';

UPDATE service_children SET has_domestic_origin = true, has_domestic_destination = true
 WHERE tms_mode LIKE 'DOMESTIC%' OR tms_mode LIKE 'PORTTRANSFER%';

ALTER TABLE service_fields
  ADD COLUMN IF NOT EXISTS service_child_id int
    REFERENCES service_children(id) ON DELETE CASCADE;

-- Khoa chong trung cu la (service_id, field_key). Gio mot dich vu co the mang
-- cung mot khoa o hai tang: mot o chung cho ca dich vu, mot o rieng cua mot
-- dich vu con. Chi muc rieng cho tung tang, vi UNIQUE thuong coi hai NULL la
-- khac nhau nen mot chi muc khong chan duoc tang chung.
ALTER TABLE service_fields DROP CONSTRAINT IF EXISTS service_fields_key_uk;
CREATE UNIQUE INDEX IF NOT EXISTS service_fields_key_chung_uk
  ON service_fields (service_id, field_key) WHERE service_child_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS service_fields_key_con_uk
  ON service_fields (service_child_id, field_key) WHERE service_child_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS service_fields_con_idx
  ON service_fields (service_child_id, sort_order) WHERE service_child_id IS NOT NULL;

-- Bon o rieng cua CBT (Nuoc den, Cua khau, Chung tu qua canh, Dieu kien giao
-- hang) dang gan vao dich vu CBT. Don PRJ chon CBT_FCL cung can chung, nen
-- chep sang dung dich vu con do cua PRJ.
INSERT INTO service_fields
  (service_id, service_child_id, field_key, label, field_type, unit, options,
   is_required, sort_order, help_text, is_active)
SELECT con.service_id, con.id, f.field_key, f.label, f.field_type, f.unit, f.options,
       f.is_required, f.sort_order, f.help_text, f.is_active
  FROM service_fields f
  JOIN services s ON s.id = f.service_id AND s.code = 'CBT'
  CROSS JOIN LATERAL (
    SELECT c.id, c.service_id
      FROM service_children c
      JOIN services p ON p.id = c.service_id
     WHERE c.tms_mode LIKE 'CBT%' AND p.code <> 'CBT'
  ) con
 WHERE f.service_child_id IS NULL
   AND NOT EXISTS (
     SELECT 1 FROM service_fields x
      WHERE x.service_child_id = con.id AND x.field_key = f.field_key);

COMMIT;
