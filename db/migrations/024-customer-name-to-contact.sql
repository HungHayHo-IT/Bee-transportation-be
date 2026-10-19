-- 024: chuyen ten dang nam o company_name sang contact_name.
--
-- Truoc migration 022, backend nhet TEN NGUOI tu form bao gia website vao
-- company_name vi cot do NOT NULL. Ket qua tren man hinh khach hang:
--
--     Ten cong ty    Le Thi Minh Chau
--     Nguoi lien he  —
--
-- Sai ca hai o. Migration 022 da sua luong di toi, con day la don du lieu cu.
--
-- Chuyen HET, khong loc: kiem tra 52 ho so tren production thi gan nhu toan bo
-- la du lieu test ("QA Paging 1..25", "QA Android", "QA Bee 17-09") xen vai ten
-- nguoi that; khong ho so nao mang ten cong ty that. Cho nen loc doan kieu "cai
-- nao trong giong ten nguoi" chi them rui ro doan sai ma khong duoc gi.
--
-- Chay lai duoc nhieu lan: dieu kien contact_name IS NULL khien lan thu hai
-- khong dung toi ho so nao ca, va TUYET DOI khong de len ten lien he ai do da
-- nhap tay sau nay.
--
-- KHONG them dong nao vao scripts/check-migrations.sql: day la mot lan don du
-- lieu cu, khong phai mot bat bien cua lieu. Kiem "moi khach deu co
-- contact_name" se do ngay khi admin tao mot khach chi co ten cong ty — dieu
-- hoan toan hop le.

BEGIN;

SET lock_timeout = '3s';

UPDATE customers
   SET contact_name = btrim(company_name),
       company_name = NULL
 WHERE contact_name IS NULL
   AND nullif(btrim(company_name), '') IS NOT NULL;

COMMIT;
