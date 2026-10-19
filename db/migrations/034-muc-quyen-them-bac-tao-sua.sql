-- 034: them bac 'edit' vao muc quyen cua ma tran phan quyen.
--
-- VAN DE: ma tran chi co ba bac — none / view / full. Giua "chi xem" va "lam
-- duoc moi thu" khong co gi, nen mot vai tro can nhap va sua don nhung khong
-- duoc XOA don thi khong dat duoc: dat view la khong nhap duoc, dat full la
-- xoa duoc luon.
--
-- BON BAC, xep tu thap len cao, bac cao bao ham bac thap:
--
--   none = khong vao duoc trang
--   view = chi doc (GET)
--   edit = doc, tao, sua (GET/POST/PUT/PATCH) — KHONG xoa
--   full = them ca xoa (DELETE)
--
-- Tao va sua la MOT bac chu khong phai hai: sua duoc mot ban ghi ma khong tao
-- duoc no, hay nguoc lai, la cau hinh khong ai dung toi that. Tach doi chi de
-- du bon chu trong o chon la dung hai lua chon khac ten ma hanh vi giong het.
--
-- KHONG doi du lieu dang co. Gia tri 'full' giu nguyen nghia cu (lam duoc moi
-- thu), nen moi dong dang chay giu nguyen quyen cua no; 'edit' la mot lua chon
-- MOI, chi co khi nguoi dung tu chon tren man phan quyen. Doi hanh vi cua cac
-- dong cu trong cung mot lan voi viec them bac la khong ai biet cai nao gay ra
-- cai gi.
--
-- Idempotent.

BEGIN;

SET lock_timeout = '3s';

-- Noi rong rang buoc: van ep o tang du lieu, vi mot chuoi la lot vao day thi
-- guard doc ra khong hieu, va cach hong an toan duy nhat la chan het.
ALTER TABLE role_page_permissions
  DROP CONSTRAINT IF EXISTS role_page_permissions_level_ck;

ALTER TABLE role_page_permissions
  ADD CONSTRAINT role_page_permissions_level_ck
  CHECK (level IN ('none','view','edit','full'));

COMMENT ON COLUMN role_page_permissions.level IS
  'none = khong vao duoc; view = chi doc; edit = doc/tao/sua, khong xoa; full = them ca xoa.';

COMMIT;
