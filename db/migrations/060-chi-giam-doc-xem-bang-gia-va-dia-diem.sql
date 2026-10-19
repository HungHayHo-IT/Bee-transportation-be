-- 060 - Bang gia va danh muc dia diem: chi Quan tri he thong va Giam doc.
--
-- LUAT MOI (thay cho 056 va mot nua cua 057):
--   Quan tri he thong (admin), Giam doc (leader)  -> vao duoc "Tuyen & gia"
--                                                    va "Dia diem"
--   Truong phong (manager), Sale, Pricing (staff) -> KHONG vao ca hai man
--
-- VI SAO KEM CA DANH MUC DIA DIEM. Dia diem la HAI DAU cua moi tuyen gia. Doc
-- het danh muc la doc duoc hinh dang mang luoi cua Bee — Bee di nhung dau,
-- nhieu diem o dau — ngay ca khi khong thay mot con so nao. Giau bang gia ma
-- de ngo danh muc thi chi giau duoc mot nua.
--
-- VI SAO SALE VAN NHAP DON DUOC. GET /locations chuyen sang khoa trang
-- `priceLookup` (xem locations.controller.ts). O chon dia chi trong form don
-- la DAU VAO cua goi y gia; chan no la go luon tinh nang goi y, thu ma 057 da
-- co cong giu lai. Cai Sale mat la nut "Them dia chi moi" ngay trong o chon —
-- tu nay dia chi moi do Quan tri hoac Giam doc them.
--
-- Truong phong tu 'view' xuong 'none' tren CA HAI: day la thay doi so voi
-- gach dau dong so 5 luc dau ("Giam doc + truong phong kinh doanh xem toan bo
-- config gia"), va la quyet dinh duoc chot lai ngay 07/10/2026.
--
-- KHONG dong toi vai 'partner': ho co priceList = 'view' de xem phien gia
-- cong bo rieng cho ho, va priceLocations = 'none' san roi.
--
-- Idempotent.

BEGIN;

SET lock_timeout = '3s';

-- ---------------------------------------------------------------------
-- 1. "Tuyen & gia": bo Truong phong
-- ---------------------------------------------------------------------
UPDATE role_page_permissions
   SET level = 'none', updated_at = now()
 WHERE page_key = 'priceList'
   AND role = 'manager'
   AND level IS DISTINCT FROM 'none';

-- ---------------------------------------------------------------------
-- 2. "Dia diem": bo Truong phong, Sale va Pricing
-- ---------------------------------------------------------------------
UPDATE role_page_permissions
   SET level = 'none', updated_at = now()
 WHERE page_key = 'priceLocations'
   AND role IN ('manager', 'sale', 'staff')
   AND level IS DISTINCT FROM 'none';

COMMIT;

-- Kiem chung:
--   SELECT page_key, role, level FROM role_page_permissions
--    WHERE page_key IN ('priceList','priceLocations','priceLookup')
--    ORDER BY page_key, role;
--   -- priceLookup phai con 'view' cho sale/staff/manager: do la duong
--   -- /locations va /route-prices/lookup di qua.
