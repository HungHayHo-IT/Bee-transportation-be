-- 070 - Danh muc dia chi lay/giao cua tung khach.
--
-- Contract OF1-TMS v1.3 muc 3: khach dong bo kem `addresses[]`, moi dia chi
-- mot `addressCode` do doi tac sinh; don hang sau do tham chieu bang ma do va
-- Bee tu dien toa do, nguoi lien he, khu vuc. Gui dia chi dang chu van duoc
-- nhan nhung thieu dinh vi.
--
-- Truoc migration nay BeeOps khong co cho nao quan ly dia chi cua khach: dia
-- chi nam tren TUNG DON duoi dang chu tu do, moi don mot kieu, khong co ma.
--
-- KHONG bat ai ngoi nhap 697 khach: lop ung dung tu ghi nho dia chi moi lan
-- tao/sua don. Danh muc lon dan theo viec that, khong de ra mot man hinh ma
-- khong ai co thoi gian dien.
--
-- `code` chi duy nhat TRONG PHAM VI mot khach — dung nhu contract noi. Hai
-- khach cung co 'A01' la binh thuong.
--
-- `addr_key` la cot sinh de chong trung: cung mot dia chi go hai lan khac
-- hoa thuong hay thua khoang trang thi van la MOT dong. Khong co no thi moi
-- lan sua don lai de them mot ban sao, va danh muc phinh ra vo nghia.
--
-- ON DELETE CASCADE theo khach: dia chi khong co nghia khi khong con chu cua
-- no, khac han dia diem trong bang gia.
--
-- Idempotent: chay lai khong doi gi.

BEGIN;

SET lock_timeout = '3s';

CREATE TABLE IF NOT EXISTS customer_addresses (
  id          serial PRIMARY KEY,
  customer_id int  NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  code        varchar(50) NOT NULL,
  address     text NOT NULL,
  contact     text,
  -- PICKUP (chi lay) / DELIVERY (chi giao) / BOTH (mac dinh) - muc 3 contract.
  type        varchar(10) NOT NULL DEFAULT 'BOTH'
              CHECK (type IN ('PICKUP', 'DELIVERY', 'BOTH')),
  is_active   boolean NOT NULL DEFAULT true,
  addr_key    text GENERATED ALWAYS AS
              (btrim(lower(regexp_replace(address, '[[:space:]]+', ' ', 'g')))) STORED,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS customer_addresses_code_uk
  ON customer_addresses (customer_id, code);
CREATE UNIQUE INDEX IF NOT EXISTS customer_addresses_addr_uk
  ON customer_addresses (customer_id, addr_key);

COMMIT;

-- Kiem chung:
--   SELECT count(*) = 1 FROM information_schema.tables
--    WHERE table_name = 'customer_addresses';
