-- 081 - Doi tac (Bee Logistics) tu tao yeu cau bao gia (19/10/2026).
--
-- Yeu cau cua Bee (chi Chau): khach Bee Logistics dang nhap tai khoan doi tac,
-- tu tao yeu cau; don di thang toi phong bao gia, KHONG qua buoc Sale chon gia,
-- va doi tac thay ngay gia phong ban (gia cost cua cong ty). Chot don va chuyen
-- TMS van do Sale/Admin.
--
-- Muc 'edit' chu khong phai 'full': du de POST tao don, khong DELETE duoc gi.
-- Ho so khach cua don do backend tu gan theo email cua tai khoan doi tac — xem
-- khachCuaDoiTac() trong order-customer.helper.ts.

BEGIN;
SET lock_timeout = '3s';

INSERT INTO role_page_permissions (role, page_key, level)
VALUES ('partner', 'createOrder', 'edit')
ON CONFLICT (role, page_key) DO UPDATE SET level = 'edit';

COMMIT;
