-- 067 - Gop khoang trang trong ten dia diem.
--
-- O Excel cua bang gia hay xuong dong giua ten — "KCN DIEN NAM DIEN\n NGOC" —
-- va cai xuong dong do di thang vao danh muc roi hien ra giua man hinh.
--
-- Ham khoa cua CSDL (`loc_name_key`) von da gop moi khoang trang khi SO SANH,
-- nen viec nay khong the de ra trung moi: hai ten gop lai bang nhau thi da
-- dung nhau o chi so unique tu truoc.
--
-- Idempotent: chay xong khong con ten nao con khoang trang kep.

BEGIN;

SET lock_timeout = '3s';

UPDATE locations
   SET name = btrim(regexp_replace(name, '[[:space:]]+', ' ', 'g')),
       updated_at = now()
 WHERE name <> btrim(regexp_replace(name, '[[:space:]]+', ' ', 'g'));

COMMIT;

-- Kiem chung:
--   SELECT count(*) FROM locations
--    WHERE name <> btrim(regexp_replace(name, '[[:space:]]+', ' ', 'g'));
