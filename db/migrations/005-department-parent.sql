-- 005 — Cây phòng ban: thêm parent_id để vẽ sơ đồ tổ chức nhiều tầng
-- Chạy:
--   docker compose -f docker-compose.vm.yml exec -T db \
--     psql -U beeops -d beeops -v ON_ERROR_STOP=1 -f - < db/migrations/005-department-parent.sql
--
-- departments trước nay là bảng phẳng: chỉ có manager_id trỏ tới một user. Doanh
-- nghiệp có nhiều khối (Ban -> Phòng -> Tổ) nhưng cấu trúc đó không nằm ở đâu cả.
--
-- Cột cho phép NULL nên mọi phòng đang có đều thành GỐC sau khi chạy — không đơn
-- nào, không định tuyến nào đổi nghĩa. FK ON DELETE SET NULL: xoá phòng cha thì
-- phòng con nổi lên thành gốc thay vì bị xoá lây.
--
-- Chống chu trình làm ở tầng service (department-tree.helper.ts), không phải ở DB:
-- Postgres không có ràng buộc kiểm tra được điều đó mà không cần trigger đệ quy.
--
-- Idempotent: chạy lại không làm gì thêm.

BEGIN;

ALTER TABLE departments ADD COLUMN IF NOT EXISTS parent_id int;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'departments_parent_fk'
      AND conrelid = 'departments'::regclass
  ) THEN
    ALTER TABLE departments
      ADD CONSTRAINT departments_parent_fk
      FOREIGN KEY (parent_id) REFERENCES departments(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS departments_parent_idx ON departments (parent_id);

COMMIT;

-- Kiểm chứng:
--   SELECT id, name, parent_id FROM departments ORDER BY id;
--   -> mọi dòng parent_id IS NULL ngay sau khi chạy.
