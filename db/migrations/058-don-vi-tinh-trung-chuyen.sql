-- 058 - Hai don vi tinh cua khoi TRUNG CHUYEN trong bang gia duong dai.
--
-- Hai sheet LCL duong dai co mot khoi "TRUNG CHUYEN" dung bac tai KHAC voi
-- bang duong ngan:
--
--   duong ngan     1.4T  2.4T  3.5T  5T  7T  10T
--   trung chuyen   1.4T  2-3T  3.5T  5T  7T  MAX
--
-- '2.4T' va '2-3T' la hai bac khac nhau trong chinh bang gia cua Bee, nen gop
-- chung lam mot la bia ra mot con so khong co trong file. 'MAX' cung vay: no
-- la xe lon nhat chay duoc tuyen do, khong phai 10T.
--
-- Them MOT DONG moi don vi — do dung la diem cua bang price_units (055).
--
-- Idempotent.

BEGIN;

SET lock_timeout = '3s';

INSERT INTO price_units (code, label, kind, sort_order) VALUES
  ('TRUCK_2_3T', e'Xe 2–3T', 'LCL', 36),
  ('TRUCK_MAX',  e'Xe MAX (thùng kín)', 'LCL', 37)
ON CONFLICT (code) DO NOTHING;

COMMIT;

-- Kiem chung:
--   SELECT code, label, kind FROM price_units
--    WHERE code IN ('TRUCK_2_3T','TRUCK_MAX');
