-- 017 — Refresh token cho nhân viên và khách hàng (B-01).
--
-- Vì sao cần: access token cứng 12h, hết hạn là đăng xuất thẳng và app mobile
-- không có đường nào tránh. Refresh token sống 30 ngày, đổi lấy access mới.
--
-- Vì sao lưu DB chứ không ký thêm một JWT dài hạn: JWT tự nó hợp lệ, không thu
-- hồi được. Có bảng thì logout, khoá tài khoản, hay phát hiện bị trộm đều cắt
-- được phiên ngay lập tức.
--
-- HAI BẢNG, cố ý không gộp một: users.id và customer_accounts.id là hai không
-- gian id tách rời (đã ghi rõ ở schema-flow, chỗ notifications). Một bảng chung
-- thì phải mang hai cột khoá ngoại nullable, DB không ép nổi "đúng một trong
-- hai" và mọi truy vấn phải tự nhớ lọc đúng loại chủ thể — đúng kiểu nhập nhằng
-- sinh ra lỗi im lặng. Hai bảng thì "refresh của khách dùng ở cổng nhân viên"
-- đơn giản là không tìm thấy dòng nào, không cần thêm một lớp kiểm nào cả.
--
-- CHỈ LƯU HASH (SHA-256), không bao giờ lưu chuỗi thô: rò DB mà có token thô
-- thì kẻ đọc được mạo danh mọi phiên đang mở. Dùng sha256 chứ không bcrypt vì
-- request refresh chỉ mang mỗi token, phải tra dòng theo chính giá trị đó —
-- bcrypt mỗi dòng một salt nên muốn so phải quét cả bảng. Token là 256 bit máy
-- sinh nên không có chuyện dò từ điển, thứ bcrypt sinh ra để chống.
--
-- Idempotent.

BEGIN;

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          serial PRIMARY KEY,
  user_id     int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- SHA-256 hex. UNIQUE vì mỗi lần refresh là một lần tra đúng cột này.
  token_hash  text NOT NULL,
  expires_at  timestamptz NOT NULL,
  -- Khác NULL = đã thu hồi. Giữ dòng lại thay vì DELETE là điều kiện để nhận ra
  -- tái sử dụng: token đã xoay vòng mà xuất hiện lần nữa nghĩa là có bản sao ở
  -- tay người khác, lúc đó thu hồi TOÀN BỘ phiên của tài khoản.
  revoked_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT refresh_tokens_hash_uk UNIQUE (token_hash)
);
-- Phục vụ "thu hồi sạch mọi phiên của một người" (nghi bị trộm / khoá tài khoản).
CREATE INDEX IF NOT EXISTS refresh_tokens_user_idx ON refresh_tokens(user_id);

CREATE TABLE IF NOT EXISTS customer_refresh_tokens (
  id           serial PRIMARY KEY,
  customer_id  int NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
  token_hash   text NOT NULL,
  expires_at   timestamptz NOT NULL,
  revoked_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT customer_refresh_tokens_hash_uk UNIQUE (token_hash)
);
CREATE INDEX IF NOT EXISTS customer_refresh_tokens_cust_idx
  ON customer_refresh_tokens(customer_id);

COMMIT;
