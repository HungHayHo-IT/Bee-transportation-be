-- 078 - Gia Sale chot voi khach cho don tu landing (16/10/2026).
--
-- Don khach tu gui (source = 'website'): phong ban bao gia xong, Sale thoa
-- thuan rieng voi khach roi nhap gia chot cuoi. Gia nay la gia khach thay,
-- gia in hop dong va doanh thu khi chot. NULL = Sale chua nhap.
-- Khong thap hon gia phong thang — kiem o tang ung dung (phu thuoc dong khac).

BEGIN;
SET lock_timeout = '3s';

ALTER TABLE orders ADD COLUMN IF NOT EXISTS sale_price numeric(15,0)
  CONSTRAINT orders_sale_price_ck CHECK (sale_price > 0);

COMMIT;
