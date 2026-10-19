-- BeeOps - Schema PostgreSQL, phan 2/2. Chay SAU db/schema.sql (cac bang duoi day
-- tham chieu khoa ngoai toi orders, departments, users da tao o phan 1).
--   psql -d beeops -v ON_ERROR_STOP=1 -f db/schema-flow.sql

-- =====================================================================
-- 3. PHAN PHOI + BAO GIA  (F2 + F3 gop chung mot bang)
-- =====================================================================

-- Moi phong duoc phan phoi don = 1 dong; bao gia hien tai nam ngay tren dong do.
-- Khong tach bang quotes: 1 phong chi co 1 bao gia dang hieu luc, cac ban cu
-- day xuong quote_history nen man hinh so sanh cua sale chi can 1 query.
CREATE TABLE order_departments (
  order_id      int NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  department_id int    NOT NULL REFERENCES departments(id),
  state text NOT NULL DEFAULT 'pending' CHECK (state IN (
    'pending','claimed','quoted','passed','won','lost')),
  assignee_id int REFERENCES users(id),             -- nhan vien duoc gan / tu nhan
  pass_reason text,                                 -- ly do phong bo qua
  is_manual   boolean NOT NULL DEFAULT false,       -- Admin them ngoai cau hinh

  -- Bao gia hien tai (F3)
  amount        numeric(15,0) CHECK (amount > 0),   -- gia tri don hang (VND)
  scope_note    text,                               -- bao gom / khong bao gom
  lead_time     text,                               -- thoi gian thuc hien du kien
  valid_until   date,
  quote_version int NOT NULL DEFAULT 0,             -- 0 = chua bao gia
  -- Cac ban cu: [{"version":1,"amount":..,"scope_note":..,"by":1,"at":".."}]
  quote_history jsonb NOT NULL DEFAULT '[]',

  -- Do thoi gian phan hoi cho dashboard F6 va canh bao SLA
  distributed_at timestamptz NOT NULL DEFAULT now(),
  claimed_at      timestamptz,
  first_quoted_at timestamptz,                      -- moc SLA bao gia
  last_quoted_at  timestamptz,                      -- lan cap nhat gia gan nhat
  PRIMARY KEY (order_id, department_id)
);
CREATE INDEX order_departments_queue_idx ON order_departments (department_id, state);
-- "Viec cua toi" va thong ke khoi luong theo nhan vien deu loc theo assignee_id.
CREATE INDEX order_departments_assignee_idx
  ON order_departments (assignee_id) WHERE assignee_id IS NOT NULL;

-- =====================================================================
-- 4. THUC HIEN  (F5 - moc tien do)
-- =====================================================================

-- Copy tu services.milestones ngay khi CHOT don -> don da chot giu bo moc cu
CREATE TABLE order_milestones (
  id       serial PRIMARY KEY,
  order_id int NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  seq      int  NOT NULL,
  name     text NOT NULL,
  status   text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done','skipped')),
  note     text,
  files    jsonb NOT NULL DEFAULT '[]',             -- bien ban, anh POD
  done_by  int REFERENCES users(id),
  done_at  timestamptz,
  UNIQUE (order_id, seq)
);

-- =====================================================================
-- 4b. TAI KHOAN KHACH HANG  (cong khach bee-transportation-web)
-- =====================================================================
-- Tach hoan toan khoi bang users (nhan vien noi bo): khac role model, khac
-- cookie, khac vong doi. Hai bang co id chay doc lap nen id trung nhau day dac
-- -- xem chu thich cot notifications.customer_id ben duoi.
--
-- Bon bang nay truoc day chi nam o db/migrations/011 va 014, khong co trong
-- schema goc. Hau qua: nap tu dau theo README cho ra mot DB khong co bang khach
-- nao, va CI cung vay. Dua vao day de hai file schema lai la toan bo schema.

