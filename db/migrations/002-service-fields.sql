-- 002 — Trường nhập riêng theo từng dịch vụ (F1 mở rộng)
-- Chạy:
--   docker compose -f docker-compose.vm.yml exec -T db \
--     psql -U beeops -d beeops -v ON_ERROR_STOP=1 -f - < db/migrations/002-service-fields.sql
--
-- Bài toán: form tạo đơn dùng CHUNG một khối "Thông số hàng hóa" cho cả 10 dịch vụ,
-- nên đơn hải quan phải nhìn ô "Thể tích (CBM)" còn đơn cho thuê thiết bị không có
-- chỗ nào ghi ngày thuê. Sau migration này mỗi dịch vụ tự khai bộ ô nhập của mình,
-- Admin sửa được trong danh mục mà không cần dev.
--
-- Idempotent: chạy lại không hỏng dữ liệu.

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Bộ trường riêng của từng dịch vụ
-- ---------------------------------------------------------------------
-- Một dòng = một ô nhập. Xóa dịch vụ thì trường theo luôn (ON DELETE CASCADE);
-- KHÔNG cascade sang orders.service_data — đơn cũ giữ nguyên giá trị đã nhập,
-- vì báo cáo và phiếu xác nhận đã in vẫn phải đọc lại được.
CREATE TABLE IF NOT EXISTS service_fields (
  id          serial PRIMARY KEY,
  service_id  int  NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  -- Khóa trong orders.service_data. snake_case, không đổi sau khi đã có đơn dùng.
  field_key   text NOT NULL CHECK (field_key ~ '^[a-z][a-z0-9_]{0,49}$'),
  label       text NOT NULL,
  field_type  text NOT NULL CHECK (field_type IN ('text','number','select','date','boolean')),
  unit        text,                                  -- hiện trong ô nhập: kg, tấn, m, chiếc
  -- Chỉ dùng cho field_type='select'. Rỗng với các kiểu khác.
  options     text[] NOT NULL DEFAULT '{}',
  is_required boolean NOT NULL DEFAULT false,
  sort_order  int     NOT NULL DEFAULT 0,
  help_text   text,
  -- Ngừng dùng thay cho xóa: đơn cũ vẫn hiển thị được nhãn của trường.
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_fields_key_uk UNIQUE (service_id, field_key),
  -- select mà không có lựa chọn nào thì render ra một dropdown rỗng, không nhập được.
  CONSTRAINT service_fields_select_ck CHECK (
    field_type <> 'select' OR cardinality(options) > 0)
);

CREATE INDEX IF NOT EXISTS service_fields_service_idx
  ON service_fields (service_id, sort_order);

-- ---------------------------------------------------------------------
-- 2. Dịch vụ nào dùng những ô "Thông số hàng hóa" chung nào
-- ---------------------------------------------------------------------
-- Bảy cột số của orders VẪN là cột thật — đơn giá tham khảo (F3), bộ lọc và
-- dashboard khớp trên chúng, đưa xuống JSONB là phải viết lại cả ba. Cột này chỉ
-- quyết định ô nào HIỆN trên form của dịch vụ đó.
-- Giá trị là tên trường ở tầng API (camelCase), không phải tên cột.
ALTER TABLE services ADD COLUMN IF NOT EXISTS cargo_fields text[] NOT NULL
  DEFAULT ARRAY['weightKg','volumeCbm','packageCount','containerType','dimLM','dimWM','dimHM'];

ALTER TABLE services DROP CONSTRAINT IF EXISTS services_cargo_fields_ck;
ALTER TABLE services ADD CONSTRAINT services_cargo_fields_ck CHECK (
  cargo_fields <@ ARRAY[
    'weightKg','volumeCbm','packageCount','containerType','dimLM','dimWM','dimHM']::text[]);

-- ---------------------------------------------------------------------
-- 3. Giá trị người dùng nhập cho các trường riêng
-- ---------------------------------------------------------------------
-- { "declaration_type": "Nhập kinh doanh", "hs_code": "8471.30", "doc_ready": true }
-- Kiểu JSON đúng theo field_type: number -> number, boolean -> boolean, còn lại string.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS service_data jsonb NOT NULL DEFAULT '{}';

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_service_data_ck;
ALTER TABLE orders ADD CONSTRAINT orders_service_data_ck
  CHECK (jsonb_typeof(service_data) = 'object');

-- jsonb_path_ops: chỉ phục vụ toán tử @> — đúng cái bộ lọc "đơn nào có
-- declaration_type = X" cần, và index nhỏ hơn hẳn GIN mặc định.
CREATE INDEX IF NOT EXISTS orders_service_data_idx
  ON orders USING gin (service_data jsonb_path_ops);

COMMIT;

-- Kiểm chứng sau khi chạy:
--   \d service_fields
--   SELECT code, cargo_fields FROM services ORDER BY sort_order;
--   SELECT count(*) FROM orders WHERE service_data = '{}';
