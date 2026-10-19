-- 025: kho noi dung landing page cho CMS.
--
-- Mo hinh LOP PHU, khong phai kho noi dung day du. Toan bo chu nghia cua
-- landing van nam trong code (lib/i18n/dictionaries/{vi,en}.ts, khoang 690 o
-- moi ngon ngu) va do la gia tri MAC DINH. Bang nay chi giu nhung o da bi sua.
--
-- Ba thu doi duoc nho cach nay:
--
-- * API chet thi landing van chay. Khong lay duoc lop phu thi no dung ban
--   trong code, khong trang trang. Bung het 690 chuoi vao DB thi mat ket noi
--   la mat noi dung.
-- * "Khoi phuc mac dinh" chi la XOA dong, khong phai nho lai chuoi goc la gi.
-- * Khong phai dong bo hai chieu moi lan lap trinh vien sua chu trong code.
--
-- value NOT NULL co chu y: mot dong ton tai nghia la "o nay da bi ghi de".
-- Ghi de bang chuoi rong van la mot lua chon hop le (an mot dong chu), nen
-- rong khac voi khong co dong nao.
--
-- Anh dung chung bang nay: key_path dang 'images.<ten-o>', value la URL S3.
-- Tach bang rieng cho anh chi de them mot cho phai join ma khong duoc gi.
--
-- Idempotent.

BEGIN;

SET lock_timeout = '3s';

CREATE TABLE IF NOT EXISTS landing_content (
  id          serial PRIMARY KEY,
  -- Hai ngon ngu sua doc lap: sua tieng Viet khong dung toi ban tieng Anh, va
  -- quen dich thi ban tieng Anh van la ban trong code chu khong phai chuoi Viet.
  locale      text NOT NULL CHECK (locale IN ('vi-vn', 'en-us')),
  -- Duong dan tham chieu toi o trong tu dien, vi du 'hero.title' hay
  -- 'services.items.domestic.problems.0.name'. Chi so mang la mot doan so.
  key_path    text NOT NULL,
  value       text NOT NULL,
  updated_by  int REFERENCES users(id) ON DELETE SET NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT landing_content_unique UNIQUE (locale, key_path)
);

-- Endpoint cong khai luon doc theo mot ngon ngu va lay HET lop phu cua ngon
-- ngu do trong mot lan. Rang buoc UNIQUE o tren da tao index (locale, key_path)
-- nen truy van do dung duoc tien to trai, khong can them index.

COMMENT ON TABLE landing_content IS
  'Lop phu noi dung landing. Khong co dong = dung gia tri mac dinh trong code.';

COMMIT;
