-- 059 - Gia di theo DIA DIEM, khong theo dich vu nua.
--
-- LUAT MOI: trung cap diem di/diem den la hien gia, bat ke don do thuoc dich
-- vu nao. Cuoc van chuyen mot chang la tien cua chang duong va loai xe; no
-- khong doi vi don duoc xep vao "Van chuyen noi dia" hay "Hang du an".
--
-- Bo cot `service_id` khoi route_prices. Khoa chong trung con bon thanh phan:
--   (phien, diem di, diem den, DON VI TINH)
--
-- GOP TRUOC KHI BO. Bo cot ngay thi hai dong cua cung mot tuyen + don vi tinh
-- nhung khac dich vu tro thanh hai ban trung, va index unique khong tao duoc —
-- ca migration dung lai giua chung. Giu dong id NHO NHAT cua moi nhom.
--
-- Mat mat co that, noi thang: dich vu cua nhung dong bi gop se khong con. Do
-- la dieu phai chap nhan khi bo mot chieu khoi khoa, va cung la dieu dang muon
-- — giu lai mot cot ma khong gi doc nua thi no chi con noi doi.
--
-- Idempotent.

BEGIN;

SET lock_timeout = '3s';

-- Chay duoc nhieu lan: lan sau cot da khong con, ca khoi nay bo qua.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'route_prices' AND column_name = 'service_id'
  ) THEN
    -- Gop: giu dong id nho nhat cua moi (phien, di, den, don vi tinh).
    DELETE FROM route_prices p
     USING (
       SELECT min(id) AS giu, session_id, origin_id, destination_id, unit_code
         FROM route_prices
        GROUP BY session_id, origin_id, destination_id, unit_code
     ) g
     WHERE p.session_id = g.session_id
       AND p.origin_id = g.origin_id
       AND p.destination_id = g.destination_id
       AND p.unit_code = g.unit_code
       AND p.id <> g.giu;

    ALTER TABLE route_prices DROP CONSTRAINT IF EXISTS route_prices_service_id_fkey;
    ALTER TABLE route_prices DROP COLUMN service_id;
  END IF;
END $$;

-- Khoa moi: khong con dich vu.
DROP INDEX IF EXISTS route_prices_uk;
CREATE UNIQUE INDEX IF NOT EXISTS route_prices_uk
  ON route_prices (session_id, origin_id, destination_id, unit_code);

COMMIT;

-- Kiem chung:
--   SELECT count(*) FROM information_schema.columns
--    WHERE table_name = 'route_prices' AND column_name = 'service_id';   -- phai la 0
--   SELECT indexdef FROM pg_indexes WHERE indexname = 'route_prices_uk';
