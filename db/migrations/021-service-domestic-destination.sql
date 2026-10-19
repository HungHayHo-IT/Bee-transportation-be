-- 021: co cau hinh "dich vu nay co diem den TRONG NUOC hay khong".
--
-- Dich vu xuyen bien gioi (CBT) co diem den nam ngoai Viet Nam, nen CA KHOI
-- diem den — o "Tinh/thanh diem den" (danh sach tinh thanh trong nuoc) lan o
-- "Dia chi diem den" — deu vo nghia. CBT da co hai truong rieng "Nuoc den" va
-- "Cua khau" lam viec do.
--
-- KHONG viet cung ma 'CBT' vao code. Backend dung co nay de biet co doi diem
-- den khi cham "don da du thong tin chua", con admin dung chinh no de an o tren
-- form. Mot cho duy nhat, hai ben cung doc — viet cung ma dich vu vao hai repo
-- la hai nguon su that, roi lech nhau.
--
-- Mac dinh TRUE: moi dich vu hien co van doi diem den nhu truoc, khong doi
-- hanh vi cua gi dang chay.

BEGIN;

SET lock_timeout = '3s';

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS has_domestic_destination boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN services.has_domestic_destination IS
  'false = diem den nam ngoai nuoc: an ca o tinh/thanh lan o dia chi diem den (vd CBT)';

UPDATE services SET has_domestic_destination = false WHERE code = 'CBT';

COMMIT;
