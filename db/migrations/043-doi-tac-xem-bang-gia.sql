-- 043 - Doi tac (Bee Logistics) xem duoc bang gia niem yet, de ho di bao gia
-- cho khach cua ho.
--
-- Chi muc XEM: moi duong ghi deu bi quyetDinh() chan theo phuong thuc HTTP.
--
-- Rieng PHIEN GIA NHAP thi khong du: 042 chi quyet dinh ho vao duoc TRANG nao,
-- con trong trang thi `?sessionId=` doc duoc phien bat ky — ke ca phien draft,
-- tuc gia ky sau chua cong bo. Cho do chan o tang ung dung, xem
-- src/modules/pricing/phien-cho-doi-tac.helper.ts.

BEGIN;
SET lock_timeout = '3s';

INSERT INTO role_page_permissions (role, page_key, level)
VALUES ('partner', 'priceList', 'view')
ON CONFLICT (role, page_key) DO UPDATE SET level = 'view';

COMMIT;
