-- 056 - Sale them duoc dia chi moi vao master data.
--
-- VAN DE. Man chon tuyen di hai buoc: chon tinh, roi chon dia chi TRONG tinh
-- do, hoac dien mot dia chi moi neu chua co. Ve "hoac dien mot dia chi moi"
-- khong chay duoc voi chinh nguoi dung no nhieu nhat: ma tran cho `sale` bac
-- `view` tren trang priceLocations, ma `view` thi chan POST.
--
-- Hau qua truoc 056: Sale nhan don cho mot KCN chua co trong danh muc thi tac
-- hoan toan - khong tu them duoc, phai di nho Admin hoac Pricing. Ma don thi
-- dang can nhap ngay.
--
-- `edit` chu KHONG phai `full`: bac edit cho POST/PATCH di qua va chan DELETE.
-- Sale them va sua duoc dia chi, nhung khong xoa duoc dia chi ma don hang va
-- bang gia cua nguoi khac dang tro vao.
--
-- An toan hon truoc: tu 055, khoa chong trung da chuan hoa that (gop dau cham
-- voi dau phay, xet ca tinh) va tang ung dung hoi bang chinh ham khoa do. Mo
-- quyen them cho Sale khi chua co 055 moi la mo cua cho danh muc rac.
--
-- Idempotent.

BEGIN;

SET lock_timeout = '3s';

UPDATE role_page_permissions
   SET level = 'edit', updated_at = now()
 WHERE page_key = 'priceLocations'
   AND role = 'sale'
   AND level IS DISTINCT FROM 'edit';

COMMIT;

-- Kiem chung:
--   SELECT role, level FROM role_page_permissions
--    WHERE page_key = 'priceLocations' ORDER BY role;
