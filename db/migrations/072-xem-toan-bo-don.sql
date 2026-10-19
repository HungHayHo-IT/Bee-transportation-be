-- 072 - Co "Xem toan bo don (chi xem)" tren tung tai khoan.
--
-- Nguoi bao gia (Pricing) phai XEM duoc don cua moi phong thi moi bao gia cho
-- khach duoc, nhung KHONG duoc thao tac tren don cua phong khac. Vai tro co
-- dinh (admin/leader/manager/sale/staff) khong noi duoc dieu do: Pricing la
-- staff nhu moi nhan vien khac.
--
-- Lam y het co can_view_company_report: mot co cap le tren tung nguoi, Admin
-- bat tat o man Nguoi dung, doc lai tu DB moi request nen thu hoi co hieu luc
-- ngay.
--
-- Co nay CHI mo duong DOC (ScopeService.orderReadWhere). Moi thao tac ghi van
-- dung pham vi cu (orderWhere), nen bat co khong mo them quyen lam gi.
--
-- Idempotent: chay lai khong doi gi.

BEGIN;

SET lock_timeout = '3s';

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS can_view_all_orders boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN users.can_view_all_orders IS
  'Co "Xem toan bo don (chi xem)": doc duoc moi don tru don cho bo sung thong tin. Khong mo quyen ghi.';

COMMIT;
