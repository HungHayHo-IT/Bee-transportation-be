-- Sơ đồ tổ chức + bộ tài khoản TEST.
--
-- CHỈ chạy trên môi trường thử nghiệm. File này cố ý KHÔNG nằm trong chuỗi
-- `schema.sql -> seed.sql -> 003` của cài đặt sạch: tài khoản test phải là một
-- bước opt-in, không được lẫn vào bản cài mặc định.
--
-- Danh sách tài khoản là bản chép của src/common/config/test-accounts.json.
-- Sửa một bên thì phải sửa bên kia — kiểm bằng test-accounts.spec.ts.
--
-- Chạy qua scripts/reset-test-data.sh, đừng chạy tay.

BEGIN;

-- ---------------------------------------------------------------- Phòng ban
-- Ba KHỐI là nút nhóm của sơ đồ tổ chức, CỐ Ý để service_ids rỗng: đơn được
-- định tuyến tới mọi phòng có service_ids chứa dịch vụ đó, nên khối không gắn
-- dịch vụ sẽ không bao giờ nhận đơn. Đó là điều mong muốn — khối là cấp quản
-- lý, không phải đơn vị tác nghiệp.

INSERT INTO departments (name, parent_id, service_ids) VALUES
  ('Khối Vận hành',          NULL, ARRAY[]::int[]),
  ('Khối Quốc tế',           NULL, ARRAY[]::int[]),
  ('Khối Hỗ trợ kinh doanh', NULL, ARRAY[]::int[])
ON CONFLICT (name) DO NOTHING;

-- Phòng chuyên môn. service_ids tra theo MÃ dịch vụ chứ không viết cứng id:
-- id của services do serial cấp, chạy lại seed trên DB khác là lệch hết.
--
-- DOM va MMT co Y giao cho HAI phong (Bac/Nam): vong canh tranh bao gia chi co
-- nghia khi mot dich vu co tu hai phong tro len cung bao gia.
INSERT INTO departments (name, parent_id, service_ids)
SELECT d.name,
       (SELECT id FROM departments WHERE name = d.parent),
       ARRAY(SELECT id FROM services WHERE code = ANY (d.codes))
FROM (VALUES
  ('Phòng Vận chuyển nội địa miền Bắc', 'Khối Vận hành',          ARRAY['DOM','MMT']),
  ('Phòng Vận chuyển nội địa miền Nam', 'Khối Vận hành',          ARRAY['DOM','MMT']),
  ('Phòng Hàng dự án & Nâng hạ',        'Khối Vận hành',          ARRAY['PRJ','LIF']),
  ('Phòng Hải quan',                    'Khối Quốc tế',           ARRAY['CUS']),
  ('Phòng Vận tải xuyên biên giới',     'Khối Quốc tế',           ARRAY['CBT']),
  ('Phòng Môi giới hàng hải',           'Khối Quốc tế',           ARRAY['BRK']),
  ('Phòng Kho vận & Đóng gói',          'Khối Hỗ trợ kinh doanh', ARRAY['PKG','RNT']),
  ('Phòng Tư vấn giải pháp',            'Khối Hỗ trợ kinh doanh', ARRAY['CON'])
) AS d(name, parent, codes)
ON CONFLICT (name) DO UPDATE SET service_ids = excluded.service_ids;

-- --------------------------------------------------------------- Tài khoản
-- must_change_password = FALSE la BAT BUOC, khong phai tuy chon.
-- MustChangePasswordGuard la guard TOAN CUC: co nay bat thi moi endpoint tra
-- 403 cho toi khi doi mat khau -- ma doi mat khau thi AuthService chan lai vi
-- day la tai khoan test. Dat true o day la khoa chet ca 5 tai khoan.
--
-- gen_salt('bf', 12) khop BCRYPT_ROUNDS ben tang ung dung.

INSERT INTO users (email, full_name, password_hash, roles, must_change_password, department_id)
VALUES
  ('test.admin@beeops.test',   'Test Admin',   crypt('246810', gen_salt('bf', 12)), ARRAY['admin'],   false, NULL),
  ('test.leader@beeops.test',  'Test Leader',  crypt('246810', gen_salt('bf', 12)), ARRAY['leader'],  false, NULL),
  ('test.manager@beeops.test', 'Test Manager', crypt('246810', gen_salt('bf', 12)), ARRAY['manager'], false,
     (SELECT id FROM departments WHERE name = 'Phòng Vận chuyển nội địa miền Bắc')),
  ('test.sale@beeops.test',    'Test Sale',    crypt('246810', gen_salt('bf', 12)), ARRAY['sale'],    false, NULL),
  ('test.staff@beeops.test',   'Test Staff',   crypt('246810', gen_salt('bf', 12)), ARRAY['staff'],   false,
     (SELECT id FROM departments WHERE name = 'Phòng Vận chuyển nội địa miền Bắc'))
ON CONFLICT (email) DO UPDATE SET
  full_name            = excluded.full_name,
  password_hash        = excluded.password_hash,
  roles                = excluded.roles,
  must_change_password = false,
  department_id        = excluded.department_id,
  is_active            = true;

-- Truong phong: departments.manager_id va users.department_id la HAI quan he
-- tach roi (xem NotifyService.deptRecipients), nen phai dat ca hai.
UPDATE departments
SET manager_id = (SELECT id FROM users WHERE email = 'test.manager@beeops.test')
WHERE name = 'Phòng Vận chuyển nội địa miền Bắc';

COMMIT;
