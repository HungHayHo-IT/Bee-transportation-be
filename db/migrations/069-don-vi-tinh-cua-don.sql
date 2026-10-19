-- 069 - Don vi tinh cua so luong tren don hang.
--
-- Contract OF1-TMS v1.3 muc 5.3: co `quantity` thi BAT BUOC `quantityUnit`,
-- thieu la OF1 tu choi NGUYEN request. Truoc migration nay BeeOps gui cung mot
-- gia tri 'PK' (Package) cho moi don, vi o cua ta ten la "So kien / container"
-- nen von da dem kien.
--
-- Dung voi phan lon don, nhung sai voi hang tinh theo pallet, cuon, bao hay
-- tan. Cot nay cho nguoi nhap chon dung don vi that.
--
-- KHONG dat gia tri mac dinh o CSDL: null = "chua ai khai", khac han voi "da
-- chon PK". Lop ung dung moi roi ve PK luc day di, va no biet minh dang roi
-- ve. Dat DEFAULT o day thi mai mai khong phan biet duoc hai chuyen do.
--
-- Danh muc 171 don vi nam trong ma nguon (src/common/reference/quantity-units.ts),
-- khong tao bang: no la du lieu cua BEN KIA, doi theo nhip cua ho.
--
-- Idempotent: chay lai khong doi gi.

BEGIN;

SET lock_timeout = '3s';

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS quantity_unit varchar(20);

COMMENT ON COLUMN orders.quantity_unit IS
  'Ma don vi tinh cua package_count khi day sang OF1-TMS (danh muc 171 ma do Bee cap). NULL = chua khai, lop ung dung roi ve PK.';

COMMIT;

-- Kiem chung:
--   SELECT count(*) = 1 FROM information_schema.columns
--    WHERE table_name = 'orders' AND column_name = 'quantity_unit';
