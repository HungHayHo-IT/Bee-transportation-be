-- 031: dich vu tu them, hien tren landing.
--
-- VAN DE: chin dich vu tren landing nam trong code cua landing, con danh muc
-- dich vu cua BeeOps nam o bang nay. Them mot dich vu moi vi the phai sua code
-- va deploy lai landing — nguoi ban hang khong tu lam duoc.
--
-- CACH GIAI: dich vu moi la MOT DONG THAT o bang services, nen bao gia, dinh
-- tuyen phong ban va mo ta don deu chay nhu moi dich vu khac. Bon cot duoi day
-- chi noi them "dong nay con hien tren landing, o duong dan nao".
--
-- Vi sao khong lam mot bang rieng cho landing: hai bang la hai duong ghi cho
-- cung mot dich vu, va mot ngay nao do hai duong do noi hai thu khac nhau —
-- khach chon "Dich vu X" o form bao gia trong khi trang gioi thieu da doi ten.
--
-- Chu nghia cua trang (gioi thieu, van de, cach lam, FAQ...) KHONG nam o day:
-- no la noi dung da ngon ngu, thuoc ve lop phu CMS (bang landing_content), y
-- het chin dich vu cu. O day chi co dinh danh va duong dan.
--
-- landing_key la khoa on dinh ma landing dung de tra noi dung trong lop phu.
-- Doi ten hay doi slug thi khoa nay GIU NGUYEN, neu khong moi o noi dung da
-- go deu mo coi.
--
-- Idempotent.

BEGIN;

SET lock_timeout = '3s';

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS landing_key      text,
  ADD COLUMN IF NOT EXISTS landing_slug_vi  text,
  ADD COLUMN IF NOT EXISTS landing_slug_en  text,
  ADD COLUMN IF NOT EXISTS show_on_landing  boolean NOT NULL DEFAULT false;

-- Partial unique: chin dich vu cu khong co landing_key (NULL), va NULL khong
-- dung vao nhau. Chi cac dong that su len landing moi phai khac nhau.
CREATE UNIQUE INDEX IF NOT EXISTS services_landing_key_uk
  ON services (landing_key) WHERE landing_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS services_landing_slug_vi_uk
  ON services (landing_slug_vi) WHERE landing_slug_vi IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS services_landing_slug_en_uk
  ON services (landing_slug_en) WHERE landing_slug_en IS NOT NULL;

-- Len landing thi phai co du khoa va hai duong dan. Thieu mot cai la landing
-- dung mot trang khong co dia chi, hoac mot dia chi khong co noi dung.
ALTER TABLE services DROP CONSTRAINT IF EXISTS services_landing_du_ck;
ALTER TABLE services ADD CONSTRAINT services_landing_du_ck CHECK (
  show_on_landing = false
  OR (landing_key IS NOT NULL AND landing_slug_vi IS NOT NULL AND landing_slug_en IS NOT NULL)
);

COMMENT ON COLUMN services.landing_key IS
  'Khoa on dinh landing dung de tra noi dung trong lop phu CMS. NULL = dich vu nay khong do landing quan.';

COMMIT;
