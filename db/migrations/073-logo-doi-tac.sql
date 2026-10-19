-- 073 - Logo doi tac tren landing: quan ly duoc trong CMS.
--
-- Truoc migration nay 51 logo (34 khach hang, 17 hiep hoi) nam cung trong ma
-- nguon landing; them, bot hay tat mot logo la phai sua code va deploy.
--
-- image_url: duong dan TUONG DOI '/img/logos/...' cho logo co san trong
-- landing, hoac URL S3 cho logo tai len tu CMS. Lop ung dung chi nhan hai
-- dang do — mot URL tuy y la mot cach cai anh cua nguoi la len trang chu.
--
-- ratio = rong/cao cua phan NOI DUNG logo. Landing can no de chia kich thuoc
-- theo DIEN TICH (logo dai thap xuong, logo vuong cao len) thay vi cung chieu
-- cao. CMS do bang trinh duyet luc tai anh len.
--
-- Nap san 51 logo dang hien, dung thu tu va ti le hien tai.
--
-- Idempotent: tao bang IF NOT EXISTS; nap san chi khi bang con rong.

BEGIN;

SET lock_timeout = '3s';

CREATE TABLE IF NOT EXISTS partner_logos (
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

CREATE INDEX IF NOT EXISTS partner_logos_group_idx ON partner_logos (group_key, sort_order, id);

COMMENT ON TABLE partner_logos IS
  'Logo hai dai doi tac tren trang chu landing (khach hang / hiep hoi). Quan ly o CMS.';

INSERT INTO partner_logos (group_key, name, image_url, ratio, sort_order)
SELECT v.group_key, v.name, v.image_url, v.ratio, v.sort_order
FROM (VALUES
  ('customer', 'KONE', '/img/logos/customers/01-kone.svg', 2.59, 10),
  ('customer', 'Unilever', '/img/logos/customers/04-unilever.svg', 0.91, 20),
  ('customer', 'Wiha', '/img/logos/customers/05-wiha.webp', 3.52, 30),
  ('customer', 'GL Tech Gloveland', '/img/logos/customers/06-gl-tech-gloveland.webp', 2.44, 40),
  ('customer', 'UNOPS', '/img/logos/customers/07-unops.svg', 6.84, 50),
  ('customer', 'Tekcom', '/img/logos/customers/08-tekcom.webp', 5.75, 60),
  ('customer', 'IKO', '/img/logos/customers/10-iko.webp', 2.97, 70),
  ('customer', 'Comin Asia', '/img/logos/customers/11-comin-asia.svg', 3.85, 80),
  ('customer', 'Yazaki', '/img/logos/customers/13-yazaki.webp', 7.23, 90),
  ('customer', 'Nipro', '/img/logos/customers/14-nipro.svg', 3.85, 100),
  ('customer', 'Austrong', '/img/logos/customers/17-austrong.webp', 4.5, 110),
  ('customer', 'Vietnam Airlines', '/img/logos/customers/18-vietnam-airlines.svg', 2.71, 120),
  ('customer', 'Garco 10', '/img/logos/customers/19-garco10-may10.webp', 1.97, 130),
  ('customer', 'Vinatex', '/img/logos/customers/20-vinatex.webp', 1.3, 140),
  ('customer', 'LS-VINA Cable', '/img/logos/customers/21-ls-vina-cable.webp', 7.54, 150),
  ('customer', 'Vinaconex', '/img/logos/customers/22-vinaconex-vector.svg', 1.89, 160),
  ('customer', 'Daisen Sangyo', '/img/logos/customers/23-daisen-sangyo.webp', 5.56, 170),
  ('customer', 'Goertek', '/img/logos/customers/24-goertek.webp', 4.57, 180),
  ('customer', 'Corteva', '/img/logos/customers/26-corteva-ex-dupont-pioneer.webp', 5.06, 190),
  ('customer', 'Kumho Tire', '/img/logos/customers/27-kumho-tire.webp', 3.8, 200),
  ('customer', 'Autel', '/img/logos/customers/28-autel.webp', 6.12, 210),
  ('customer', 'Fujikura Composites', '/img/logos/customers/31-fujikura-composites.svg', 1.35, 220),
  ('customer', 'SL Corporation', '/img/logos/customers/34-sl-corporation.webp', 2.27, 230),
  ('customer', 'Yageo Group', '/img/logos/customers/35-yageo-group.webp', 5.02, 240),
  ('customer', 'Amtran', '/img/logos/customers/37-amtran.webp', 6.78, 250),
  ('customer', 'VinFast', '/img/logos/customers/38-vinfast.webp', 5.11, 260),
  ('customer', 'Idemitsu', '/img/logos/customers/40-idemitsu.webp', 4.92, 270),
  ('customer', 'Tai Yuen Textile', '/img/logos/customers/41-tai-yuen-textile.webp', 3.98, 280),
  ('customer', 'Greenworks', '/img/logos/customers/43-greenworks.svg', 4.86, 290),
  ('customer', 'Canadian Solar', '/img/logos/customers/44-canadian-solar.webp', 6.52, 300),
  ('customer', 'Wolong', '/img/logos/customers/45-wolong.webp', 3.58, 310),
  ('customer', 'Kansai Felt', '/img/logos/customers/46-kansai-felt.webp', 8.88, 320),
  ('customer', 'LG Display', '/img/logos/customers/47-lg-display.webp', 4.97, 330),
  ('customer', 'Pioneer', '/img/logos/customers/48-pioneer.svg', 6.78, 340),
  ('membership', 'FIATA', '/img/logos/membership/01-fiata.webp', 1.02, 10),
  ('membership', 'IATA', '/img/logos/membership/02-iata.svg', 1.6, 20),
  ('membership', 'WCA World', '/img/logos/membership/03-wca-world.webp', 1.98, 30),
  ('membership', 'WCA Pharma', '/img/logos/membership/04-wca-pharma.webp', 1.77, 40),
  ('membership', 'WCA Projects', '/img/logos/membership/05-wca-projects.webp', 1.72, 50),
  ('membership', 'GLA Global Logistics Alliance', '/img/logos/membership/06-gla-global-logistics-alliance.webp', 2.91, 60),
  ('membership', 'TALA', '/img/logos/membership/07-tala.webp', 3.67, 70),
  ('membership', 'Global Air Cargo Alliance', '/img/logos/membership/08-global-air-cargo-alliance.webp', 4.42, 80),
  ('membership', 'JCtrans', '/img/logos/membership/09-jctrans-trang.webp', 4.17, 90),
  ('membership', 'Project Cargo Network', '/img/logos/membership/10-project-cargo-network.webp', 2.32, 100),
  ('membership', 'GPLN', '/img/logos/membership/11-gpln.webp', 4.35, 110),
  ('membership', 'EAA Network', '/img/logos/membership/12-eaa-network.webp', 2.19, 120),
  ('membership', 'Neptune Forwarding', '/img/logos/membership/13-neptune-forwarding.webp', 4.52, 130),
  ('membership', 'VCCI', '/img/logos/membership/14-vcci.webp', 2.95, 140),
  ('membership', 'VLA', '/img/logos/membership/15-vla.svg', 1.0, 150),
  ('membership', 'Pangea', '/img/logos/membership/16-pangea.svg', 3.02, 160),
  ('membership', 'Millennium Logistics Network', '/img/logos/membership/17-millennium-logistics-network.webp', 3.53, 170)
) AS v(group_key, name, image_url, ratio, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM partner_logos);

COMMIT;
