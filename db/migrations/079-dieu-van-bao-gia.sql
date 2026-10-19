-- 079 - Phong BAO GIA va phong DIEU VAN (16/10/2026).
--
-- Truoc day ba phong Van hanh (DAD/HCM/HPH) vua bao gia canh tranh nhau vua
-- quan ly tuyen gia khu vuc. Tu nay:
--
-- * Phong BAO GIA (is_quoting): DUY NHAT phong nhan don va bao gia. Mot tai
--   khoan Pricing. Sale chi chot duoc gia cua phong nay.
-- * Phong DIEU VAN (is_dispatch): ba phong Van hanh. Van quan ly tuyen gia
--   khu vuc (price_regions), KHONG bao gia, nen khong giu dich vu nao — CHECK
--   giong phong sale (076) de cau truy van phan phoi tu bo qua.
-- * Vai tro 'dispatcher' (Dieu van): nhan vien phong dieu van. CHI XEM don co
--   diem di thuoc khu vuc phong minh quan ly (price_regions.department_id),
--   ke ca gia Sale da chot.
--
-- Phong phu trach thuc hien don sau khi chot: de sau — TMS se lo.

BEGIN;
SET lock_timeout = '3s';

-- ---------------------------------------------------------------- cau truc
ALTER TABLE departments ADD COLUMN IF NOT EXISTS is_quoting  boolean NOT NULL DEFAULT false;
ALTER TABLE departments ADD COLUMN IF NOT EXISTS is_dispatch boolean NOT NULL DEFAULT false;

ALTER TABLE departments DROP CONSTRAINT IF EXISTS departments_dieu_van_khong_dich_vu;
ALTER TABLE departments ADD CONSTRAINT departments_dieu_van_khong_dich_vu
  CHECK (NOT is_dispatch OR cardinality(service_ids) = 0);

-- Mot phong chi mang mot trong ba vai: kinh doanh / bao gia / dieu van.
ALTER TABLE departments DROP CONSTRAINT IF EXISTS departments_mot_loai;
ALTER TABLE departments ADD CONSTRAINT departments_mot_loai
  CHECK (is_sales::int + is_quoting::int + is_dispatch::int <= 1);

ALTER TABLE price_regions ADD COLUMN IF NOT EXISTS department_id int
  REFERENCES departments(id) ON DELETE SET NULL;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_roles_ck;
ALTER TABLE users ADD CONSTRAINT users_roles_ck CHECK (
  roles <@ ARRAY['admin','leader','manager','sale','staff','partner','dispatcher']::text[]);

ALTER TABLE role_page_permissions DROP CONSTRAINT IF EXISTS role_page_permissions_role_ck;
ALTER TABLE role_page_permissions ADD CONSTRAINT role_page_permissions_role_ck
  CHECK (role IN ('admin','leader','manager','sale','staff','partner','dispatcher'));

-- Quyen mac dinh cua Dieu van — giong MAC_DINH trong permissions/pages.ts.
INSERT INTO role_page_permissions (role, page_key, level)
SELECT 'dispatcher', k.page_key,
       CASE
         WHEN k.page_key = 'notifications' THEN 'full'
         WHEN k.page_key IN ('orders','orderDetail','ordersKanban','customers','customerDetail',
                             'orgChart','priceLookup','departments') THEN 'view'
         ELSE 'none'
       END
FROM (SELECT DISTINCT page_key FROM role_page_permissions) AS k
ON CONFLICT (role, page_key) DO NOTHING;

-- ---------------------------------------------------------------- du lieu
-- Cac buoc duoi day bam ten that tren production; DB khac khong co cac dong
-- nay thi moi cau chi cap nhat 0 dong.

-- Phong bao gia: nhan moi dich vu.
INSERT INTO departments (name, service_ids, is_quoting)
SELECT 'Phòng Báo Giá', COALESCE((SELECT array_agg(id ORDER BY id) FROM services), '{}'), true
WHERE NOT EXISTS (SELECT 1 FROM departments WHERE is_quoting);

-- Ba phong Van hanh thanh phong dieu van, bo dich vu (khong con duoc phan don).
UPDATE departments SET is_dispatch = true, service_ids = '{}'
WHERE name LIKE 'Vận Hành BEETRN%';

-- Khu vuc -> phong dieu van quan ly.
UPDATE price_regions r SET department_id = d.id
FROM departments d
WHERE (r.name, d.name) IN (('Miền Trung', 'Vận Hành BEETRN - DAD'),
                           ('Miền Nam',   'Vận Hành BEETRN - HCM'),
                           ('Miền Bắc',   'Vận Hành BEETRN - HPH'));

-- Tai khoan Pricing duy nhat -> phong bao gia.
UPDATE users SET department_id = (SELECT id FROM departments WHERE is_quoting LIMIT 1)
WHERE lower(email) = 'pricing@beetransportation.vn';

-- Nhan vien (staff) cac phong dieu van -> Dieu van. Truong phong giu nguyen
-- vai tro: ho van quan ly bang gia khu vuc.
UPDATE users u SET roles = array_replace(u.roles, 'staff', 'dispatcher')
FROM departments d
WHERE d.id = u.department_id AND d.is_dispatch AND 'staff' = ANY(u.roles);

-- Don dang bao gia (chua chon phong thang): bo phan viec CHUA bao gia cua cac
-- phong dieu van, chuyen don sang phong bao gia. Phan da bao gia giu lai lam
-- lich su, nhung Sale khong chon duoc nua (chi chon gia phong bao gia).
DELETE FROM order_departments od
USING departments d, orders o
WHERE d.id = od.department_id AND o.id = od.order_id
  AND d.is_dispatch AND od.state IN ('pending', 'claimed')
  AND o.status IN ('distributed', 'quoting', 'awaiting_selection')
  AND o.department_id IS NULL;

INSERT INTO order_departments (order_id, department_id)
SELECT o.id, d.id
FROM orders o CROSS JOIN departments d
WHERE d.is_quoting
  AND o.status IN ('distributed', 'quoting', 'awaiting_selection')
  AND o.department_id IS NULL
ON CONFLICT (order_id, department_id) DO NOTHING;

COMMIT;
