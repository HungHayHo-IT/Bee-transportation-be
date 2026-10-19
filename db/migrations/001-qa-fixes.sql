-- Migration 001 — xử lý biên bản QA từ front-end (22/08/2026).
-- Chạy trên DB đã có dữ liệu:
--   docker compose -f docker-compose.vm.yml exec -T db \
--     psql -U beeops -d beeops -v ON_ERROR_STOP=1 < db/migrations/001-qa-fixes.sql
BEGIN;

-- QA-10: lpad CẮT CỤT chuỗi dài hơn length -> lpad('1000',3,'0') = '100'.
-- Đơn thứ 1000 trong ngày của một dịch vụ sẽ sinh mã trùng đơn thứ 100.
CREATE OR REPLACE FUNCTION order_code(p_service_id int, p_day date, p_no int)
RETURNS text LANGUAGE sql STABLE AS $fn$
  SELECT s.code || '-' || to_char(p_day, 'YYYYMMDD') || '-' ||
         CASE WHEN p_no < 1000 THEN lpad(p_no::text, 3, '0') ELSE p_no::text END
  FROM services s WHERE s.id = p_service_id;
$fn$;

-- QA-11: orders.updated_at chỉ có DEFAULT now(), không bao giờ được cập nhật.
-- Trigger thay vì trông vào tầng ứng dụng nhớ set — $executeRaw đi vòng qua Prisma.
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS orders_touch_updated_at ON orders;
CREATE TRIGGER orders_touch_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- QA-12: "Việc của tôi" và thống kê khối lượng đều lọc theo assignee_id.
CREATE INDEX IF NOT EXISTS order_departments_assignee_idx
  ON order_departments (assignee_id) WHERE assignee_id IS NOT NULL;

-- QA-19: một cột close_note đang gánh ba nghiệp vụ (chốt / từ chối / hủy).
-- Front-end phải đoán ý nghĩa theo status để đặt nhãn.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS reject_note   text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancel_reason text;

-- Tách dữ liệu cũ về đúng cột theo trạng thái hiện tại.
UPDATE orders SET reject_note = close_note, close_note = NULL
  WHERE status = 'rejected' AND close_note IS NOT NULL AND reject_note IS NULL;
UPDATE orders SET cancel_reason = close_note, close_note = NULL
  WHERE status = 'cancelled' AND close_note IS NOT NULL AND cancel_reason IS NULL;

-- QA-02: tỉnh/thành đang là text tự do, DB đã lẫn 'HN' với 'Hà Nội'.
-- Chuẩn hóa các viết tắt đã lọt vào trong lúc chạy script test.
UPDATE orders SET origin_province = 'Hà Nội'    WHERE origin_province = 'HN';
UPDATE orders SET origin_province = 'Hải Phòng' WHERE origin_province = 'HP';
UPDATE orders SET destination_province = 'Hà Nội'    WHERE destination_province = 'HN';
UPDATE orders SET destination_province = 'Hải Phòng' WHERE destination_province = 'HP';

-- QA-25: hai hồ sơ cùng tên công ty làm tách đôi lịch sử đơn của một khách.
-- Không đặt UNIQUE cứng (tên công ty trùng nhau là chuyện có thật), thay vào đó
-- index này để tầng ứng dụng tra nhanh và trả 409 kèm id hồ sơ đang có.
CREATE INDEX IF NOT EXISTS customers_name_norm_idx
  ON customers (lower(btrim(company_name)));

COMMIT;

-- Kiểm tra sau khi chạy:
--   SELECT order_code(3, current_date, 1000);            -- DOM-<ngày>-1000
--   SELECT DISTINCT origin_province FROM orders;         -- không còn HN / HP
--   \d orders                                            -- có reject_note, cancel_reason
