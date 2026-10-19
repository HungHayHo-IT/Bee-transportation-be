-- 018 — Ảnh đại diện cho tài khoản khách hàng (B-36).
--
-- Vì sao cần: CustomerMeDto chưa có trường ảnh nào, màn Hồ sơ trong app đang vẽ
-- tạm chữ cái đầu của tên. Thêm một cột để giữ URL ảnh khách tự tải lên.
--
-- Vì sao chỉ là `text` chứ không phải bảng riêng: mỗi khách đúng một ảnh đang
-- dùng, không có lịch sử, không có metadata nào cần truy vấn. Một bảng phụ ở
-- đây chỉ thêm một JOIN vào đường đọc hồ sơ — đường nóng nhất của app khách.
--
-- Vì sao nullable, KHÔNG default: NULL mang đúng nghĩa "khách chưa đặt ảnh",
-- tín hiệu để app quay về vẽ chữ cái đầu. Một URL ảnh mặc định đặt ở DB thì mọi
-- tài khoản cũ bỗng "có ảnh" và app mất luôn đường phân biệt hai ca đó.
--
-- Vì sao không lưu key mà lưu cả URL: bucket/CDN đổi tên miền là việc hiếm, còn
-- dựng URL từ key ở mỗi lần đọc thì buộc mọi chỗ đọc hồ sơ phải biết cấu hình
-- S3. URL đầy đủ để hàng dữ liệu tự nó dùng được.
--
-- KHÔNG có dữ liệu nào phải backfill: mọi dòng sẵn có nhận NULL, đúng nghĩa.
--
-- Idempotent — chạy lại nhiều lần vẫn an toàn.

BEGIN;

ALTER TABLE customer_accounts
  ADD COLUMN IF NOT EXISTS avatar_url text;

COMMENT ON COLUMN customer_accounts.avatar_url IS
  'URL cong khai anh dai dien tren S3. NULL = chua dat anh. Chi server ghi vao '
  'day, va chi tu key da ky o POST /customer-auth/me/avatar/presign — khong bao '
  'gio nhan URL tuy y tu client.';

COMMIT;
