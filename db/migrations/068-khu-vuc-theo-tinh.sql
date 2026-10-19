-- 068 - Khu vuc cua dia diem di theo TINH, khong theo hang xom.
--
-- Truoc day khu vuc duoc suy ra bang cach "lay theo mot dia diem khac cung
-- tinh da co khu vuc". Luat do co hai cach hong, va ca hai da xay ra that:
--
--   * Tinh chua co dia diem nao mang khu vuc thi dia diem moi nam NGOAI moi
--     khu vuc. Tren production: 346 / 486 dia diem khong thuoc khu vuc nao,
--     nen tuyen di tu chung khong hien o bang tuyen cua bat ky khu vuc nao.
--   * Ke thua trung mot hang xom sai thi sai lan ra: 6 dia diem TP. Ho Chi
--     Minh nam trong Mien Trung.
--
-- Migration nay dat lai khu vuc theo dung bang chia cua 061 cho MOI dia diem
-- co tinh nam trong 34 don vi hanh chinh. Dia diem khong khai tinh thi giu
-- nguyen — khong co cach nao suy ra, va doan la doan sai.
--
-- Day la diem khoi dau chu khong phai xieng: admin van sua khu vuc cua tung
-- dia diem duoc sau do.
--
-- Idempotent: chay lai khong doi gi them.

BEGIN;

SET lock_timeout = '3s';

UPDATE locations l
   SET region_id = r.id, updated_at = now()
  FROM (VALUES
    ('Hà Nội'),    ('Hải Phòng'), ('Quảng Ninh'),  ('Bắc Ninh'),   ('Hưng Yên'),
    ('Ninh Bình'), ('Phú Thọ'),   ('Thái Nguyên'), ('Lạng Sơn'),   ('Cao Bằng'),
    ('Tuyên Quang'), ('Lào Cai'), ('Lai Châu'),    ('Điện Biên'),  ('Sơn La')
  ) AS m(province)
  JOIN price_regions r ON lower(btrim(r.name)) = 'miền bắc'
 WHERE l.province = m.province AND l.region_id IS DISTINCT FROM r.id;

UPDATE locations l
   SET region_id = r.id, updated_at = now()
  FROM (VALUES
    ('Thanh Hóa'), ('Nghệ An'),  ('Hà Tĩnh'),   ('Quảng Trị'), ('Huế'),
    ('Đà Nẵng'),   ('Quảng Ngãi'), ('Gia Lai'), ('Đắk Lắk'),
    ('Khánh Hòa'), ('Lâm Đồng')
  ) AS m(province)
  JOIN price_regions r ON lower(btrim(r.name)) = 'miền trung'
 WHERE l.province = m.province AND l.region_id IS DISTINCT FROM r.id;

UPDATE locations l
   SET region_id = r.id, updated_at = now()
  FROM (VALUES
    ('TP. Hồ Chí Minh'), ('Đồng Nai'), ('Tây Ninh'), ('Cần Thơ'),
    ('An Giang'), ('Đồng Tháp'), ('Vĩnh Long'), ('Cà Mau')
  ) AS m(province)
  JOIN price_regions r ON lower(btrim(r.name)) = 'miền nam'
 WHERE l.province = m.province AND l.region_id IS DISTINCT FROM r.id;

COMMIT;

-- Kiem chung — phai ra 0:
--   SELECT count(*) FROM locations l
--     LEFT JOIN price_regions r ON r.id = l.region_id
--    WHERE l.province IS NOT NULL AND r.name IS NULL;
