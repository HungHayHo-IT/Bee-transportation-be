-- 064 - Gia da nhap theo luat CU chuyen sang luat moi: con so la gia MOT CHIEU.
--
-- Truoc 07/10 toi doc mot cot gia trong file Excel la "gia hai chieu". Luat
-- that cua Bee nguoc lai: bang gia ghi MOT con so cho moi loai xe va do la
-- cuoc MOT CHIEU, chieu ve tinh them 50%.
--
-- Nen moi dong da nhap deu nam sai o: so tien o `round_trip_price`, con
-- `one_way_price` trong. Dong nay chuyen chung sang dung cho va tinh lai gia
-- hai chieu — ket qua giong het nhap lai chinh file do bang ban moi.
--
-- CHI dong nao co dau hieu cua luat cu: co gia hai chieu MA KHONG co gia mot
-- chieu. Dong da co ca hai la nguoi dung tu khai, khong dung toi.
--
-- Idempotent: chay xong thi one_way_price khong con NULL o nhung dong do nua,
-- nen lan hai khong khop dong nao.

BEGIN;

SET lock_timeout = '3s';

UPDATE region_route_prices
   SET one_way_price   = round_trip_price,
       round_trip_price = round(round_trip_price * 1.5),
       updated_at      = now()
 WHERE one_way_price IS NULL
   AND round_trip_price IS NOT NULL;

COMMIT;

-- Kiem chung:
--   SELECT count(*) FILTER (WHERE one_way_price IS NULL) AS thieu_mot_chieu,
--          count(*) FILTER (WHERE round_trip_price <> round(one_way_price * 1.5)) AS khac_he_so,
--          count(*) AS tong
--     FROM region_route_prices;
