-- 020: them trang thai 'awaiting_info' cho don sinh tu form bao gia cong khai.
--
-- Form cong khai chi hoi ten, so dien thoai va dich vu. Don nhu vay truoc day
-- duoc gan thang 'distributed' va phan cho phong ban -- phong ban mo ra khong
-- co diem di lan diem den de bao gia.
--
-- KHONG dong vao don cu: don dang o distributed/quoting giu nguyen de phong ban
-- dang lam do khong bi keo nguoc ve hang cho.

BEGIN;

-- ci-deploy.sh chay migration khi API CU van dang phuc vu. ALTER TABLE duoi day
-- lay ACCESS EXCLUSIVE tren orders: mot transaction dai tren bang do la ALTER
-- phai xep hang, va moi truy van orders den sau lai xep hang tiep sau ALTER --
-- ca API dung lai. Thua nhanh roi chay lai con hon treo.
SET lock_timeout = '3s';

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;

ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (status IN (
  'awaiting_info',
  'new','distributed','quoting','awaiting_selection','awaiting_customer',
  'closed','in_progress','completed','rejected','cancelled'));

COMMIT;
