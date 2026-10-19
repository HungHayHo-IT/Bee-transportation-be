-- 016 — Thu hẹp notifications_outbox_idx về đúng dòng của NHÂN VIÊN.
--
-- Từ migration 015, bảng notifications chứa cả thông báo của khách hàng
-- (user_id IS NULL). Dòng của khách không bao giờ đi kênh email nên emailed_at ở
-- null vĩnh viễn, mà index cũ chỉ lọc `emailed_at IS NULL` — nên chúng nằm lại
-- trong index mãi mãi và index phình theo tổng số thông báo khách.
--
-- Tệ hơn: index sắp theo created_at và cron email quét từ cũ nhất, nên mỗi vòng
-- phải đi qua một tiền tố ngày càng dài toàn dòng không bao giờ gửi được trước
-- khi gom đủ 50 dòng nhân viên.
--
-- Thêm `user_id IS NOT NULL` vào vị từ. Điều kiện cùng tên đã có sẵn trong câu
-- WHERE của flushEmails, nhờ đó planner dùng được index này.
--
-- Idempotent: DROP IF EXISTS rồi tạo lại.

BEGIN;

DROP INDEX IF EXISTS notifications_outbox_idx;
CREATE INDEX IF NOT EXISTS notifications_outbox_idx ON notifications (created_at)
  WHERE emailed_at IS NULL AND user_id IS NOT NULL;

COMMIT;
