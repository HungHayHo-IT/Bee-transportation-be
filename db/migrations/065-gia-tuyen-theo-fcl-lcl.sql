-- 065 - Gia tuyen khoa theo FCL/LCL, khong theo tung dich vu con.
--
-- Bang gia that cua Bee chia hai khoi: nguyen container (FCL) va hang le
-- (LCL). Mot tuyen Da Nang -> Quang Ngai cho mot cai 20DC thi gia nhu nhau,
-- bat ke don do duoc xep vao "Noi dia nguyen container" hay "Xuat khau nguyen
-- container" — ca hai deu la FCL.
--
-- Khoa theo tung dich vu con vi the de ra hai loai rac:
--
--   * man hinh in hai dong cung ghi "FCL" voi hai gia khac nhau, khong ai biet
--     dong nao dung;
--   * tra gia cho mot don phai doan xem dich vu con cua don khop voi dich vu
--     con nao trong bang — ma cau tra loi dung chi la "cung FCL thi cung gia".
--
-- `kind` suy ra theo thu tu: duoi cua ma TMS (_FCL/_LCL) -> ten dich vu con co
-- "(FCL)"/"(LCL)" -> cuoi cung la kind cua chinh DON VI TINH (20DC la FCL, xe
-- tai la LCL). Ba buoc nay phu het du lieu that; khong dong nao roi lai.
--
-- Trung sau khi gop — hai dich vu con cung FCL, cung don vi tinh, tren cung
-- mot tuyen — thi giu dong id NHO NHAT. Khong co cach chon dung nao khac, va
-- gop im lang roi de lai hai dong trung thi chi so unique se tu choi.
--
-- Idempotent.

BEGIN;

SET lock_timeout = '3s';

ALTER TABLE region_route_prices
  ADD COLUMN IF NOT EXISTS kind text;

-- Boc trong DO: chay lan hai thi cot service_child_id khong con, va mot cau
-- UPDATE nhac den cot da xoa lam hong CA giao dich — tuc la migration khong
-- con idempotent.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_name = 'region_route_prices' AND column_name = 'service_child_id')
  THEN
    EXECUTE $sql$
      UPDATE region_route_prices g
         SET kind = CASE
           WHEN c.tms_mode LIKE '%\_FCL' THEN 'FCL'
           WHEN c.tms_mode LIKE '%\_LCL' THEN 'LCL'
           WHEN c.name LIKE '%(FCL)%' THEN 'FCL'
           WHEN c.name LIKE '%(LCL)%' THEN 'LCL'
           ELSE u.kind
         END
        FROM service_children c, price_units u
       WHERE g.kind IS NULL
         AND c.id = g.service_child_id
         AND u.code = g.unit_code
    $sql$;
  END IF;
END $$;

-- Du lieu da co kind nhung bang chua co cot service_child_id (chay lai lan 2):
-- khong con gi de lam.
UPDATE region_route_prices g
   SET kind = u.kind
  FROM price_units u
 WHERE g.kind IS NULL AND u.code = g.unit_code;

-- Gop trung: giu dong co id nho nhat trong moi (tuyen, kind, don vi tinh).
DELETE FROM region_route_prices g
 WHERE EXISTS (
   SELECT 1 FROM region_route_prices k
    WHERE k.route_id = g.route_id
      AND k.kind = g.kind
      AND k.unit_code = g.unit_code
      AND k.id < g.id);

ALTER TABLE region_route_prices
  ALTER COLUMN kind SET NOT NULL;
ALTER TABLE region_route_prices
  DROP CONSTRAINT IF EXISTS region_route_prices_kind_ck;
ALTER TABLE region_route_prices
  ADD CONSTRAINT region_route_prices_kind_ck CHECK (kind IN ('FCL', 'LCL'));

DROP INDEX IF EXISTS region_route_prices_uk;
ALTER TABLE region_route_prices
  DROP COLUMN IF EXISTS service_child_id;
CREATE UNIQUE INDEX IF NOT EXISTS region_route_prices_uk
  ON region_route_prices (route_id, kind, unit_code);

COMMIT;

-- Kiem chung:
--   SELECT kind, count(*) FROM region_route_prices GROUP BY kind;
--   SELECT count(*) FROM information_schema.columns
--    WHERE table_name='region_route_prices' AND column_name='service_child_id';
