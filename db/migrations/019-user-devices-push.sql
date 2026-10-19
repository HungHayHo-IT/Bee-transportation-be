-- 019 — Push FCM cho NHÂN VIÊN (nửa sau B-04).
--
-- Vì sao cần: nhân viên mới chỉ có SSE /notifications/stream. Luồng đó chết ngay
-- khi app bị kill hoặc máy vào Doze, nên "đơn mới" và "quá hạn SLA" chỉ tới được
-- người đang mở sẵn màn hình. Khách hàng đã có đường push đầy đủ từ 014/015;
-- đây là đường tương đương cho phía nội bộ.
--
-- Vì sao BẢNG RIÊNG chứ không thêm user_id nullable vào customer_devices: hai
-- cột FK nullable trên cùng một bảng thì mọi truy vấn phải tự nhớ lọc thêm vế
-- "cột kia IS NULL", đúng cái bẫy đã phải vá ở migration 016. Một bảng một chủ
-- sở hữu, FK NOT NULL, không có ca nhập nhằng nào để quên.

BEGIN;

CREATE TABLE IF NOT EXISTS user_devices (
  id            serial PRIMARY KEY,
  user_id       int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fcm_token     text NOT NULL,
  platform      text NOT NULL CHECK (platform IN ('web','android','ios')),
  -- Cập nhật mỗi lần app gọi lại POST /notifications/devices. Dùng để dọn thiết
  -- bị bỏ hoang sau này, khi token chưa kịp chết hẳn phía Firebase.
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),

  -- UNIQUE trên token MỘT MÌNH, giống hệt customer_devices và vì đúng lý do đó:
  -- một token = một bản cài app trên một máy. Nhân viên A đăng xuất rồi nhân
  -- viên B đăng nhập trên cùng máy thì Firebase trả lại đúng token cũ; unique
  -- theo cặp (user_id, fcm_token) sẽ để lại hai dòng và máy đó nhận thông báo
  -- nội bộ của cả hai người.
  CONSTRAINT user_devices_token_uk UNIQUE (fcm_token)
);

CREATE INDEX IF NOT EXISTS user_devices_user_idx ON user_devices(user_id);

-- Đối xứng với customer_accounts.push_off. Không có cột này thì nhân viên bị dội
-- push mà không có đường tắt: users.email_off chỉ tắt kênh email, tắt nhầm ở đó
-- sẽ mất luôn bản email của cùng sự kiện.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS push_off text[] NOT NULL DEFAULT '{}';

-- Mở rộng vị từ của notifications_push_idx — CÙNG BÀI HỌC VỚI 016, chiều ngược lại.
--
-- Index cũ có vị từ `pushed_at IS NULL AND user_id IS NULL` vì claim() cố ý chỉ
-- lấy dòng của khách. Từ bản này claim() phục vụ cả hai loại chủ thể nên câu
-- WHERE chỉ còn `pushed_at IS NULL`. Postgres chỉ dùng được partial index khi vị
-- từ của index được SUY RA từ câu WHERE; `pushed_at IS NULL` KHÔNG suy ra được
-- `user_id IS NULL`, nên giữ nguyên index cũ là cron push tụt về seq scan toàn
-- bảng notifications mỗi 30 giây.
--
-- Index mới KHÔNG phình theo tổng số thông báo: pushed_at được đóng dấu ngay
-- trong transaction claim, nên tập dòng thoả vị từ luôn tự rút về gần rỗng.
DROP INDEX IF EXISTS notifications_push_idx;
CREATE INDEX IF NOT EXISTS notifications_push_idx ON notifications (created_at)
  WHERE pushed_at IS NULL;

COMMIT;
