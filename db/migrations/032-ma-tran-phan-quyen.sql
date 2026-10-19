-- 032: ma tran phan quyen theo TRANG, sua duoc tu man quan tri.
--
-- VAN DE: ai vao duoc trang nao dang nam rai rac trong code — decorator @Roles
-- o 64 endpoint ben backend, va mot bang hang so ben admin. Doi mot dong la
-- sua code roi deploy ca hai ben, nen thuc te khong ai doi, va file Excel phan
-- quyen song mot doi song rieng khong ai doi chieu lai.
--
-- BA MUC, co y khong co "phong minh" hay "don minh": pham vi du lieu duoc tinh
-- tu PHONG BAN cua tung nguoi chu khong tu vai tro — hai Pricing o hai phong
-- khac nhau phai thay hai tap don khac nhau. Cho chon pham vi theo vai tro la
-- dung mot o khong dieu khien duoc gi, te hon la khong co o.
--
--   none = khong vao duoc
--   view = chi doc (moi POST/PATCH/PUT/DELETE bi chan)
--   full = doc va ghi
--
-- KHOA CHINH (role, page_key): mot vai tro mot muc tren mot trang. Nguoi co
-- nhieu vai tro lay muc CAO NHAT — xem PermissionMatrixService.
--
-- Du lieu khoi tao ghi lai DUNG luat dang chay hom nay, khong phai luat mong
-- muon: doi hanh vi va doi cach cau hinh trong cung mot lan thi khong ai biet
-- cai nao gay ra cai gi.
--
-- Idempotent.

BEGIN;

SET lock_timeout = '3s';

CREATE TABLE IF NOT EXISTS role_page_permissions (
  role       text NOT NULL,
  page_key   text NOT NULL,
  level      text NOT NULL,
  updated_by int REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role, page_key),
  CONSTRAINT role_page_permissions_role_ck
    CHECK (role IN ('admin','leader','manager','sale','staff')),
  CONSTRAINT role_page_permissions_level_ck
    CHECK (level IN ('none','view','full'))
);

COMMENT ON TABLE role_page_permissions IS
  'Ma tran phan quyen theo trang menu. Thieu dong = coi nhu khong co quyen, tru vai tro admin tren trang permissions.';

-- Du lieu khoi tao. ON CONFLICT DO NOTHING de chay lai khong ghi de lua chon
-- ma nguoi dung da sua.
INSERT INTO role_page_permissions (role, page_key, level) VALUES
  -- Tong quan: ai cung vao, du lieu tu cat theo phong ban.
  ('admin','dashboard','full'),   ('leader','dashboard','view'),  ('manager','dashboard','full'),
  ('sale','dashboard','full'),    ('staff','dashboard','full'),
  ('admin','myTasks','full'),     ('leader','myTasks','view'),    ('manager','myTasks','full'),
  ('sale','myTasks','full'),      ('staff','myTasks','full'),
  ('admin','orgChart','full'),    ('leader','orgChart','view'),   ('manager','orgChart','view'),
  ('sale','orgChart','view'),     ('staff','orgChart','view'),

  -- Don hang.
  ('admin','createOrder','full'), ('leader','createOrder','none'),('manager','createOrder','none'),
  ('sale','createOrder','full'),  ('staff','createOrder','none'),
  ('admin','orders','full'),      ('leader','orders','view'),     ('manager','orders','full'),
  ('sale','orders','full'),       ('staff','orders','full'),
  ('admin','ordersKanban','full'),('leader','ordersKanban','view'),('manager','ordersKanban','full'),
  ('sale','ordersKanban','full'), ('staff','ordersKanban','full'),
  ('admin','queue','full'),       ('leader','queue','none'),      ('manager','queue','full'),
  ('sale','queue','none'),        ('staff','queue','full'),
  ('admin','unroutedOrders','full'),('leader','unroutedOrders','view'),('manager','unroutedOrders','none'),
  ('sale','unroutedOrders','none'),('staff','unroutedOrders','none'),

  -- Bao cao.
  ('admin','revenueReport','full'),('leader','revenueReport','view'),('manager','revenueReport','view'),
  ('sale','revenueReport','none'), ('staff','revenueReport','none'),
  ('admin','operationsReport','full'),('leader','operationsReport','view'),('manager','operationsReport','view'),
  ('sale','operationsReport','none'),('staff','operationsReport','none'),

  -- Gia: ai cung TRA duoc bang gia, chi Pricing va Admin sua.
  ('admin','priceQuoted','full'), ('leader','priceQuoted','view'),('manager','priceQuoted','view'),
  ('sale','priceQuoted','view'),  ('staff','priceQuoted','full'),
  ('admin','priceList','full'),   ('leader','priceList','view'),  ('manager','priceList','view'),
  ('sale','priceList','view'),    ('staff','priceList','full'),
  ('admin','priceLocations','full'),('leader','priceLocations','view'),('manager','priceLocations','view'),
  ('sale','priceLocations','view'),('staff','priceLocations','full'),

  -- Noi dung trang gioi thieu.
  ('admin','news','full'),        ('leader','news','view'),       ('manager','news','none'),
  ('sale','news','none'),         ('staff','news','none'),
  ('admin','cms','full'),         ('leader','cms','view'),        ('manager','cms','none'),
  ('sale','cms','none'),          ('staff','cms','none'),
  ('admin','saleRepresentatives','full'),('leader','saleRepresentatives','view'),
  ('manager','saleRepresentatives','none'),('sale','saleRepresentatives','none'),
  ('staff','saleRepresentatives','none'),

  -- Khach hang.
  ('admin','customers','full'),   ('leader','customers','view'),  ('manager','customers','full'),
  ('sale','customers','full'),    ('staff','customers','view'),

  -- Quan tri.
  -- Phong ban: MOI vai deu DOC duoc, vi danh sach phong la thu man dieu don,
  -- man don hang va so do to chuc deu tra. Chi admin sua duoc.
  ('admin','departments','full'), ('leader','departments','view'),('manager','departments','view'),
  ('sale','departments','view'),  ('staff','departments','view'),
  ('admin','users','full'),       ('leader','users','view'),      ('manager','users','full'),
  ('sale','users','none'),        ('staff','users','none'),
  ('admin','services','full'),    ('leader','services','view'),   ('manager','services','none'),
  ('sale','services','none'),     ('staff','services','none'),
  ('admin','routingMatrix','full'),('leader','routingMatrix','view'),('manager','routingMatrix','none'),
  ('sale','routingMatrix','none'),('staff','routingMatrix','none'),
  ('admin','activityLog','full'), ('leader','activityLog','view'),('manager','activityLog','none'),
  ('sale','activityLog','none'),  ('staff','activityLog','none'),

  -- Chinh man ma tran nay. Admin luon 'full' va khong sua duoc: mot lan bam
  -- nham khoa ca cong ty khoi man duy nhat mo lai duoc quyen.
  ('admin','permissions','full'), ('leader','permissions','view'),('manager','permissions','none'),
  ('sale','permissions','none'),  ('staff','permissions','none')
ON CONFLICT (role, page_key) DO NOTHING;

COMMIT;
