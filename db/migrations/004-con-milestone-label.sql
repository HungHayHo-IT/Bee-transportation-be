-- 004 — Sửa nhãn mốc thứ 3 của dịch vụ CON cho khớp tài liệu duyệt
-- Chạy:
--   docker compose -f docker-compose.vm.yml exec -T db \
--     psql -U beeops -d beeops -v ON_ERROR_STOP=1 -f - < db/migrations/004-con-milestone-label.sql
--
-- Mục 7 tài liệu ghi "Điều chỉnh theo phản hồi (nếu có)"; seed ban đầu rơi mất phần
-- "(nếu có)". Không đổi nghĩa nghiệp vụ — mốc nào cũng bỏ qua được kèm ghi chú —
-- nhưng nhãn trên màn hình phải đúng bản đã duyệt.
--
-- Chỉ đụng MẪU trong danh mục. Đơn đã chốt giữ snapshot riêng trong
-- order_milestones nên nhãn cũ ở đó không đổi, đúng như đặc tả F5.
--
-- Idempotent: chạy lại không làm gì thêm.

BEGIN;

UPDATE services
   SET milestones = array_replace(
         milestones, 'Điều chỉnh theo phản hồi', 'Điều chỉnh theo phản hồi (nếu có)')
 WHERE code = 'CON'
   AND 'Điều chỉnh theo phản hồi' = ANY (milestones);

COMMIT;

-- Kiểm chứng:
--   SELECT array_to_string(milestones, ' -> ') FROM services WHERE code = 'CON';
