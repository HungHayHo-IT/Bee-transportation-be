-- 023: rut vong doi don tu MUOI MOT trang thai xuong BAY.
--
-- Bon trang thai bo di va ly do:
--
-- * 'in_progress' + 'completed' — hai cai nay do viec tick moc tien do TU dong
--   day, khong ai bam tay. Moc tien do van chay y nguyen va van ghi
--   completed_at khi tick het; chi la khong doi trang thai don nua. Theo doi
--   tien do giao hang la viec cua tab Tien do, khong phai cua trang thai don.
--
-- * 'rejected' — gop vao 'cancelled'. Ly do khach che gia chuyen sang
--   cancel_reason de khong mat.
--
-- * 'awaiting_customer' — gop vao 'awaiting_selection', nhan doi thanh
--   "Cho chot gia". Truoc day tach doi "du bao gia, cho sale chon" va "sale
--   chon roi, cho khach gat"; thuc te hai buoc dinh lien nhau.
--
-- GIU khoa 'awaiting_selection' chu khong dat khoa moi: app mobile doc thang
-- orders.status, moi gia tri moi la mot lan phai sua ben do. Nhan doi nhung
-- khoa thi khong.
--
-- Doi du lieu TRUOC roi moi siet rang buoc: lam nguoc lai thi lenh ALTER se
-- truot ngay tren chinh nhung hang dang can chuyen.

BEGIN;

SET lock_timeout = '3s';

-- Don dang chay hoac da xong deu ve 'closed': chot la chot, khong con tang nao
-- sau nua. Gia tri tien va closed_at giu nguyen, completed_at cung vay.
UPDATE orders SET status = 'closed'
 WHERE status IN ('in_progress', 'completed');

-- Khach che gia -> huy. Chi lap cancel_reason khi no dang trong, KHONG de len
-- ly do huy da co: mot don co ca hai cot thi cot huy moi la cai nguoi dung vua
-- nhap, de len la xoa mat.
UPDATE orders
   SET status = 'cancelled',
       cancel_reason = coalesce(nullif(btrim(cancel_reason), ''), reject_reason)
 WHERE status = 'rejected';

UPDATE orders SET status = 'awaiting_selection'
 WHERE status = 'awaiting_customer';

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;

ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (status IN (
  'awaiting_info',
  'new',
  'distributed',
  'quoting',
  'awaiting_selection',
  'closed',
  'cancelled'
));

COMMENT ON COLUMN orders.status IS
  'Bay trang thai, ket thuc o closed. awaiting_selection = "Cho chot gia" (gom ca cho sale chon lan cho khach xac nhan)';

COMMIT;
