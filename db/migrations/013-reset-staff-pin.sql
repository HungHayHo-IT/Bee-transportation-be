-- 013 — Reset staff về PIN mặc định "123456" khi bật rule PIN 6 số cho các
-- thao tác ĐẶT mật khẩu mới. Admin GIỮ NGUYÊN mật khẩu hiện tại (theo yêu cầu);
-- endpoint login cố ý nới rộng để admin login được bằng chuỗi cũ.
--
-- must_change_password = true buộc lần login đầu phải chuyển sang PIN — chỗ
-- đó rule 6 số áp dụng, nên không có đường lối vòng qua PIN.
--
-- Idempotent về schema, KHÔNG idempotent về data — chạy lại sẽ reset lại các
-- role != 'admin'. Chỉ chạy MỘT LẦN khi bật rule PIN.

BEGIN;

UPDATE users
   SET password_hash = crypt('123456', gen_salt('bf', 12)),
       must_change_password = true
 WHERE NOT ('admin' = ANY (roles));

COMMIT;

-- Sau migration:
--  - Staff (manager/sale/staff/leader): PIN "123456", bị ép đổi lần đầu.
--  - Admin: giữ nguyên mật khẩu hiện tại.
