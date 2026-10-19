-- 042 - Vai tro 'partner': nguoi cua cong ty DOI TAC (Bee Logistics) dang nhap
-- vao admin de xem don cua chinh cong ty ho.
--
-- Ho KHONG phai nhan vien Bee Transportation. Pham vi du lieu la mot nhanh
-- rieng, tra ve NGAY trong ScopeService.orderWhere va khong hop voi ve nao
-- khac — xem chu thich o do.
--
-- Ho tu dang ky, va phai nhap dung ma OTP gui toi hop thu @beelogistics.com
-- thi tai khoan moi duoc tao. Khong co buoc do thi khai email gi cung vao duoc.

BEGIN;
SET lock_timeout = '3s';

-- Vai tro moi. Rang buoc cu chi liet ke nam vai tro noi bo.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_roles_ck;
ALTER TABLE users ADD CONSTRAINT users_roles_ck CHECK (
  roles <@ ARRAY['admin','leader','manager','sale','staff','partner']::text[]);

-- Muc dich OTP RIENG cho viec dang ky doi tac. Dung chung 'register' voi tai
-- khoan khach thi mot ve xin cho viec nay tieu duoc cho viec kia — ve mang
-- purpose va duoc doi chieu luc doc, nen hai viec phai hai purpose.
ALTER TABLE customer_otps DROP CONSTRAINT IF EXISTS customer_otps_purpose_check;
ALTER TABLE customer_otps ADD CONSTRAINT customer_otps_purpose_check CHECK (
  purpose IN ('register','login','reset_pin','change_email','sign_order','register_partner'));

-- Bang ma tran cung co rang buoc liet ke nam vai tro.
ALTER TABLE role_page_permissions DROP CONSTRAINT IF EXISTS role_page_permissions_role_ck;
ALTER TABLE role_page_permissions ADD CONSTRAINT role_page_permissions_role_ck
  CHECK (role IN ('admin','leader','manager','sale','staff','partner'));

-- Ma tran quyen cho vai tro moi: MO dung hai trang, con lai dong.
-- Trang nao khong co dong nao thi mucCua() tra 'none' — nhung ghi du ca hai
-- muoi sau dong de man quan tri hien day cot, va de nut "Dat lai mac dinh"
-- co cho quay ve.
INSERT INTO role_page_permissions (role, page_key, level)
SELECT 'partner', k.page_key,
       CASE WHEN k.page_key IN ('orders', 'orderDetail') THEN 'view' ELSE 'none' END
FROM (SELECT DISTINCT page_key FROM role_page_permissions) AS k
ON CONFLICT (role, page_key) DO NOTHING;

COMMIT;
