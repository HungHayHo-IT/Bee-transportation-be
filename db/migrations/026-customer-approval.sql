-- 026: khach hang cho phe duyet, them ma so thue va giay phep kinh doanh.
--
-- MOT BANG, MOT COT TRANG THAI — khong lam bang cho rieng.
--
-- "Duyet xong moi luu vao ban ghi" doc ra thi giong hai bang: mot bang cho,
-- mot bang chinh. Khong lam vay, vi ba ly do:
--
-- * Don hang tro toi customer_id. Khach nam o bang cho thi hoac don khong tro
--   duoc, hoac phai doi id luc duyet — doi khoa chinh la moi lien ket cu tro
--   sai cho, va kieu hong do khong bao loi.
-- * Lich su bien mat. Khach bi tu choi thi khong con dau vet ai da tao, ai da
--   tu choi, vi sao — trong khi day chinh la thu can tra lai.
-- * Hai bang la hai duong ghi cho cung mot loai du lieu. Moi truy van ve khach
--   hang tu nay phai nho hop ca hai, va cho nao quen la mot lo hong lang le.
--
-- Cot `status` giai quyet ca ba: don van tro toi mot hang duy nhat tu luc tao,
-- lich su nam nguyen tai cho, va bo loc la mot dieu kien WHERE.
--
-- Khach CU (da co truoc migration nay) duoc dat thang 'approved': ho da di
-- vao don hang that roi, bat ho cho duyet la khoa lai viec dang chay.
--
-- Idempotent.

BEGIN;

SET lock_timeout = '3s';

ALTER TABLE customers
  -- pending | approved | rejected
  ADD COLUMN IF NOT EXISTS status          text NOT NULL DEFAULT 'approved',
  -- Ma so thue va giay phep kinh doanh: KHONG bat buoc. Khach le va khach tu
  -- form website khong co hai thu nay, ep NOT NULL la chan luon duong do.
  ADD COLUMN IF NOT EXISTS tax_code        text,
  ADD COLUMN IF NOT EXISTS business_licence text,
  ADD COLUMN IF NOT EXISTS created_by      int REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_by     int REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at     timestamptz,
  -- Ly do tu choi. Tu choi ma khong noi vi sao thi nguoi tao khong sua duoc gi.
  ADD COLUMN IF NOT EXISTS reject_reason   text;

-- Chan gia tri la o tang du lieu, khong chi o tang ung dung: mot lan ghi thang
-- vao DB voi status = 'Approved' (hoa chu) la bo loc im lang bo sot hang do.
ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_status_check;
ALTER TABLE customers
  ADD CONSTRAINT customers_status_check
  CHECK (status IN ('pending', 'approved', 'rejected'));

-- Man duyet loc theo status roi sap theo ngay tao. Khach dang cho la mot phan
-- rat nho cua bang, nen index mot phan: chi danh chi muc dung phan do.
CREATE INDEX IF NOT EXISTS customers_pending_idx
  ON customers (created_at DESC)
  WHERE status = 'pending';

COMMENT ON COLUMN customers.status IS
  'pending = cho duyet, chua duoc chon khi tao don. approved = dung duoc. rejected = bi tu choi.';

COMMIT;
