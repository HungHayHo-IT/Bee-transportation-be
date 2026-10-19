-- 046 - Ma don lay tien to tu ma TMS thay vi ma dich vu cha.
--
--   EXPORT_FCL       -> E_FCL_20261006_001
--   IMPORT_LCL       -> I_LCL_20261006_001
--   PORTTRANSFER_FCL -> P_FCL_20261006_001
--   DOMESTIC         -> D_20261006_001
--
-- Don KHONG co ma TMS giu nguyen kieu cu: BRK-20261006-001. Tam trong muoi mot
-- dich vu cua Bee (tu van, hai quan, du an, dong goi, nang ha...) khong nam
-- trong OF1-TMS, doi ma cua chung la doi thu khong ai yeu cau va lam vo nhung
-- ma don da in tren hop dong. Dau phan cach cung khac nhau (_ voi -) nen nhin
-- ma la biet don do co di sang OF1 hay khong.
--
-- code_prefix la COT THAT chu khong phai tinh lai moi lan: so thu tu trong
-- ngay dem theo tien to, nen cau dem phai loc duoc theo no bang index. Tinh
-- lai thi moi lan tao don phai join service_children cho ca ngay hom do.

BEGIN;
SET lock_timeout = '3s';

ALTER TABLE orders ADD COLUMN IF NOT EXISTS code_prefix text;

-- Don cu: tien to la phan truoc dau '-' dau tien cua ma. Khong don nao dung
-- dau '_' truoc migration nay nen split_part an toan.
UPDATE orders SET code_prefix = split_part(code, '-', 1) WHERE code_prefix IS NULL;
ALTER TABLE orders ALTER COLUMN code_prefix SET NOT NULL;

-- Rang buoc chong trung PHAI doi theo. Dich vu MMT mang muoi hai ma TMS; dem
-- rieng tung ma thi E_FCL va I_LCL cung ra so 1 trong mot ngay, va khoa cu
-- (service_id, order_day, daily_no) se chan ngay don thu hai hop le.
DROP INDEX IF EXISTS orders_daily_no_uk;
CREATE UNIQUE INDEX IF NOT EXISTS orders_daily_no_uk ON orders (code_prefix, order_day, daily_no);
CREATE INDEX IF NOT EXISTS orders_prefix_day_idx ON orders (code_prefix, order_day);

-- Hai ham cu nhan service_id; ban moi nhan tien to. Kieu tham so khac nhau nen
-- Postgres se GIU CA HAI nhu hai ham nap chong neu khong xoa tay, va cho goi
-- nao con sot lai van chay ban cu mot cach im lang.
DROP FUNCTION IF EXISTS next_daily_no(int, date);
DROP FUNCTION IF EXISTS order_code(int, date, int);

CREATE OR REPLACE FUNCTION next_daily_no(p_prefix text, p_day date DEFAULT current_date)
RETURNS int LANGUAGE plpgsql AS $fn$
DECLARE v_no int;
BEGIN
  -- Khoa theo (tien to, ngay) nen 2 sale tao don cung loai cung luc khong
  -- trung so; khoa tu nha khi transaction ket thuc, rollback khong lam nhay so.
  PERFORM pg_advisory_xact_lock(hashtext(p_prefix || '|' || p_day::text));
  SELECT COALESCE(max(daily_no), 0) + 1 INTO v_no
    FROM orders WHERE code_prefix = p_prefix AND order_day = p_day;
  RETURN v_no;
END $fn$;

-- lpad CAT CUT chuoi dai hon length: lpad('1000',3,'0') = '100'. Khong co nhanh
-- CASE thi don thu 1000 trong ngay se sinh ma trung don thu 100.
CREATE OR REPLACE FUNCTION order_code(p_prefix text, p_sep text, p_day date, p_no int)
RETURNS text LANGUAGE sql IMMUTABLE AS $fn$
  SELECT p_prefix || p_sep || to_char(p_day, 'YYYYMMDD') || p_sep ||
         CASE WHEN p_no < 1000 THEN lpad(p_no::text, 3, '0') ELSE p_no::text END;
$fn$;

COMMIT;
