-- 022: ten cong ty cua khach hang duoc phep de trong.
--
-- Form bao gia tren website chi hoi TEN NGUOI ("Nguyen Van A"), khong hoi ten
-- cong ty — hoi them mot o nua la mat khach. Truoc day backend nhet cai ten do
-- vao company_name vi cot nay NOT NULL, nen man hinh khach hang hien
-- "Ten cong ty: Le Thi Minh Chau" con "Nguoi lien he" lai trong: sai ca hai o.
--
-- Gio ten nguoi vao dung contact_name, con company_name de trong cho admin dien
-- sau khi da lien he va biet khach thuoc cong ty nao.
--
-- Khong dung toi du lieu cu: mot ten nguoi da nam trong company_name khong the
-- phan biet duoc voi ten cong ty that su la ten nguoi (ho kinh doanh ca the dat
-- ten theo ten chu la chuyen binh thuong). Doan sai la sua hong du lieu that,
-- nen viec don dep de admin tu lam.
--
-- Hai chi muc tren lower(company_name) van giu nguyen: Postgres bo qua hang
-- NULL khi danh chi muc btree, nen chung van phuc vu dung cac khach CO ten.

BEGIN;

SET lock_timeout = '3s';

ALTER TABLE customers
  ALTER COLUMN company_name DROP NOT NULL;

COMMENT ON COLUMN customers.company_name IS
  'De trong voi khach den tu form website: ho chi de lai ten nguoi (contact_name), admin dien ten cong ty sau';

COMMIT;
