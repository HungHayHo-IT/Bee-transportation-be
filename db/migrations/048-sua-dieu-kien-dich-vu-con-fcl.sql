-- 048 - Sua dieu kien cua 047: no bo sot chinh dich vu no nham toi.
--
-- 047 co dieu kien "s.tms_mode IS NULL" nham loai DOM va CBT ra, vi hai dich vu
-- do da co bo dich vu con soan tay. Nhung tren production PRJ DA duoc dat ma
-- cha EXPORT_FCL bang man quan tri, nen chinh PRJ bi loai - 047 chay xong
-- khong them dong nao.
--
-- Dieu kien dung la "dich vu nay da co dich vu con mang ma TMS chua", khong
-- phai "no co ma cha khong". Hai thu do khac nhau: PRJ co ma cha nhung khong
-- co dich vu con nao.
--
-- Loc theo TEN da du loai DOM/CBT/MMT (ten chung khong co chu FCL hay LCL);
-- dieu kien dich vu con chi la chot chan them.
--
-- KHONG dong vao ma cha cua PRJ. Day la gia tri nguoi dung tu dat o man quan
-- tri; migration khong lang le go thu nguoi khac vua dat.

BEGIN;
SET lock_timeout = '3s';

INSERT INTO service_children (service_id, name, tms_mode, sort_order)
SELECT s.id, v.name, v.tms_mode, v.sort_order
FROM services s
CROSS JOIN (VALUES
  ('Xuất khẩu nguyên container (FCL)', 'EXPORT_FCL', 1),
  ('Xuất khẩu hàng lẻ (LCL)',          'EXPORT_LCL', 2),
  ('Nhập khẩu nguyên container (FCL)', 'IMPORT_FCL', 3),
  ('Nhập khẩu hàng lẻ (LCL)',          'IMPORT_LCL', 4)
) AS v(name, tms_mode, sort_order)
WHERE s.name ~* '\m(FCL|LCL)\M'
  AND NOT EXISTS (
    SELECT 1 FROM service_children c
     WHERE c.service_id = s.id AND c.tms_mode IS NOT NULL)
ON CONFLICT (service_id, tms_mode) WHERE tms_mode IS NOT NULL DO NOTHING;

COMMIT;
