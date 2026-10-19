-- 053 - Dieu khoan ky soan theo TUNG DIEU, thay cho mot o van ban dai.
--
-- Truoc day toan van dieu khoan nam trong app_settings.dieu_khoan_ky va chi
-- doi duoc bang SQL tren may chu - khong mot man hinh nao sua duoc. Production
-- vi the van dang la cho trong co danh dau '[CHUA SOAN]', va khach ky vao don
-- dang doc dung dong chu do.
--
-- Moi dieu mot dong. Luc gui khach ky, cac dieu DANG BAT duoc ghep lai theo
-- sort_order thanh mot van ban - xem signatures.service.
--
-- KHONG danh phien ban: moi chu ky da chup lai TOAN VAN dieu khoan tai thoi
-- diem ky (order_signatures.dieu_khoan, migration 036). Sua dieu khoan hom nay
-- khong lam sai nhung chu ky da thu hom qua.
--
-- GIU app_settings.dieu_khoan_ky lam duong lui: chua soan dieu nao thi van
-- doc no, nen khong co khoang thoi gian nao luong ky bi gay.

BEGIN;
SET lock_timeout = '3s';

CREATE TABLE IF NOT EXISTS terms_clauses (
  id         serial PRIMARY KEY,
  title      text NOT NULL,
  body       text NOT NULL,
  sort_order int  NOT NULL DEFAULT 0,
  -- Tat chu KHONG xoa khi muon ngung dung mot dieu: xoa thi mat luon ban nhap
  -- da soan ky, con chu ky cu van giu toan van rieng nen khong anh huong gi.
  is_active  boolean NOT NULL DEFAULT true,
  updated_by int REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS terms_clauses_thu_tu_idx ON terms_clauses (sort_order, id);

-- Chuyen toan van dang co thanh MOT dieu, de khong mat ban da soan. Chi lam
-- khi bang con rong - chay lai migration khong duoc nhan doi no.
INSERT INTO terms_clauses (title, body, sort_order)
SELECT 'Điều khoản vận chuyển', s.value, 1
  FROM app_settings s
 WHERE s.key = 'dieu_khoan_ky'
   AND NOT EXISTS (SELECT 1 FROM terms_clauses);

COMMIT;
