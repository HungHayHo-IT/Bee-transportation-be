-- 008 — User hệ thống để ghi createdBy cho Order sinh từ form public.
--
-- Form landing (POST /api/quote-requests) tự chuyển thành Order ngay khi khách
-- submit. Order cần createdBy != NULL — không thể để trống cột này (đổi thành
-- nullable sẽ cascade sửa cả chục chỗ đọc order.createdBy). Giải pháp gọn: một
-- user duy nhất mang tên "Khách online" với role sale, đóng vai trò đại diện
-- cho luồng public trong log/hiển thị.
--
-- password_hash cố ý là chuỗi vô nghĩa: user này KHÔNG bao giờ đăng nhập được
-- (login cần bcrypt hợp lệ). is_active = true để không bị chặn ở scope guard.
--
-- Idempotent — chạy lại chỉ giữ nguyên bản ghi cũ, không đè.

BEGIN;

INSERT INTO users (email, full_name, password_hash, roles, must_change_password, is_active)
VALUES ('public@bee.internal', 'Khách online', 'DISABLED', ARRAY['sale']::text[], false, true)
ON CONFLICT (email) DO NOTHING;

COMMIT;