CREATE TABLE customer_accounts (
  id                serial PRIMARY KEY,
  email             citext UNIQUE NOT NULL,
  phone             text,
  full_name         text NOT NULL DEFAULT '',
  -- PIN 6 so bcrypt hash. Co the NULL neu khach chi dang ky qua OAuth va chua
  -- dat PIN -- truong hop do chi login duoc bang provider tuong ung.
  pin_hash          text,
  -- URL cong khai anh dai dien tren S3. NULL = chua dat anh, app ve chu cai dau
  -- cua ten. Chi luu URL do server dung tu key da ky (xem 018).
  avatar_url        text,
  email_verified_at timestamptz,
  is_active         boolean NOT NULL DEFAULT true,
  -- Loai thong bao khach tu tat push. Doi xung voi users.email_off.
  push_off          text[] NOT NULL DEFAULT '{}',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Lien ket provider (Google/Apple/Email) -> 1 customer, cho phep 1 customer co
-- nhieu provider. UK (provider, provider_user_id) dam bao mot tai khoan
-- Google/Apple chi gan duoc vao dung mot customer.
CREATE TABLE customer_identities (
  id               serial PRIMARY KEY,
  customer_id      int NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
  provider         text NOT NULL CHECK (provider IN ('google','apple','email')),
  provider_user_id text NOT NULL,
  provider_email   text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_identities_uk UNIQUE (provider, provider_user_id)
);
CREATE INDEX customer_identities_cust_idx ON customer_identities(customer_id);

-- OTP mot lan: ghi vao roi verify + xoa, khong dung lam lich su.
CREATE TABLE customer_otps (
  id          serial PRIMARY KEY,
  email       citext NOT NULL,
  code_hash   text NOT NULL,                       -- bcrypt cua ma 6 so
  purpose     text NOT NULL
              CHECK (purpose IN ('register','login','reset_pin','change_email',
                                 'sign_order','register_partner')),
  attempts    int NOT NULL DEFAULT 0,
  expires_at  timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX customer_otps_email_idx ON customer_otps(email, purpose, created_at DESC);

-- Thiet bi nhan push cua khach.
-- UNIQUE tren token MOT MINH, co y khong phai (customer_id, fcm_token): mot
-- token = mot ban cai app tren mot may. Khach A logout roi khach B login tren
-- cung may thi FCM tra ve dung token cu; unique theo cap se de DB co 2 dong va
-- may do nhan push cua ca hai nguoi -- ro du lieu giua hai khach.
CREATE TABLE customer_devices (
  id           serial PRIMARY KEY,
  customer_id  int NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
  fcm_token    text NOT NULL,
  platform     text NOT NULL CHECK (platform IN ('web','android','ios')),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_devices_token_uk UNIQUE (fcm_token)
);
CREATE INDEX customer_devices_cust_idx ON customer_devices(customer_id);

-- =====================================================================
-- 5. TRAO DOI, THONG BAO, NHAT KY  (F8 + minh bach)
-- =====================================================================

-- Thao luan tren don, tach luong theo phong (department_id NULL = luong chung).
-- kind='revision_request' chinh la yeu cau sale gui phong dieu chinh gia.
CREATE TABLE comments (
  id            serial PRIMARY KEY,
  order_id      int NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  department_id int    REFERENCES departments(id),
  user_id       int NOT NULL REFERENCES users(id),
  kind          text NOT NULL DEFAULT 'comment'
                CHECK (kind IN ('comment','revision_request')),
  body          text NOT NULL,
  mentions      int[] NOT NULL DEFAULT '{}',        -- user id duoc @mention
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX comments_order_idx ON comments (order_id, created_at);

-- Thiet bi nhan push cua NHAN VIEN. Bang rieng chu khong phai them user_id
-- nullable vao customer_devices: hai cot FK nullable tren cung mot bang buoc moi
-- truy van phai tu nho loc them ve "cot kia IS NULL" -- dung cai bay da phai va
-- o migration 016. UNIQUE tren token mot minh, cung ly do voi customer_devices:
-- mot token = mot ban cai app tren mot may, doi chu may thi phai doi chu token.
CREATE TABLE user_devices (
  id           serial PRIMARY KEY,
  user_id      int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fcm_token    text NOT NULL,
  platform     text NOT NULL CHECK (platform IN ('web','android','ios')),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_devices_token_uk UNIQUE (fcm_token)
);
CREATE INDEX user_devices_user_idx ON user_devices(user_id);

-- users.push_off nam trong `CREATE TABLE users` o db/schema.sql, canh email_off.

CREATE TABLE notifications (
  id         serial PRIMARY KEY,
  -- Chu so huu: DUNG MOT trong user_id / customer_id, hoac ca hai NULL khi la
  -- khach vang lai (luc do quote_request_id giu vai tro neo). Hai cot rieng chu
  -- KHONG phai mot cot + co is_customer: users.id va customer_accounts.id la hai
  -- sequence doc lap, deu bat dau tu 1, nen trung nhau day dac. Dung chung cot thi
  -- cron email JOIN users se gui thong bao cua khach id 5 toi nhan vien id 5.
  user_id     int REFERENCES users(id) ON DELETE CASCADE,
  customer_id int REFERENCES customer_accounts(id) ON DELETE CASCADE,
  -- Voi khach co tai khoan: ngu canh de FE deep-link. Voi khach vang lai: duong
  -- duy nhat tim ra FCM token (quote_requests.fcm_token).
  -- FK them bang ALTER o cuoi file: quote_requests duoc dinh nghia SAU bang
  -- nay, khai inline o day la tham chieu tien va psql se tu choi.
  quote_request_id int,
  order_id   int REFERENCES orders(id) ON DELETE CASCADE,
  type       text NOT NULL,                         -- new_order, quote_received, sla_late...
  title      text NOT NULL,
  body       text,
  is_read    boolean NOT NULL DEFAULT false,
  emailed_at timestamptz,                           -- NULL = chua gui SMTP
  pushed_at  timestamptz,                           -- NULL = cron push chua xu ly
  -- Chong nhac lap cho thong bao lap theo thoi gian (sla_late, quote_expired).
  -- Vi du: 'sla_late:<order_id>:<department_id>:<user_id>'.
  -- NULL voi thong bao thuong -> moi lan la mot su kien moi.
  dedupe_key text,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT notifications_owner_ck CHECK (
    num_nonnulls(user_id, customer_id) = 1
    OR (user_id IS NULL AND customer_id IS NULL AND quote_request_id IS NOT NULL)
  )
);
CREATE INDEX notifications_inbox_idx  ON notifications (user_id, is_read, created_at DESC);
-- Partial tren CA HAI cot: dong cua khach khong bao gio duoc gui email nen
-- emailed_at o null vinh vien; neu chi loc emailed_at thi chung nam lai trong
-- index mai mai va moi lan cron email quet phai di qua ca dong tien to do.
CREATE INDEX notifications_outbox_idx ON notifications (created_at)
  WHERE emailed_at IS NULL AND user_id IS NOT NULL;
CREATE UNIQUE INDEX notifications_dedupe_uk ON notifications (dedupe_key)
  WHERE dedupe_key IS NOT NULL;
CREATE INDEX notifications_cust_inbox_idx
  ON notifications (customer_id, is_read, created_at DESC);
-- Partial: cron push quet CA hai loai chu the (nhan vien va khach) tu migration
-- 019, nen vi tu chi con dung ve ma cau WHERE cua claim() that su co -- Postgres
-- chi dung duoc partial index khi vi tu SUY RA duoc tu WHERE, va `pushed_at IS
-- NULL` khong suy ra duoc `user_id IS NULL`. Index khong phinh: pushed_at duoc
-- dong dau ngay trong transaction claim nen tap dong thoa vi tu tu rut ve gan rong.
CREATE INDEX notifications_push_idx ON notifications (created_at)
  WHERE pushed_at IS NULL;

-- Vua la audit log quan tri, vua la dong thoi gian hoat dong cua don (F5)
CREATE TABLE activity_log (
  id        serial PRIMARY KEY,
  order_id  int REFERENCES orders(id) ON DELETE CASCADE,  -- NULL = viec quan tri
  entity    text NOT NULL,                          -- orders, users, departments...
  entity_id text NOT NULL,
  action    text NOT NULL,                          -- create, update, quote, close...
  actor_id  int REFERENCES users(id),
  detail    jsonb,                                  -- {"field": [cu, moi]}
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX activity_order_idx  ON activity_log (order_id, created_at DESC);
CREATE INDEX activity_entity_idx ON activity_log (entity, entity_id, created_at DESC);

-- Bai tin tuc, Admin CRUD tren BeeOps admin, phan da published landing lay ra.
-- Migration 010 them bang nay; ban giu o day de cai moi cung co.
CREATE TABLE IF NOT EXISTS news_articles (
  id                serial PRIMARY KEY,
  slug              text UNIQUE NOT NULL,
  title             text NOT NULL,
  excerpt           text,
  body              text NOT NULL DEFAULT '',
  cover_image_url   text,
  status            text NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','published','archived')),
  published_at      timestamptz,
  created_by        int REFERENCES users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS news_articles_public_idx
  ON news_articles (published_at DESC) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS news_articles_status_idx
  ON news_articles (status, updated_at DESC);

-- Lop phu noi dung landing cho CMS. Khong co dong = dung gia tri mac dinh
-- trong code cua landing. Migration 025 them bang nay; ban giu o day de cai
-- moi cung co.
CREATE TABLE IF NOT EXISTS landing_content (
  id          serial PRIMARY KEY,
  locale      text NOT NULL CHECK (locale IN ('vi-vn', 'en-us')),
  key_path    text NOT NULL,
  value       text NOT NULL,
  updated_by  int REFERENCES users(id) ON DELETE SET NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT landing_content_unique UNIQUE (locale, key_path)
);

-- Yeu cau bao gia cong khai. Khach nhap form ngoai landing gui len, Admin/Sale
-- duyet -> chuyen thanh order that. Migration 007 them bang nay; ban giu o day
-- de cai moi cung co.
CREATE TABLE IF NOT EXISTS quote_requests (
  id                     serial PRIMARY KEY,
  customer_name          text NOT NULL,
  phone                  text NOT NULL,
  email                  text,
  service_id             int REFERENCES services(id),
  origin_province        text,
  destination_province   text,
  note                   text,
  status                 text NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending','converted','rejected')),
  created_by             int REFERENCES users(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  reviewed_by            int REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at            timestamptz,
  converted_to_order_id  int REFERENCES orders(id) ON DELETE SET NULL,
  reject_reason          text,
  customer_id            int REFERENCES customer_accounts(id) ON DELETE SET NULL,
  -- Token FCM cua may khach VANG LAI (khong dang nhap). Khach co tai khoan thi
  -- token nam o customer_devices. Khong tao tai khoan tam: customer_accounts.email
  -- la UNIQUE NOT NULL nhung form bao gia cho phep bo trong email.
  fcm_token              text
);
CREATE INDEX IF NOT EXISTS quote_requests_status_idx
  ON quote_requests (status, created_at DESC);
-- Moi thong bao tang don hang deu tra nguoc tu order_id ve khach qua cot nay.
CREATE INDEX IF NOT EXISTS quote_requests_order_idx
  ON quote_requests (converted_to_order_id) WHERE converted_to_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS quote_requests_customer_idx
  ON quote_requests (customer_id, created_at DESC) WHERE customer_id IS NOT NULL;

-- notifications.quote_request_id khai o tren KHONG kem REFERENCES vi bang
-- notifications dung truoc quote_requests trong file nay. Gan FK o day, khi ca
-- hai bang da ton tai.
ALTER TABLE notifications
  ADD CONSTRAINT notifications_quote_request_fk
  FOREIGN KEY (quote_request_id) REFERENCES quote_requests(id) ON DELETE CASCADE;

-- =====================================================================
-- 6. REFRESH TOKEN  (B-01)
-- =====================================================================
-- Access token van 12h; refresh song 30 ngay va doi duoc access moi. Luu DB chu
-- khong ky them mot JWT dai han, vi JWT khong thu hoi duoc.
--
-- CHI LUU HASH (SHA-256) cua token, khong bao gio luu chuoi tho: ro DB ma co
-- token tho thi ke doc duoc mao danh moi phien dang mo.
--
-- HAI BANG tach roi, khong gop mot: users.id va customer_accounts.id la hai
-- khong gian id khac nhau (xem chu thich o notifications phia tren). Gop lai thi
-- phai mang hai cot khoa ngoai nullable, DB khong ep noi "dung mot trong hai".
-- Migration 017 them hai bang nay; ban giu o day de cai moi cung co.

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          serial PRIMARY KEY,
  user_id     int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  text NOT NULL,
  expires_at  timestamptz NOT NULL,
  -- Khac NULL = da thu hoi. Giu dong lai thay vi DELETE la dieu kien de nhan ra
  -- tai su dung: token da xoay vong ma xuat hien lan nua = co ban sao bi danh cap.
  revoked_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT refresh_tokens_hash_uk UNIQUE (token_hash)
);
CREATE INDEX IF NOT EXISTS refresh_tokens_user_idx ON refresh_tokens(user_id);

CREATE TABLE IF NOT EXISTS customer_refresh_tokens (
  id           serial PRIMARY KEY,
  customer_id  int NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
  token_hash   text NOT NULL,
  expires_at   timestamptz NOT NULL,
  revoked_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_refresh_tokens_hash_uk UNIQUE (token_hash)
);
CREATE INDEX IF NOT EXISTS customer_refresh_tokens_cust_idx
  ON customer_refresh_tokens(customer_id);

-- =====================================================================
-- BANG GIA TUYEN (migration 027)
--
-- locations      : MASTER DATA dia diem, dung chung cho diem di lan diem den.
-- price_units    : danh muc DON VI TINH gia (loai cont, tai trong xe, CBM...).
-- price_sessions : phien ban cua bang gia, chi mot phien 'active'.
-- route_prices   : (phien, diem di, diem den, DON VI TINH) -> gia. KHONG theo
--                  dich vu (059): cuoc mot chang la tien cua chang duong va
--                  loai xe, no khong doi vi don duoc xep vao dich vu nao.
--
-- Giai thich day du o db/migrations/027-bang-gia-tuyen.sql va
-- db/migrations/055-gia-tuyen-theo-don-vi-tinh.sql.
-- =====================================================================

CREATE TABLE IF NOT EXISTS locations (
  id         serial PRIMARY KEY,
  name       text NOT NULL,
  province   text,
  address    text,
  -- Id dia diem trong MASTER DATA cua OF1-TMS (051). Bee Logistics cap; NULL =
  -- chua xin duoc, va don di qua dia diem do khong day sang OF1 duoc.
  of1_id     int,
  -- Van phong phu trach (055). Suy ra tu VUNG cua dia chi, khong phai mot
  -- chieu cua gia: mot dia chi thuoc vung nao thi van phong vung do bao gia.
  office_code text,
  is_active  boolean NOT NULL DEFAULT true,
  created_by int REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- Khoa so sanh ten (055). lower(name) mot minh van lot trung: trong bang gia
-- that, cung mot KCN duoc go ca 'KCN CAO, HOA KHANH' lan 'KCN CAO. HOA KHANH'.
CREATE OR REPLACE FUNCTION loc_name_key(p_name text) RETURNS text
  LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT btrim(
           regexp_replace(
             upper(translate(p_name, '.', ',')),
             '[[:space:]]+', ' ', 'g'),
           ' ,.-');
$$;
-- Cung ten o hai tinh khac nhau la hai noi khac nhau, nen khoa gom ca tinh.
-- coalesce vi province cho phep NULL, ma NULL trong unique index khong chan gi.
CREATE UNIQUE INDEX IF NOT EXISTS locations_name_province_uk
  ON locations (loc_name_key(name), coalesce(province, ''));
-- Hai dia diem BeeOps khong duoc cung tro vao mot kho ben OF1: trung thi don
-- cua dia diem nay di vao kho cua dia diem kia ma khong ai biet.

-- Don vi tinh gia. Them mot loai xe moi la them MOT DONG o day, khong phai
-- mot migration. `kind` theo luat Bee: loai nao la DC thi FCL, loai nao tinh
-- theo tan thi LCL - hang khong (tu san bay ve) cung LCL, vi do la van chuyen
-- duong bo mot dau o san bay chu khong phai dich vu hang khong.
CREATE TABLE IF NOT EXISTS price_units (
  code       text PRIMARY KEY,
  label      text NOT NULL,
  kind       text NOT NULL,
  sort_order int  NOT NULL DEFAULT 0,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT price_units_kind_ck CHECK (kind IN ('FCL', 'LCL'))
);

CREATE TABLE IF NOT EXISTS price_sessions (
  id             serial PRIMARY KEY,
  name           text NOT NULL,
  effective_from date NOT NULL,
  status         text NOT NULL DEFAULT 'draft',
  note           text,
  created_by     int REFERENCES users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  activated_by   int REFERENCES users(id) ON DELETE SET NULL,
  activated_at   timestamptz,
  CONSTRAINT price_sessions_status_ck
    CHECK (status IN ('draft', 'active', 'archived'))
);
CREATE UNIQUE INDEX IF NOT EXISTS price_sessions_one_active_uk
  ON price_sessions ((status)) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS route_prices (
  id             serial PRIMARY KEY,
  session_id     int NOT NULL REFERENCES price_sessions(id) ON DELETE CASCADE,
  origin_id      int NOT NULL REFERENCES locations(id),
  destination_id int NOT NULL REFERENCES locations(id),
  -- Chieu thu tu (055). Mot tuyen co 6-11 muc gia tuy loai xe/don vi tinh;
  -- mot cot `price` cho ca tuyen la mat 7/8 so lieu.
  unit_code      text NOT NULL REFERENCES price_units(code),
  price          numeric(15, 0) NOT NULL,
  note           text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT route_prices_khac_nhau_ck CHECK (origin_id <> destination_id),
  CONSTRAINT route_prices_duong_ck CHECK (price >= 0)
);
-- Don hang tro toi dia diem dau tuyen, de tra duoc gia niem yet (migration 028).
-- Ca hai NULL duoc: don cu, don tu form cong khai, va don giao tan noi deu
-- khong co kho nao ca.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS origin_location_id      int REFERENCES locations(id),
  ADD COLUMN IF NOT EXISTS destination_location_id int REFERENCES locations(id);
CREATE INDEX IF NOT EXISTS orders_location_route_idx
  ON orders (origin_location_id, destination_location_id)
  WHERE origin_location_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS route_prices_uk
  ON route_prices (session_id, origin_id, destination_id, unit_code);
CREATE INDEX IF NOT EXISTS route_prices_session_idx ON route_prices (session_id);

-- =====================================================================
-- KHU VUC + TUYEN THEO DICH VU (migration 061)
--
-- price_regions       : khu vuc cua bang gia - Bac, Trung, Nam... admin sua.
-- locations.region_id : khu vuc cua MOT DIA DIEM. Day la nguon su that duy
--                       nhat cua khu vuc; khu vuc cua mot tuyen suy ra tu dia
--                       diem NHAN chu khong luu tren tuyen, de man "Dia diem"
--                       va man "Khu vuc va tuyen" khong bao gio lech nhau.
-- region_routes       : mot CAP dia diem, THUOC MOT PHIEN GIA (063).
-- region_route_prices : (tuyen, FCL/LCL, DON VI TINH) -> gia mot chieu /
--                       hai chieu. Km nam o region_routes (062).
--
-- Khac route_prices o tren: bang do la (phien, cap dia diem, don vi tinh) ->
-- MOT con so, va van dang chay cho gia tham khao tren man don hang.
--
-- Giai thich day du o db/migrations/061-khu-vuc-va-tuyen.sql.
-- =====================================================================

CREATE TABLE IF NOT EXISTS price_regions (
  id         serial PRIMARY KEY,
  name       text NOT NULL,
  -- Truong phong phu trach (066). Chi nguoi nay xem duoc bang gia cua khu vuc;
  -- Quan tri va Giam doc thay het. NULL = chua giao cho ai.
  manager_id int REFERENCES users(id) ON DELETE SET NULL,
  sort_order int  NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS price_regions_name_uk
  ON price_regions (lower(btrim(name)));
CREATE INDEX IF NOT EXISTS price_regions_manager_idx
  ON price_regions (manager_id) WHERE manager_id IS NOT NULL;

-- ON DELETE SET NULL: xoa khu vuc KHONG duoc xoa dia diem - dia diem con nam
-- trong bang gia cu va trong don hang cu.
ALTER TABLE locations
  ADD COLUMN IF NOT EXISTS region_id int REFERENCES price_regions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS locations_region_idx
  ON locations (region_id) WHERE region_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS region_routes (
  id             serial PRIMARY KEY,
  -- Mot phien la mot BAN CHUP day du cua bang gia (063), dung nhu route_prices:
  -- hai phien co the co cung mot cap dia diem voi gia khac nhau.
  session_id     int NOT NULL REFERENCES price_sessions(id) ON DELETE CASCADE,
  origin_id      int NOT NULL REFERENCES locations(id),
  destination_id int NOT NULL REFERENCES locations(id),
  -- Quang duong HAI CHIEU, km (062). Thuoc TUYEN chu khong thuoc tung muc gia:
  -- doan duong khong doi theo viec cho bang xe 1.4T hay container 20DC.
  round_trip_km  int,
  created_by     int REFERENCES users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT region_routes_khac_nhau_ck CHECK (origin_id <> destination_id),
  CONSTRAINT region_routes_km_ck CHECK (round_trip_km IS NULL OR round_trip_km >= 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS region_routes_uk
  ON region_routes (session_id, origin_id, destination_id);
CREATE INDEX IF NOT EXISTS region_routes_dest_idx ON region_routes (destination_id);
CREATE INDEX IF NOT EXISTS region_routes_session_idx ON region_routes (session_id);

CREATE TABLE IF NOT EXISTS region_route_prices (
  id               serial PRIMARY KEY,
  route_id         int NOT NULL REFERENCES region_routes(id) ON DELETE CASCADE,
  -- FCL = nguyen container, LCL = hang le (065). Bang gia that chia dung hai
  -- khoi nay; mot tuyen cho mot cai 20DC thi gia nhu nhau, bat ke don duoc xep
  -- vao dich vu con nao.
  kind             text NOT NULL,
  -- Don vi tinh (062): dung chung danh muc price_units voi bang gia cu, vi
  -- bang gia that co ca bac tai theo tan lan loai container ('20DC', '40DC').
  unit_code        text NOT NULL REFERENCES price_units(code),
  one_way_price    numeric(15, 0),
  round_trip_price numeric(15, 0),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT region_route_prices_kind_ck CHECK (kind IN ('FCL', 'LCL')),
  CONSTRAINT region_route_prices_duong_ck
    CHECK (coalesce(one_way_price, 0) >= 0 AND coalesce(round_trip_price, 0) >= 0),
  -- Hai gia deu cho phep NULL nhung khong duoc cung NULL: tuyen chi chay mot
  -- chieu la that, con mot dong khong co gia nao thi khong phai mot muc gia.
  CONSTRAINT region_route_prices_co_gia_ck
    CHECK (one_way_price IS NOT NULL OR round_trip_price IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS region_route_prices_uk
  ON region_route_prices (route_id, kind, unit_code);

-- =====================================================================
-- Da bo so voi ban 18 bang (chuc nang van giu nguyen):
--   order_seq             -> pg_advisory_xact_lock + orders.daily_no
--   department_services   -> departments.service_ids int[]
--   service_milestones    -> services.milestones text[]
--   quotes                -> gop vao order_departments (+ quote_history jsonb)
--   quote_revision_requests -> comments.kind = 'revision_request'
--   attachments           -> orders.files / order_milestones.files jsonb
--   reject_reasons        -> orders.reject_reason text (danh sach co dinh o app)
--   notification_prefs    -> users.email_off text[]
--   settings              -> cau hinh o app (che do bao gia mo la giai doan 2)
--   sessions              -> cookie ky (signed cookie), khong luu DB
-- =====================================================================


-- ---------------------------------------------------------------------------
-- Ky dien tu phieu xac nhan don (migration 036).
--
-- NAM O schema-flow.sql chu khong phai schema.sql, du day la bang cua luong
-- don hang: no tham chieu customer_accounts, ma bang do dinh nghia trong chinh
-- file nay. De ben kia thi nap schema.sql mot minh se chet ngay o dong FK —
-- da do that, va vi CI nap bang psql -v ON_ERROR_STOP=1 nen ca buoc nap schema
-- hong theo.
-- ---------------------------------------------------------------------------

-- Khach ky dien tu phieu xac nhan don (migration 036). Chot mot ban PDF len S3
-- va luu ma bam cua chinh file do: khong co ma bam thi khong chung minh duoc
-- "ban khach ky chinh la ban dang luu". KHONG phai chu ky so — cot `loai` chua
-- san cho 'chu_ky_so' sau nay.
CREATE TABLE order_signatures (
  id         serial PRIMARY KEY,
  order_id   int  NOT NULL REFERENCES orders(id) ON DELETE CASCADE,

  loai       text NOT NULL DEFAULT 'dien_tu'
             CHECK (loai IN ('dien_tu','chu_ky_so')),
  trang_thai text NOT NULL DEFAULT 'cho_ky'
             CHECK (trang_thai IN ('cho_ky','da_ky','tu_choi','het_han')),

  token_hash   text NOT NULL UNIQUE,
  het_han_luc  timestamptz NOT NULL,

  pdf_key     text NOT NULL,
  pdf_sha256  text NOT NULL,
  pdf_ky_key  text,
  anh_ky_key  text,

  dieu_khoan  text NOT NULL,

  ky_luc        timestamptz,
  ky_ip         text,
  ky_user_agent text,
  ky_ten        text,
  otp_email     text,
  otp_dung_luc  timestamptz,
  customer_account_id int REFERENCES customer_accounts(id) ON DELETE SET NULL,

  ly_do_tu_choi text,

  created_by int REFERENCES users(id),        -- NULL = don khach tu gui, chua Sale nhan (075)
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT order_signatures_da_ky_du_ck CHECK (
    trang_thai <> 'da_ky'
    OR (ky_luc IS NOT NULL AND anh_ky_key IS NOT NULL AND pdf_ky_key IS NOT NULL)
  ),
  CONSTRAINT order_signatures_tu_choi_ck CHECK (
    trang_thai <> 'tu_choi' OR ly_do_tu_choi IS NOT NULL
  )
);

CREATE INDEX order_signatures_order_idx ON order_signatures (order_id, trang_thai);

-- MOT yeu cau dang cho moi don: hai link cung song thi ky cai nao cung duoc,
-- va khong ai biet ban nao la that.
CREATE UNIQUE INDEX order_signatures_mot_cho_ky_uk
  ON order_signatures (order_id) WHERE trang_thai = 'cho_ky';
