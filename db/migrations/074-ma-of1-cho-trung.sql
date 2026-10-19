-- 074 - Cho phep nhieu dia diem BeeOps dung CHUNG mot ma OF1 (12/10/2026).
--
-- Thuc te mot kho/cang ben OF1 co nhieu ten goi ben BeeOps ("CANG - SAN BAY",
-- "CANG DA NANG"...). Chi muc duy nhat cua 051 chan Sale gan dung ma cho cac
-- ten goi do. Ma OF1 cung da thanh tuy chon (don thieu ma van gui dia chi chu).

BEGIN;
SET lock_timeout = '3s';
DROP INDEX IF EXISTS locations_of1_id_uk;
COMMIT;
