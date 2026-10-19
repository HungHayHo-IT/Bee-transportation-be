-- 052 - Bo luong duyet ho so khach hang, va chia lai quyen trang khach hang.
--
-- 1. BO DUYET. Tao ho so la dung duoc ngay. Truoc day ho so do vai 'staff'
--    (Pricing) tao phai cho nguoi khac duyet; bo buoc do thi khong con ai sinh
--    ra dong 'pending' nua.
--
--    Moi dong 'pending' va 'rejected' chuyen thanh 'approved'. KHONG de lai:
--    khong con man duyet thi chung mac ket vinh vien, va luc tao don chung
--    khong hien trong o chon khach (chonDuocKhiTaoDon chi nhan 'approved').
--
--    GIU cot status va rang buoc CHECK: cau truy van loc status='approved' nam
--    o nhieu cho, bo cot la phai sua het trong mot luot. Cot o lai voi mot gia
--    tri duy nhat thi khong ai phai sua gi.
--
-- 2. CHIA LAI QUYEN. Bac 'edit' da co san trong ma tran (cho POST/PUT/PATCH,
--    chan DELETE) nhung chua dung o trang nao - dung dung o day:
--
--      admin    full   tao / sua / xoa
--      manager  full   tao / sua / xoa
--      sale     edit   tao / sua          <- doi tu 'full'
--      leader   view   chi xem
--      staff    view   chi xem

BEGIN;
SET lock_timeout = '3s';

UPDATE customers SET status = 'approved' WHERE status <> 'approved';

UPDATE role_page_permissions SET level = 'edit'
 WHERE role = 'sale' AND page_key IN ('customers', 'customerDetail')
   AND level IS DISTINCT FROM 'edit';

COMMIT;
