-- 047 - Dich vu nao mang chu FCL/LCL trong TEN thi duoc gan dich vu con FCL/LCL.
--
-- Hien chi co PRJ "FCL/LCL, hang du an, sieu truong sieu trong". No la dich vu
-- VAN CHUYEN nhung khong mang ma TMS nao, nen don cua no khong day sang OF1
-- duoc va ma don van la PRJ-<ngay>-<stt> thay vi E_FCL_<ngay>_<stt>.
--
-- Viet theo TEN chu khong viet cung 'PRJ': them dich vu moi co chu FCL trong
-- ten thi chay lai file nay la xong, khong phai soan migration khac.
--
-- Bon ma chu khong phai hai: OF1 can biet CHIEU hang (muc 5 tai lieu v1.0).
-- 'FCL' mot minh khong phai ma hop le - EXPORT_FCL va IMPORT_FCL moi la.
--
-- CHU Y HE QUA: dich vu co dich vu con ma KHONG co ma cha thi BeeOps bat buoc
-- phai chon dich vu con luc tao don (dich-vu-con.helper.ts). Sau migration nay
-- tao don PRJ ma bo trong se bi tu choi, giong MMT hien gio.

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
-- \m \M la bien gioi TU cua Postgres: khop "FCL/LCL" va "hang FCL", khong khop
-- mot chuoi dai ngau nhien co ba chu do dinh lien chu khac.
WHERE s.name ~* '\m(FCL|LCL)\M'
  -- Dich vu da mang ma cha (DOM, CBT) thi dich vu con cua no da duoc soan tay
  -- theo ban final 02/10 - khong chen de len.
  AND s.tms_mode IS NULL
  -- Dich vu da co bo dich vu con mang ma TMS (MMT) cung vay.
  AND NOT EXISTS (
    SELECT 1 FROM service_children c
     WHERE c.service_id = s.id AND c.tms_mode IS NOT NULL)
ON CONFLICT (service_id, tms_mode) WHERE tms_mode IS NOT NULL DO NOTHING;

COMMIT;
