-- 037: bang cau hinh key/value, dung ngay cho dieu khoan ky dien tu.
--
-- VAN DE: dieu khoan khach ky vao phai sua duoc ma khong phai sua code roi
-- deploy lai. Dat trong CMS thi sai cho — CMS quan ly noi dung trang gioi
-- thieu, va "Dieu khoan su dung" o do la dieu khoan DUNG WEBSITE, khac han
-- dieu khoan van chuyen ma khach dang ky vao.
--
-- Bang nay co y nho va chung: mot khoa, mot gia tri. Moi dong chu ky da chup
-- lai TOAN VAN dieu khoan tai thoi diem ky (order_signatures.dieu_khoan), nen
-- o day khong can danh phien ban — doi chu hom nay khong lam sai nhung chu ky
-- da thu hom qua.
--
-- Gia tri khoi tao la mot CHO TRONG CO DANH DAU, khong phai dieu khoan that:
-- dat san mot doan van nghe nhu dieu khoan la moi nguoi dem no di ky that.
--
-- Idempotent.

BEGIN;

SET lock_timeout = '3s';

CREATE TABLE IF NOT EXISTS app_settings (
  key        text PRIMARY KEY,
  value      text NOT NULL,
  updated_by int REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE app_settings IS
  'Cau hinh sua duoc tu man quan tri. Moi dong mot khoa.';

INSERT INTO app_settings (key, value) VALUES
  ('dieu_khoan_ky',
   E'[CHUA SOAN] Day la cho dat dieu khoan van chuyen ma khach hang ky xac nhan.\n\nNoi dung that phai do nguoi phu trach nghiep vu soan va duyet. Khi nao chua thay the doan nay thi man hinh ky van chay, nhung khach se doc dung dong chu nay.')
ON CONFLICT (key) DO NOTHING;

COMMIT;
