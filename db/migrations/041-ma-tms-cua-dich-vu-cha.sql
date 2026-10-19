-- 041 - Ma TMS cua chinh DICH VU CHA, va sap xep lai dich vu con theo ban final
-- "Danh sach dich vu logistics" 02/10/2026.
--
-- Ba cho 040 lam sai:
--
-- 1. DOMESTIC va CBT khong phai dich vu con. Chung la ma cua CHINH dich vu cha
--    (van chuyen noi dia noi chung, van tai xuyen bien gioi noi chung). Dat
--    chung thanh dich vu con thi nguoi tao don phai chon "Noi dia" ben trong
--    "Van chuyen noi dia", doc len thanh thua.
--
-- 2. PORTTRANSFER_FCL/LCL thuoc nhom qua canh & xuyen bien gioi (CBT), khong
--    phai da phuong thuc (MMT).
--
-- 3. Ten hien thi lay theo ban final. Dang chu y: _RU la "Tai su dung
--    container", KHONG phai tuyen Nga nhu 040 doan.
--
-- Vi co ma cha nen dich vu con tro thanh TUY CHON voi DOM va CBT: de trong
-- nghia la dung ma cha. Dich vu nao khong co ma cha (MMT) thi van bat buoc.

BEGIN;
SET lock_timeout = '3s';

-- Ma cua chinh dich vu cha. NULL = dich vu nay khong co ma chung.
ALTER TABLE services ADD COLUMN IF NOT EXISTS tms_mode text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'services_tms_mode_ck') THEN
    ALTER TABLE services ADD CONSTRAINT services_tms_mode_ck CHECK (
      tms_mode IS NULL OR tms_mode IN (
        'EXPORT_FCL', 'EXPORT_FCL_RU', 'EXPORT_LCL', 'EXPORT_AIR', 'EXPORT_BULK_CARGO',
        'IMPORT_FCL', 'IMPORT_FCL_RU', 'IMPORT_LCL', 'IMPORT_AIR', 'IMPORT_BULK_CARGO',
        'DOMESTIC', 'DOMESTIC_FCL', 'DOMESTIC_LCL',
        'CBT', 'CBT_FCL', 'CBT_LCL',
        'PORTTRANSFER_FCL', 'PORTTRANSFER_LCL'));
  END IF;
END $$;

-- Mot ma chi lam ma cha cua dung mot dich vu.
CREATE UNIQUE INDEX IF NOT EXISTS services_tms_mode_uk
  ON services (tms_mode) WHERE tms_mode IS NOT NULL;

UPDATE services SET tms_mode = 'DOMESTIC' WHERE code = 'DOM' AND tms_mode IS DISTINCT FROM 'DOMESTIC';
UPDATE services SET tms_mode = 'CBT'      WHERE code = 'CBT' AND tms_mode IS DISTINCT FROM 'CBT';

-- Ten MMT theo ban final: no gom ca duong hang khong va duong bien, khong chi
-- bo/thuy nhu ten cu.
UPDATE services SET name = 'Vận tải đa phương thức (Hàng không / Bộ / Biển)'
WHERE code = 'MMT' AND name <> 'Vận tải đa phương thức (Hàng không / Bộ / Biển)';

-- Hai dong nay da len ma cha, khong con la dich vu con. Chi xoa khi chua don
-- nao tro vao — con don thi de lai, khoa ngoai RESTRICT se chan va ta can biet.
DELETE FROM service_children c
WHERE c.tms_mode IN ('DOMESTIC', 'CBT')
  AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.service_child_id = c.id);

-- Doi cha cho PORTTRANSFER TRUOC khi them dong moi: chi muc duy nhat
-- (service_id, tms_mode) se chan UPDATE neu CBT da co san hai ma do. Doi cha
-- dong cu chu khong them dong moi vi don da tro vao id cu phai theo sang.
UPDATE service_children c
SET service_id = (SELECT id FROM services WHERE code = 'CBT'),
    sort_order = CASE c.tms_mode WHEN 'PORTTRANSFER_FCL' THEN 3 ELSE 4 END
WHERE c.tms_mode IN ('PORTTRANSFER_FCL', 'PORTTRANSFER_LCL')
  AND c.service_id = (SELECT id FROM services WHERE code = 'MMT');

-- Dat lai ten toan bo theo ban final.
INSERT INTO service_children (service_id, name, tms_mode, sort_order)
SELECT s.id, v.name, v.tms_mode, v.sort_order
FROM (VALUES
  ('DOM', 'Nội địa nguyên container (FCL)',          'DOMESTIC_FCL',      1),
  ('DOM', 'Nội địa hàng lẻ (LCL)',                   'DOMESTIC_LCL',      2),

  ('MMT', 'Xuất khẩu nguyên container (FCL)',        'EXPORT_FCL',        1),
  ('MMT', 'Xuất khẩu FCL – Tái sử dụng container',   'EXPORT_FCL_RU',     2),
  ('MMT', 'Xuất khẩu hàng lẻ (LCL)',                 'EXPORT_LCL',        3),
  ('MMT', 'Xuất khẩu đường hàng không',              'EXPORT_AIR',        4),
  ('MMT', 'Xuất khẩu hàng rời / hàng dự án',         'EXPORT_BULK_CARGO', 5),
  ('MMT', 'Nhập khẩu nguyên container (FCL)',        'IMPORT_FCL',        6),
  ('MMT', 'Nhập khẩu FCL – Tái sử dụng container',   'IMPORT_FCL_RU',     7),
  ('MMT', 'Nhập khẩu hàng lẻ (LCL)',                 'IMPORT_LCL',        8),
  ('MMT', 'Nhập khẩu đường hàng không',              'IMPORT_AIR',        9),
  ('MMT', 'Nhập khẩu hàng rời / hàng dự án',         'IMPORT_BULK_CARGO', 10),

  ('CBT', 'Xuyên biên giới nguyên container',        'CBT_FCL',           1),
  ('CBT', 'Xuyên biên giới hàng lẻ',                 'CBT_LCL',           2),
  ('CBT', 'Chuyển cảng nguyên container',            'PORTTRANSFER_FCL',  3),
  ('CBT', 'Chuyển cảng hàng lẻ',                     'PORTTRANSFER_LCL',  4)
) AS v(ma_cha, name, tms_mode, sort_order)
JOIN services s ON s.code = v.ma_cha
ON CONFLICT (service_id, tms_mode) WHERE tms_mode IS NOT NULL
  DO UPDATE SET name = excluded.name, sort_order = excluded.sort_order;

COMMIT;
