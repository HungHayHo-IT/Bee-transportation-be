-- 050 - Dich vu ten co FCL/LCL nhan DU 12 ma FCL/LCL, khong chi 4 ma.
--
-- 047/048 moi gan bon ma xuat-nhap. Nhung trong 18 ma cua OF1 co 12 ma mang
-- chu FCL hoac LCL, va PRJ "FCL/LCL, hang du an, sieu truong sieu trong" phai
-- co ca 12:
--
--   EXPORT_FCL        EXPORT_FCL_RU     EXPORT_LCL
--   IMPORT_FCL        IMPORT_FCL_RU     IMPORT_LCL
--   DOMESTIC_FCL      DOMESTIC_LCL
--   CBT_FCL           CBT_LCL
--   PORTTRANSFER_FCL  PORTTRANSFER_LCL
--
-- Sau ma KHONG mang chu do nen khong vao: EXPORT_AIR, IMPORT_AIR,
-- EXPORT_BULK_CARGO, IMPORT_BULK_CARGO, va hai ma DOMESTIC / CBT tron (hai ma
-- nay tu 049 khong con cho nao dung).
--
-- BO dieu kien "chua co dich vu con nao" cua 048: PRJ gio DA co bon ma, giu
-- dieu kien do thi chinh no lai bi loai - dung cai bay ma 047 da sap vao. Loc
-- theo TEN mot minh da du: ten cua DOM, CBT, MMT khong mang chu FCL hay LCL.
--
-- Ten dat trung voi ten o dich vu cha goc, va o ma TMS ben canh phan biet ro.
-- Mot ma nam o hai dich vu khac nhau la hop le: chi muc chong trung tinh theo
-- (service_id, tms_mode).

BEGIN;
SET lock_timeout = '3s';

INSERT INTO service_children (service_id, name, tms_mode, sort_order)
SELECT s.id, v.name, v.tms_mode, v.sort_order
FROM services s
CROSS JOIN (VALUES
  ('Xuất khẩu nguyên container (FCL)',      'EXPORT_FCL',        1),
  ('Xuất khẩu FCL – Tái sử dụng container', 'EXPORT_FCL_RU',     2),
  ('Xuất khẩu hàng lẻ (LCL)',               'EXPORT_LCL',        3),
  ('Nhập khẩu nguyên container (FCL)',      'IMPORT_FCL',        4),
  ('Nhập khẩu FCL – Tái sử dụng container', 'IMPORT_FCL_RU',     5),
  ('Nhập khẩu hàng lẻ (LCL)',               'IMPORT_LCL',        6),
  ('Nội địa nguyên container (FCL)',        'DOMESTIC_FCL',      7),
  ('Nội địa hàng lẻ (LCL)',                 'DOMESTIC_LCL',      8),
  ('Xuyên biên giới nguyên container',      'CBT_FCL',           9),
  ('Xuyên biên giới hàng lẻ',               'CBT_LCL',          10),
  ('Chuyển cảng nguyên container',          'PORTTRANSFER_FCL', 11),
  ('Chuyển cảng hàng lẻ',                   'PORTTRANSFER_LCL', 12)
) AS v(name, tms_mode, sort_order)
WHERE s.name ~* '\m(FCL|LCL)\M'
ON CONFLICT (service_id, tms_mode) WHERE tms_mode IS NOT NULL
  DO UPDATE SET sort_order = excluded.sort_order;

COMMIT;
