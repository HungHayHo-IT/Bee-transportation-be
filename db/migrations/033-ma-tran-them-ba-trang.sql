-- 033: them ba trang vao ma tran phan quyen.
--
-- Ba man nay khong nam tren menu nen dot dau bi bo sot, nhung chung la man that
-- va can chan duoc rieng:
--
--   orderDetail    — chi tiet mot don. Mo duoc danh sach ma khong mo duoc tung
--                    don la mot cau hinh co that, va nguoc lai.
--   customerDetail — chi tiet mot khach hang, cung ly do.
--   notifications  — man Thong bao. Dung chung controller voi "Viec cua toi"
--                    nhung la hai cho nguoi dung mo khac nhau.
--
-- PHAI seed, khong duoc de trong: thieu dong trong bang nay nghia la KHONG co
-- quyen (xem PermissionMatrixService), nen bo qua buoc nay la khoa ca cong ty
-- khoi man chi tiet don ngay khi deploy.
--
-- Gia tri khoi tao chep dung muc cua man cha (orders / customers), rieng
-- Thong bao mo cho moi vai: do la thong bao cua chinh nguoi dang dang nhap.
--
-- Idempotent.

BEGIN;

SET lock_timeout = '3s';

INSERT INTO role_page_permissions (role, page_key, level) VALUES
  ('admin','orderDetail','full'),   ('leader','orderDetail','view'),
  ('manager','orderDetail','full'), ('sale','orderDetail','full'),
  ('staff','orderDetail','full'),

  ('admin','customerDetail','full'),   ('leader','customerDetail','view'),
  ('manager','customerDetail','full'), ('sale','customerDetail','full'),
  ('staff','customerDetail','view'),

  ('admin','notifications','full'),   ('leader','notifications','full'),
  ('manager','notifications','full'), ('sale','notifications','full'),
  ('staff','notifications','full')
ON CONFLICT (role, page_key) DO NOTHING;

COMMIT;
