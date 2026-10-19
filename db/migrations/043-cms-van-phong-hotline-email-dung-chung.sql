-- 042 - Danh sach van phong, hotline va email chung DUNG CHUNG hai ngon ngu.
--
-- Truoc day CMS luu cac o nay rieng cho tung ngon ngu: so va email rieng cua
-- chi nhanh nhap o ban tieng Viet thi ban tieng Anh khong co. Dia chi khong co
-- ban tieng Anh, so va email la mot, nen tu nay moi lan luu la ghi cho ca hai
-- (xem localesFor o src/modules/cms/content-locale.helper.ts).
--
-- Dong bo du lieu da luu: ban tieng Viet la goc va ghi de ban tieng Anh; o nao
-- chi co ban tieng Anh thi chep sang tieng Viet. Chay lai nhieu lan van ra
-- cung mot ket qua.

BEGIN;
SET lock_timeout = '3s';

INSERT INTO landing_content (locale, key_path, value, updated_by, updated_at)
SELECT 'en-us', key_path, value, updated_by, now()
FROM landing_content
WHERE locale = 'vi-vn'
  AND (key_path = 'site.offices' OR key_path LIKE 'site.offices.%'
       OR key_path IN ('site.phoneNumber', 'site.email'))
ON CONFLICT (locale, key_path) DO UPDATE
  SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now();

INSERT INTO landing_content (locale, key_path, value, updated_by, updated_at)
SELECT 'vi-vn', key_path, value, updated_by, now()
FROM landing_content en
WHERE locale = 'en-us'
  AND (key_path = 'site.offices' OR key_path LIKE 'site.offices.%'
       OR key_path IN ('site.phoneNumber', 'site.email'))
  AND NOT EXISTS (
    SELECT 1 FROM landing_content vi WHERE vi.locale = 'vi-vn' AND vi.key_path = en.key_path
  );

COMMIT;
