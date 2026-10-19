-- 075 - Don khach tu gui tu landing KHONG dung ten ai (13/10/2026).
--
-- Truoc day don tu form bao gia cong khai dung ten tai khoan he thong
-- public@bee.internal (008/009), vi orders.created_by bat buoc. Tai khoan do
-- hien tren man Nhan vien nhu mot Sale that; ngay 13/10 no bi xoa nham va MOI
-- yeu cau tu website nem loi, kep o 'pending'.
--
-- Gio created_by = NULL nghia la: don khach tu tao, chua Sale nao phu trach.
-- Sale bam "Nhan don" thi created_by thanh Sale do (xem don-chua-co-sale.ts).
-- Nguon don van o cot orders.source ('website').

BEGIN;
SET lock_timeout = '3s';

ALTER TABLE orders ALTER COLUMN created_by DROP NOT NULL;
COMMENT ON COLUMN orders.created_by IS
  'Sale phu trach don. NULL = don khach tu gui tu landing, chua Sale nao nhan.';

-- Don dang dung ten tai khoan he thong -> chua ai dung ten.
UPDATE orders SET created_by = NULL
 WHERE created_by IN (SELECT id FROM users WHERE email = 'public@bee.internal');

-- Go moi dau vet con tro vao tai khoan do roi xoa no.
UPDATE activity_log SET actor_id = NULL
 WHERE actor_id IN (SELECT id FROM users WHERE email = 'public@bee.internal');
DELETE FROM users WHERE email = 'public@bee.internal';

COMMIT;
