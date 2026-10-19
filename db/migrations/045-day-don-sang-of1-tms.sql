-- 045 - Theo dau viec day don sang OF1-TMS.
--
-- Vi sao can cot: OF1 KHONG chan trung fileNo. Moi CREATE nhan duoc la mot bill
-- MOI ben do (muc 8 tai lieu OF1-TMS v1.0). Khong ghi lai don nao da day thi
-- bam hai lan la khach co hai don, va khong co cach nao biet de go.
--
-- `tms_status` vua la trang thai vua la O KHOA: buoc chiem cho la
--   UPDATE orders SET tms_status = 'dang_gui' WHERE id = ? AND tms_status IS NULL
-- Chay song song thi chi mot luot sua duoc dong, luot kia thay 0 row va dung.
-- Dat khoa o cot nay thay vi bang rieng de khong them mot bang chi de giu mot
-- dong moi don.
--
-- 'khong_ro' la trang thai QUAN TRONG NHAT: mang dut hoac het gio cho thi don
-- CO THE da vao OF1 roi. De nguyen o day, khong tu gui lai — phai co nguoi doi
-- soat voi OF1 theo fileNo. Tai lieu noi thang: chi retry khi chac chan lan
-- truoc that bai.

BEGIN;
SET lock_timeout = '3s';

ALTER TABLE orders ADD COLUMN IF NOT EXISTS tms_status text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tms_pushed_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tms_error text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_tms_status_ck') THEN
    ALTER TABLE orders ADD CONSTRAINT orders_tms_status_ck
      CHECK (tms_status IS NULL
             OR tms_status IN ('dang_gui', 'nhan', 'tu_choi', 'khong_ro'));
  END IF;
END $$;

-- Don da day la phan rat nho cua bang: index mot phan, chi danh phan do.
CREATE INDEX IF NOT EXISTS orders_tms_idx ON orders (tms_status)
  WHERE tms_status IS NOT NULL;

COMMIT;
