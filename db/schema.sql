-- BeeOps - Schema PostgreSQL (10 bang). Web van hanh noi bo, vai chuc user.
-- Chi dung Postgres: khong Redis, khong message queue, khong object storage.
-- Chay: psql -d beeops -f schema.sql

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- crypt(), gen_salt()
CREATE EXTENSION IF NOT EXISTS citext;

-- =====================================================================
-- 1. TO CHUC & DANH MUC  (F7 - Admin tu cau hinh)
-- =====================================================================

CREATE TABLE departments (
  id          serial PRIMARY KEY,
  name        text NOT NULL UNIQUE,
  manager_id  int,                                  -- FK users, gan sau
  -- Cay to chuc: Ban -> Phong -> To. NULL la mot goc.
  -- Chong chu trinh o tang service, Postgres khong kiem duoc.
  parent_id   int,                                    -- FK departments, gan sau
  -- Ma tran dinh tuyen F2: cac dich vu phong nay phu trach.
  -- Mang thay cho bang department_services -> Admin tick checkbox roi luu 1 dong.
  service_ids int[] NOT NULL DEFAULT '{}',
  is_active   boolean NOT NULL DEFAULT true,
  -- Phong kinh doanh (076): khong tham gia bao gia, nen khong giu dich vu nao.
  is_sales    boolean NOT NULL DEFAULT false
    CONSTRAINT departments_sale_khong_dich_vu CHECK (NOT is_sales OR cardinality(service_ids) = 0),
  -- Phong bao gia (079): duy nhat phong nhan don va bao gia.
  -- Phong khac tich dich vu = Dieu van va Truong phong cua phong XEM don da chot (080).
  is_quoting  boolean NOT NULL DEFAULT false,
  CONSTRAINT departments_mot_loai CHECK (NOT (is_sales AND is_quoting)),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX departments_services_idx ON departments USING gin (service_ids);
CREATE INDEX departments_parent_idx ON departments (parent_id);

CREATE TABLE users (
  id            serial PRIMARY KEY,
  email         citext NOT NULL UNIQUE,
  full_name     text NOT NULL,
  phone         text,
  password_hash text NOT NULL,
  department_id int REFERENCES departments(id),
  -- 1 nguoi kiem nhieu vai tro -> mang, don gian hon bang user_roles
  roles         text[] NOT NULL DEFAULT '{}',
  can_view_company_report boolean NOT NULL DEFAULT false,  -- co "Xem bao cao cong ty"
  -- Co "Xem toan bo don (chi xem)" (migration 072): chi mo duong DOC.
  can_view_all_orders boolean NOT NULL DEFAULT false,
  email_off     text[] NOT NULL DEFAULT '{}',      -- cac loai thong bao tat email
  -- Cac loai thong bao tat PUSH. Tach khoi email_off: tat chuong dien thoai
  -- khong duoc keo theo mat ban email cua cung su kien. Doi xung voi
  -- customer_accounts.push_off. Migration 019 them cot nay.
  push_off      text[] NOT NULL DEFAULT '{}',
  must_change_password boolean NOT NULL DEFAULT true,
  is_active     boolean NOT NULL DEFAULT true,
  -- Cho phep hien tren trang landing public. Migration 006 them cot nay.
  is_landing_representative boolean NOT NULL DEFAULT false,
  -- Mo ta ngan hien duoi ten tren landing (migration 029). La NOI DUNG TRANG,
  -- khong phai mot truong ho so nhan su.
  landing_description text,
  -- URL anh dai dien hien tren landing (migration 030). Cung ho voi
  -- landing_description: noi dung trang, khong phai anh ho so nhan su.
  landing_avatar_url text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_roles_ck CHECK (
    roles <@ ARRAY['admin','leader','manager','sale','staff','partner','dispatcher']::text[])
);
ALTER TABLE departments
  ADD CONSTRAINT departments_manager_fk FOREIGN KEY (manager_id) REFERENCES users(id);
ALTER TABLE departments
  ADD CONSTRAINT departments_parent_fk FOREIGN KEY (parent_id) REFERENCES departments(id) ON DELETE SET NULL;

-- Partial: chi mot nhum nho nhan vien hien tren landing, nen index chi giu dung
-- cac dong true. Truoc day chi nam o db/migrations/006.
CREATE INDEX users_landing_rep_idx ON users (is_landing_representative)
  WHERE is_landing_representative = true;

CREATE TABLE services (
  id         serial PRIMARY KEY,
  code       text NOT NULL UNIQUE,                  -- DOM, CBT, CUS... (tien to ma don)
  name       text NOT NULL,
  sla_hours  int  NOT NULL DEFAULT 24,              -- han phong ban phai tiep nhan
  -- Mau bo moc tien do (muc 7). Copy sang order_milestones khi chot don,
  -- nen sua o day khong anh huong don da chot.
  milestones text[] NOT NULL DEFAULT '{}',
  -- O "Thong so hang hoa" chung ma dich vu nay dung. Bay cot so cua orders van la cot
  -- that (F3 + dashboard khop tren chung); mang nay chi quyet dinh o nao HIEN tren form.
  cargo_fields text[] NOT NULL DEFAULT ARRAY[
    'weightKg','volumeCbm','packageCount','containerType','dimLM','dimWM','dimHM'],
  sort_order int  NOT NULL DEFAULT 0,
  is_active  boolean NOT NULL DEFAULT true,
  -- false = diem den nam ngoai nuoc: an CA o tinh/thanh lan o dia chi diem den
  -- (vd CBT, da co "Nuoc den" + "Cua khau" rieng). Backend dung no khi cham don
  -- da du thong tin chua, admin dung chinh no de an o tren form.
  -- Tu migration 054 day la MAC DINH cua dich vu: dich vu con de doi lai (xem
  -- service_children). Hang xuat va hang nhap nam cung mot dich vu cha nhung
  -- nguoc dau nhau, nen co o cha mot minh khong dien ta duoc.
  has_domestic_origin      boolean NOT NULL DEFAULT true,
  has_domestic_destination boolean NOT NULL DEFAULT true,
  -- Dich vu tu them, hien tren landing (migration 031). landing_key la khoa on
  -- dinh landing dung de tra chu nghia trong lop phu CMS; doi ten hay doi slug
  -- thi khoa nay GIU NGUYEN. NULL = dich vu nay khong do landing quan.
  landing_key     text,
  landing_slug_vi text,
  landing_slug_en text,
  show_on_landing boolean NOT NULL DEFAULT false,
  CONSTRAINT services_cargo_fields_ck CHECK (
    cargo_fields <@ ARRAY[
      'weightKg','volumeCbm','packageCount','containerType','dimLM','dimWM','dimHM']::text[]),
  -- Len landing thi phai co du khoa va hai duong dan: thieu mot cai la mot
  -- trang khong co dia chi, hoac mot dia chi khong co noi dung.
  CONSTRAINT services_landing_du_ck CHECK (
    show_on_landing = false
    OR (landing_key IS NOT NULL AND landing_slug_vi IS NOT NULL AND landing_slug_en IS NOT NULL))
);
-- Partial: chin dich vu cu khong co landing_key (NULL), va NULL khong dung vao
-- nhau. Chi cac dong that su len landing moi phai khac nhau.
-- Mot ma chi lam ma cha cua dung mot dich vu.
CREATE UNIQUE INDEX services_landing_key_uk ON services (landing_key)
  WHERE landing_key IS NOT NULL;
CREATE UNIQUE INDEX services_landing_slug_vi_uk ON services (landing_slug_vi)
  WHERE landing_slug_vi IS NOT NULL;
CREATE UNIQUE INDEX services_landing_slug_en_uk ON services (landing_slug_en)
  WHERE landing_slug_en IS NOT NULL;

-- Dich vu CON (migration 040). Mot dong = mot lua chon hep hon trong mot dich
-- vu lon, mang ma phuong thuc van chuyen cua OF1-TMS. Bang rieng chu khong phai
-- parent_id tren services: moi truy van dang doc services (form bao gia, landing,
-- dinh tuyen phong ban, gia niem yet) se nhin thay ca dich vu con neu dung chung
-- bang, va bo sot mot cho loc la dich vu con lot len trang cong khai.
CREATE TABLE service_children (
  id         serial PRIMARY KEY,
  service_id int  NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  name       text NOT NULL,
  -- NULL = chua gan ma. Dich vu con van dung duoc, chi la don cua no khong du
  -- dieu kien day sang OF1-TMS.
  tms_mode   text,
  -- Hai dau cua tuyen co nam trong nuoc khong (054). NULL = THEO DICH VU CHA.
  --   EXPORT_*  di trong nuoc, den NUOC NGOAI
  --   IMPORT_*  di NUOC NGOAI, den trong nuoc
  --   CBT_*     di trong nuoc, den NUOC NGOAI
  --   DOMESTIC_*, PORTTRANSFER_*  ca hai trong nuoc
  has_domestic_origin      boolean,
  has_domestic_destination boolean,
  sort_order int  NOT NULL DEFAULT 0,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Danh sach dong tai muc 5 tai lieu OF1-TMS Webhook v1.0. Gui ma ngoai danh
  -- sach thi OF1 tu choi ca request, nen chan ngay tu CSDL.
  CONSTRAINT service_children_tms_mode_ck CHECK (tms_mode IS NULL OR tms_mode IN (
    'EXPORT_FCL', 'EXPORT_FCL_RU', 'EXPORT_LCL', 'EXPORT_AIR', 'EXPORT_BULK_CARGO',
    'IMPORT_FCL', 'IMPORT_FCL_RU', 'IMPORT_LCL', 'IMPORT_AIR', 'IMPORT_BULK_CARGO',
    'DOMESTIC', 'DOMESTIC_FCL', 'DOMESTIC_LCL',
    'CBT', 'CBT_FCL', 'CBT_LCL',
    'PORTTRANSFER_FCL', 'PORTTRANSFER_LCL'))
);
-- Mot ma TMS chi gan duoc mot lan trong cung mot dich vu cha.
CREATE UNIQUE INDEX service_children_ma_trong_cha_uk
  ON service_children (service_id, tms_mode) WHERE tms_mode IS NOT NULL;
CREATE INDEX service_children_cha_idx ON service_children (service_id, sort_order);

-- Truong nhap RIENG cua tung dich vu (F1). Mot dong = mot o nhap tren form tao don;
-- Admin tu them/sua trong danh muc, khong can dev.
CREATE TABLE service_fields (
  id          serial PRIMARY KEY,
  service_id  int  NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  -- O rieng cua MOT dich vu con (054). NULL = ap dung cho ca dich vu.
  service_child_id int REFERENCES service_children(id) ON DELETE CASCADE,
  field_key   text NOT NULL CHECK (field_key ~ '^[a-z][a-z0-9_]{0,49}$'),  -- khoa trong service_data
  label       text NOT NULL,
  field_type  text NOT NULL CHECK (field_type IN ('text','number','select','date','boolean')),
  unit        text,                                  -- kg, tan, m, chiec...
  options     text[] NOT NULL DEFAULT '{}',          -- chi dung cho field_type='select'
  is_required boolean NOT NULL DEFAULT false,
  sort_order  int     NOT NULL DEFAULT 0,
  help_text   text,
  is_active   boolean NOT NULL DEFAULT true,         -- ngung dung thay cho xoa: don cu giu nhan
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_fields_select_ck CHECK (
    field_type <> 'select' OR cardinality(options) > 0)
);
-- Chi muc rieng cho tung tang: UNIQUE thuong coi hai NULL la khac nhau, nen
-- mot chi muc (service_id, field_key) khong chan duoc tang chung.
CREATE UNIQUE INDEX service_fields_key_chung_uk
  ON service_fields (service_id, field_key) WHERE service_child_id IS NULL;
CREATE UNIQUE INDEX service_fields_key_con_uk
  ON service_fields (service_child_id, field_key) WHERE service_child_id IS NOT NULL;
CREATE INDEX service_fields_service_idx ON service_fields (service_id, sort_order);
CREATE INDEX service_fields_con_idx
  ON service_fields (service_child_id, sort_order) WHERE service_child_id IS NOT NULL;

CREATE TABLE customers (
  id           serial PRIMARY KEY,
  -- Ma khach ben he thong cu (CL000001..) — xem 044. UNIQUE nhung cho phep
  -- NULL: khach cu va khach tu form website khong co ma, va Postgres coi moi
  -- NULL la khac nhau nen khong can index mot phan.
  code         text UNIQUE,
  -- De trong voi khach den tu form website: form chi hoi ten nguoi, ten do vao
  -- contact_name, con ten cong ty thi admin dien sau khi lien he (xem 022).
  company_name text,
  contact_name text,
  phone        text,
  email        text,
  note         text,
  -- Ho so moi phai duoc duyet moi dung duoc khi tao don — xem 026.
  -- Mac dinh 'approved' de khach cu va khach tu form website khong bi ket.
  status       text NOT NULL DEFAULT 'approved'
                 CHECK (status IN ('pending', 'approved', 'rejected')),
  -- KHONG bat buoc: khach le va khach tu form website khong co hai thu nay.
  tax_code         text,
  business_licence text,
  created_by   int REFERENCES users(id) ON DELETE SET NULL,
  reviewed_by  int REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at  timestamptz,
  -- Tu choi ma khong noi vi sao thi nguoi tao khong sua duoc gi.
  reject_reason text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
-- Khach dang cho la phan rat nho cua bang: index mot phan, chi danh phan do.
CREATE INDEX customers_pending_idx ON customers (created_at DESC)
  WHERE status = 'pending';
CREATE INDEX customers_name_idx ON customers (lower(company_name));
-- Khong dat UNIQUE cung (ten cong ty trung nhau la chuyen co that); index nay de
-- tang ung dung tra nhanh va tra 409 kem id ho so dang co.
CREATE INDEX customers_name_norm_idx ON customers (lower(btrim(company_name)));

-- Danh muc dia chi lay/giao cua tung khach (070) - nguon cho `addresses[]`
-- cua OF1. `code` chi duy nhat TRONG PHAM VI mot khach, dung nhu contract.
-- `addr_key` chong trung: cung mot dia chi go hai lan khac hoa thuong hay
-- thua khoang trang van la MOT dong.
CREATE TABLE customer_addresses (
  id          serial PRIMARY KEY,
  customer_id int  NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  code        varchar(50) NOT NULL,
  address     text NOT NULL,
  contact     text,
  type        varchar(10) NOT NULL DEFAULT 'BOTH'
              CHECK (type IN ('PICKUP', 'DELIVERY', 'BOTH')),
  is_active   boolean NOT NULL DEFAULT true,
  addr_key    text GENERATED ALWAYS AS
              (btrim(lower(regexp_replace(address, '[[:space:]]+', ' ', 'g')))) STORED,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX customer_addresses_code_uk ON customer_addresses (customer_id, code);
CREATE UNIQUE INDEX customer_addresses_addr_uk ON customer_addresses (customer_id, addr_key);

-- =====================================================================
-- 2. DON HANG  (F1, F4, F5)
-- =====================================================================

CREATE TABLE orders (
  id          serial PRIMARY KEY,
  code        text NOT NULL UNIQUE,                 -- E_FCL_20261006_001, BRK-20261006-001
  code_prefix text NOT NULL,                        -- E_FCL / BRK (tien to cua ma)
  order_day   date NOT NULL DEFAULT current_date,   -- ngay trong ma don
  daily_no    int  NOT NULL,                        -- STT trong ngay theo tien to
  service_id  int  NOT NULL REFERENCES services(id),
  -- Dich vu CON (040). NULL cho don cu va cho dich vu khong co con nao.
  -- RESTRICT: don da tao thi khong cho xoa dich vu con duoi chan no; muon
  -- ngung dung thi tat is_active, don cu van doc duoc ten.
  service_child_id int REFERENCES service_children(id) ON DELETE RESTRICT,
  customer_id int  REFERENCES customers(id),
  created_by  int  REFERENCES users(id),            -- sale phu trach; NULL = don khach tu gui (075)

  -- BAY trang thai, ket thuc o 'closed' (xem migration 023).
  -- awaiting_selection = "Cho chot gia": gom ca cho sale chon bao gia lan cho
  --   khach xac nhan, truoc day la hai trang thai roi.
  -- cancelled = ca khach che gia lan huy noi bo; ly do nam o cancel_reason.
  -- Tick moc tien do KHONG doi trang thai: don chot roi thi dung o 'closed',
  --   completed_at van duoc ghi khi tick het moc.
  status text NOT NULL DEFAULT 'new' CHECK (status IN (
    'awaiting_info',
    'new','distributed','quoting','awaiting_selection',
    'closed','cancelled')),

  -- Tuyen van chuyen (chuan hoa de so khop don gia tham khao)
  origin_province      text,
  origin_address       text,
  destination_province text,
  destination_address  text,
  desired_date         date,

  -- 4 truong so co dinh (khong bat buoc) - can cu khop gia tham khao (F3)
  weight_kg      numeric(12,2),
  volume_cbm     numeric(12,2),
  package_count  int,
  -- Don vi tinh cua package_count khi day sang OF1 (069). NULL = chua khai,
  -- lop ung dung roi ve 'PK'.
  quantity_unit  varchar(20),
  container_type text,                              -- 20 / 40 / NULL
  dim_l_m        numeric(8,2),
  dim_w_m        numeric(8,2),
  dim_h_m        numeric(8,2),

  goods_name text,
  note       text,                                  -- ghi chu tu do, KHONG dung de so khop
  source     text CHECK (source IN ('website','hotline','email','existing')),
  -- File dinh kem: [{"name":..,"path":..,"mime":..,"size":..,"by":1,"at":".."}]
  -- Luu tren dia, DB chi giu metadata.
  files jsonb NOT NULL DEFAULT '[]',

  -- Gia tri cac truong RIENG theo dich vu (xem service_fields), dung kieu JSON theo
  -- field_type: {"declaration_type":"Nhap kinh doanh","docs_ready":true}
  service_data jsonb NOT NULL DEFAULT '{}'
    CONSTRAINT orders_service_data_ck CHECK (jsonb_typeof(service_data) = 'object'),

  -- Ket qua chot (F4)
  department_id int REFERENCES departments(id),     -- phong thang = phong phu trach
  final_amount  numeric(15,0),                      -- DOANH THU (VND), khoa khi chot
  sale_price    numeric(15,0)                       -- gia Sale chot voi khach (don landing, 078)
    CONSTRAINT orders_sale_price_ck CHECK (sale_price > 0),
  closed_at     timestamptz,
  completed_at  timestamptz,
  reject_reason text,                               -- chi dung khi status='rejected'
  -- Ba cot ghi chu RIENG. Gop chung mot cot thi front-end phai doan y nghia
  -- theo status de dat nhan, va bao cao khong tach duoc ba loai.
  close_note    text,                               -- ghi chu khi CHOT
  reject_note   text,                               -- ghi chu khi khach TU CHOI
  cancel_reason text,                               -- ly do HUY (bat buoc)
  -- Day don sang OF1-TMS — xem 045. tms_status vua la trang thai vua la o khoa
  -- chiem cho, vi OF1 khong chan trung fileNo: gui hai lan la khach co hai don.
  -- 'khong_ro' nghia la mang dut giua chung, don CO THE da vao OF1 — de nguyen,
  -- phai co nguoi doi soat truoc khi gui lai.
  -- Rang buoc DAT TEN de trung voi migration 045: khong dat ten thi Postgres
  -- tu sinh 'orders_tms_status_check', va check-migrations.sql tim theo ten se
  -- bao thieu tren moi CSDL dung tu file nay.
  tms_status    text CONSTRAINT orders_tms_status_ck CHECK (tms_status IS NULL
                   OR tms_status IN ('dang_gui', 'nhan', 'tu_choi', 'khong_ro')),
  tms_pushed_at timestamptz,
  tms_error     text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- updated_at khong the trong cay vao tang ung dung nho set: cac lenh $executeRaw
-- di vong qua Prisma nen khong cham toi cot nay.
CREATE FUNCTION touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $fn$;

CREATE TRIGGER orders_touch_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE UNIQUE INDEX orders_daily_no_uk ON orders (code_prefix, order_day, daily_no);
CREATE INDEX orders_prefix_day_idx ON orders (code_prefix, order_day);
CREATE INDEX orders_status_idx   ON orders (status);
CREATE INDEX orders_service_idx  ON orders (service_id, closed_at DESC);
CREATE INDEX orders_sale_idx     ON orders (created_by, created_at DESC);
CREATE INDEX orders_dept_idx     ON orders (department_id, closed_at DESC);
CREATE INDEX orders_customer_idx ON orders (customer_id);
-- Don da day sang TMS la phan rat nho cua bang: index mot phan, chi danh phan do.
CREATE INDEX orders_tms_idx ON orders (tms_status) WHERE tms_status IS NOT NULL;
CREATE INDEX orders_service_child_idx ON orders (service_child_id);
CREATE INDEX orders_route_idx    ON orders (origin_province, destination_province);
-- jsonb_path_ops: chi phuc vu @> - dung cai bo loc theo truong rieng can, index nho hon.
CREATE INDEX orders_service_data_idx ON orders USING gin (service_data jsonb_path_ops);

-- Sinh ma don. Tien to lay tu ma TMS cua don (EXPORT_FCL -> E_FCL), hoac ma
-- dich vu cha neu don khong co ma TMS (BRK). Phan viet tat nam o TypeScript
-- (src/modules/orders/ma-don.helper.ts) de test duoc bang jest; o day chi con
-- phan phai chay trong transaction: dem so va ghep chuoi.
--
-- Khoa theo (tien to, ngay) nen 2 sale tao don cung loai cung luc khong trung
-- so; khoa tu nha khi transaction ket thuc. Rollback khong lam nhay so.
CREATE FUNCTION next_daily_no(p_prefix text, p_day date DEFAULT current_date)
RETURNS int LANGUAGE plpgsql AS $fn$
DECLARE v_no int;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_prefix || '|' || p_day::text));
  SELECT COALESCE(max(daily_no), 0) + 1 INTO v_no
    FROM orders WHERE code_prefix = p_prefix AND order_day = p_day;
  RETURN v_no;
END $fn$;

-- lpad CAT CUT chuoi dai hon length: lpad('1000',3,'0') = '100'. Khong co nhanh
-- CASE thi don thu 1000 trong ngay se sinh ma trung don thu 100.
CREATE FUNCTION order_code(p_prefix text, p_sep text, p_day date, p_no int)
RETURNS text LANGUAGE sql IMMUTABLE AS $fn$
  SELECT p_prefix || p_sep || to_char(p_day, 'YYYYMMDD') || p_sep ||
         CASE WHEN p_no < 1000 THEN lpad(p_no::text, 3, '0') ELSE p_no::text END;
$fn$;

-- =====================================================================
-- Phan con lai cua schema (phan phoi + bao gia, moc tien do, trao doi /
-- thong bao / nhat ky) nam o db/schema-flow.sql. Tach doi thuan tuy vi do dai
-- file; hai file la MOT schema, luon chay lien tiep va theo dung thu tu:
--   psql ... -f db/schema.sql
--   psql ... -f db/schema-flow.sql
-- =====================================================================

-- Ma tran phan quyen theo TRANG menu (migration 032). Ba muc: none / view /
-- full. Co y KHONG co "phong minh": pham vi du lieu tinh tu phong ban cua tung
-- nguoi chu khong tu vai tro. Thieu dong = coi nhu khong co quyen.
CREATE TABLE role_page_permissions (
  role       text NOT NULL,
  page_key   text NOT NULL,
  level      text NOT NULL,
  updated_by int REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role, page_key),
  CONSTRAINT role_page_permissions_role_ck
    CHECK (role IN ('admin','leader','manager','sale','staff','partner','dispatcher')),
  CONSTRAINT role_page_permissions_level_ck
    CHECK (level IN ('none','view','edit','full'))
);

-- Cau hinh sua duoc tu man quan tri (migration 037). Co y nho va chung: mot
-- khoa, mot gia tri. Dung ngay cho dieu khoan ky dien tu — dat trong CMS thi
-- sai cho, vi CMS quan ly noi dung trang gioi thieu.
CREATE TABLE app_settings (
  key        text PRIMARY KEY,
  value      text NOT NULL,
  updated_by int REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Dieu khoan ky soan theo TUNG DIEU (migration 053). Luc gui khach ky, cac
-- dieu dang bat duoc ghep lai theo sort_order thanh mot van ban.
--
-- KHONG danh phien ban: moi chu ky da chup lai toan van dieu khoan tai thoi
-- diem ky (order_signatures.dieu_khoan), nen sua hom nay khong lam sai nhung
-- chu ky da thu hom qua.
CREATE TABLE terms_clauses (
  id         serial PRIMARY KEY,
  title      text NOT NULL,
  body       text NOT NULL,
  sort_order int  NOT NULL DEFAULT 0,
  -- Tat chu KHONG xoa khi muon ngung dung mot dieu: xoa la mat ban nhap da
  -- soan ky, con chu ky cu van giu toan van rieng nen khong anh huong gi.
  is_active  boolean NOT NULL DEFAULT true,
  updated_by int REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX terms_clauses_thu_tu_idx ON terms_clauses (sort_order, id);
-- Khoa dang dung (migration 037, 039):
--   dieu_khoan_ky      - dieu khoan van chuyen khach ky vao, in tu Dieu 3 tro di
--   cong_ty_*          - phap nhan Ben A tren hop dong: ten, dia chi, mst,
--                        dien thoai, email, dai dien, chuc vu. MST va nguoi dai
--                        dien de trong cho nguoi dung dien — dat bua len hop
--                        dong la lam gia giay to.


-- Logo doi tac tren landing (migration 073). image_url: '/img/logos/...' (co
-- san trong landing) hoac URL S3 (tai len tu CMS). ratio = rong/cao phan noi
-- dung, de landing chia kich thuoc theo dien tich.
CREATE TABLE partner_logos (
  id          serial PRIMARY KEY,
  group_key   varchar(20) NOT NULL CHECK (group_key IN ('customer', 'membership')),
  name        text NOT NULL CHECK (btrim(name) <> ''),
  image_url   text NOT NULL,
  ratio       numeric(6,3) NOT NULL CHECK (ratio > 0),
  sort_order  int NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX partner_logos_group_idx ON partner_logos (group_key, sort_order, id);
