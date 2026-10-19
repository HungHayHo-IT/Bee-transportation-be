-- 049 - Bo cot services.tms_mode: ma TMS chi con nam o DICH VU CON.
--
-- 041 dua ma TMS len chinh dich vu cha de don nao khong khai FCL/LCL van co ma
-- gui sang OF1. Thuc te no khong lam duoc viec do: luc day don,
-- tms-payload.helper.ts chi doc don.serviceChild.tmsMode va KHONG he nhin toi
-- ma cha. Nen don DOM khong chon dich vu con hien ra "DOMESTIC" tren man hinh
-- nhung day sang OF1 thi khong mang mode nao ca - man hinh noi mot dang, thu
-- gui di mot neo.
--
-- Cai ma cha that su lam duoc chi la: khien o dich vu con thanh TUY CHON. Bo no
-- di thi moi don di sang OF1 deu phai khai ro loai hang, va cai hien tren man
-- hinh dung bang cai gui di.
--
-- MAT GI: hai ma 'DOMESTIC' va 'CBT' khong con cach nao gui sang OF1. Chung
-- von da khong gui duoc (ly do o tren), nen day la ghi nhan dung su that chu
-- khong phai mat them. Muon dung lai thi them chung lam DICH VU CON.
--
-- Don CU khong doi: ma don da sinh roi, va service_child_id cua chung van nhu
-- cu. Chi don TAO MOI moi bat buoc chon dich vu con.

BEGIN;
SET lock_timeout = '3s';

DROP INDEX IF EXISTS services_tms_mode_uk;
ALTER TABLE services DROP CONSTRAINT IF EXISTS services_tms_mode_ck;
ALTER TABLE services DROP COLUMN IF EXISTS tms_mode;

COMMIT;
