-- 040 - Dich vu con, moi dich vu con mang mot ma TMS cua OF1.
--
-- Vi sao BANG RIENG chu khong phai cot parent_id tren services:
-- services dang duoc doc o rat nhieu cho - form bao gia cua khach, trang
-- landing, dinh tuyen phong ban, gia niem yet, form schema. Them parent_id vao
-- do la moi truy vam san co bong nhien nhin thay ca dich vu con, va phai di sua
-- tung cho de loc parent_id IS NULL. Bo sot mot cho la dich vu con lot len
-- trang cong khai. Bang rieng thi khong mot truy van cu nao doi hanh vi.
--
-- tms_mode NULL = "chua co ma": dich vu con van dung duoc trong BeeOps, chi la
-- don cua no khong du dieu kien day sang OF1.

BEGIN;
SET lock_timeout = '3s';

CREATE TABLE IF NOT EXISTS service_children (
  id         serial PRIMARY KEY,
  service_id int  NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  name       text NOT NULL,
  -- Ma phuong thuc van chuyen cua OF1-TMS. NULL = chua gan ma.
  tms_mode   text,
  sort_order int  NOT NULL DEFAULT 0,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Danh sach dong tai muc 5 tai lieu OF1-TMS Webhook v1.0. Gui ma ngoai danh
  -- sach thi OF1 tu choi ca request, nen chan ngay tu CSDL thay vi doi toi luc
  -- gui di moi biet.
  CONSTRAINT service_children_tms_mode_ck CHECK (tms_mode IS NULL OR tms_mode IN (
    'EXPORT_FCL', 'EXPORT_FCL_RU', 'EXPORT_LCL', 'EXPORT_AIR', 'EXPORT_BULK_CARGO',
    'IMPORT_FCL', 'IMPORT_FCL_RU', 'IMPORT_LCL', 'IMPORT_AIR', 'IMPORT_BULK_CARGO',
    'DOMESTIC', 'DOMESTIC_FCL', 'DOMESTIC_LCL',
    'CBT', 'CBT_FCL', 'CBT_LCL',
    'PORTTRANSFER_FCL', 'PORTTRANSFER_LCL'))
);

-- Mot ma TMS chi gan duoc mot lan trong cung mot dich vu cha. Vua chan nham,
-- vua la khoa de khoi tao ben duoi chay lai duoc nhieu lan.
CREATE UNIQUE INDEX IF NOT EXISTS service_children_ma_trong_cha_uk
  ON service_children (service_id, tms_mode) WHERE tms_mode IS NOT NULL;

CREATE INDEX IF NOT EXISTS service_children_cha_idx
  ON service_children (service_id, sort_order);

-- ON DELETE RESTRICT: don da tao roi thi khong cho xoa dich vu con duoi chan
-- no. Muon ngung dung thi tat is_active, don cu van doc duoc ten.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS service_child_id int REFERENCES service_children(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS orders_service_child_idx ON orders (service_child_id);

-- Khoi tao theo phan nhom Bee da chot:
--   DOM <- ba ma DOMESTIC
--   CBT <- ba ma CBT
--   MMT <- muoi hai ma con lai (xuat, nhap, chuyen cang)
INSERT INTO service_children (service_id, name, tms_mode, sort_order)
SELECT s.id, v.name, v.tms_mode, v.sort_order
FROM (VALUES
  ('DOM', 'Nội địa',                           'DOMESTIC',          1),
  ('DOM', 'Nội địa - nguyên container',        'DOMESTIC_FCL',      2),
  ('DOM', 'Nội địa - hàng lẻ',                 'DOMESTIC_LCL',      3),

  ('CBT', 'Quá cảnh / xuyên biên giới',        'CBT',               1),
  ('CBT', 'Quá cảnh - nguyên container',       'CBT_FCL',           2),
  ('CBT', 'Quá cảnh - hàng lẻ',                'CBT_LCL',           3),

  ('MMT', 'Xuất khẩu - nguyên container',      'EXPORT_FCL',        1),
  ('MMT', 'Xuất khẩu - nguyên container (RU)', 'EXPORT_FCL_RU',     2),
  ('MMT', 'Xuất khẩu - hàng lẻ',               'EXPORT_LCL',        3),
  ('MMT', 'Xuất khẩu - đường hàng không',      'EXPORT_AIR',        4),
  ('MMT', 'Xuất khẩu - hàng rời',              'EXPORT_BULK_CARGO', 5),
  ('MMT', 'Nhập khẩu - nguyên container',      'IMPORT_FCL',        6),
  ('MMT', 'Nhập khẩu - nguyên container (RU)', 'IMPORT_FCL_RU',     7),
  ('MMT', 'Nhập khẩu - hàng lẻ',               'IMPORT_LCL',        8),
  ('MMT', 'Nhập khẩu - đường hàng không',      'IMPORT_AIR',        9),
  ('MMT', 'Nhập khẩu - hàng rời',              'IMPORT_BULK_CARGO', 10),
  ('MMT', 'Chuyển cảng - nguyên container',    'PORTTRANSFER_FCL',  11),
  ('MMT', 'Chuyển cảng - hàng lẻ',             'PORTTRANSFER_LCL',  12)
) AS v(ma_cha, name, tms_mode, sort_order)
JOIN services s ON s.code = v.ma_cha
ON CONFLICT (service_id, tms_mode) WHERE tms_mode IS NOT NULL DO NOTHING;

COMMIT;
