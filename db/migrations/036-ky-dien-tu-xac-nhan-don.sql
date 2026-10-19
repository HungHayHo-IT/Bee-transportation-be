-- 036: khach ky dien tu phieu xac nhan don hang.
--
-- Sale bam "Gui cho khach ky" -> he thong CHOT mot ban PDF len S3 va luu ma bam
-- SHA-256 cua chinh file do. Khach mo link trong email, nhap OTP gui toi email,
-- ve chu ky, bam xac nhan. He thong chen chu ky vao PDF va dong don.
--
-- VI SAO LUU MA BAM: khong co no thi khong chung minh duoc "ban khach ky chinh
-- la ban dang luu" — va do la diem bi van dau tien trong moi tranh chap. Phieu
-- xac nhan hien duoc SINH LAI moi lan tai, nen neu khong chot mot ban vat ly
-- thi moi lan ai do sua don la noi dung phieu doi theo, ke ca sau khi khach da
-- ky. Luc do chu ky khong chung minh duoc gi.
--
-- VI SAO LUU token_hash CHU KHONG LUU MA GOC: ai doc duoc co so du lieu cung
-- khong ky thay khach duoc — cung mot ly do voi mat khau.
--
-- DAY KHONG PHAI CHU KY SO. No la bang chung thoa thuan: khach da xem va dong
-- y, luc nao, tu dau. Cot `loai` chua san cho 'chu_ky_so' sau nay, de khong
-- phai lam lai tu dau khi can ky hop dong hay hoa don dien tu.
--
-- Idempotent.

BEGIN;

SET lock_timeout = '3s';

CREATE TABLE IF NOT EXISTS order_signatures (
  id         serial PRIMARY KEY,
  order_id   int  NOT NULL REFERENCES orders(id) ON DELETE CASCADE,

  loai       text NOT NULL DEFAULT 'dien_tu'
             CHECK (loai IN ('dien_tu','chu_ky_so')),
  trang_thai text NOT NULL DEFAULT 'cho_ky'
             CHECK (trang_thai IN ('cho_ky','da_ky','tu_choi','het_han')),

  -- Ma mot lan. Luu dang bam, khong luu ma goc.
  token_hash   text NOT NULL UNIQUE,
  het_han_luc  timestamptz NOT NULL,

  -- Ban PDF da CHOT tai thoi diem gui, va ma bam cua chinh file do.
  pdf_key     text NOT NULL,
  pdf_sha256  text NOT NULL,
  -- Ban sau khi chen chu ky. NULL khi chua ky.
  pdf_ky_key  text,
  anh_ky_key  text,

  -- Toan van dieu khoan tai thoi diem ky. Doi dieu khoan hom nay khong lam sai
  -- nhung chu ky da thu hom qua.
  dieu_khoan  text NOT NULL,

  -- Dau vet luc ky.
  ky_luc        timestamptz,
  ky_ip         text,
  ky_user_agent text,
  ky_ten        text,
  -- Email da nhan OTP va luc nhap dung ma. Day moi la thu tra loi duoc cau
  -- "khong phai toi ky" — nguoi ky phai mo duoc hop thu cua chinh ho.
  otp_email     text,
  otp_dung_luc  timestamptz,
  customer_account_id int REFERENCES customer_accounts(id) ON DELETE SET NULL,

  ly_do_tu_choi text,

  created_by int NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Da ky thi phai co du dau vet. Mot dong 'da_ky' ma thieu thoi diem hay thieu
  -- file la mot dong khong chung minh duoc gi, va ep o tang du lieu thi khong
  -- duong code nao lam ra duoc no.
  CONSTRAINT order_signatures_da_ky_du_ck CHECK (
    trang_thai <> 'da_ky'
    OR (ky_luc IS NOT NULL AND anh_ky_key IS NOT NULL AND pdf_ky_key IS NOT NULL)
  ),
  -- Tu choi thi phai co ly do: sale can biet vi sao de con thuong luong tiep.
  CONSTRAINT order_signatures_tu_choi_ck CHECK (
    trang_thai <> 'tu_choi' OR ly_do_tu_choi IS NOT NULL
  )
);

COMMENT ON TABLE order_signatures IS
  'Yeu cau khach ky xac nhan don. Moi lan gui la mot dong, ke ca khi khach chua ky.';

-- Tra nhanh "don nay dang co yeu cau ky nao cho khong".
CREATE INDEX IF NOT EXISTS order_signatures_order_idx
  ON order_signatures (order_id, trang_thai);

-- MOT yeu cau dang cho moi don. Gui hai lan ma khong huy cai cu thi khach co
-- hai link cung song, ky cai nao cung duoc, va khong ai biet ban nao la that.
CREATE UNIQUE INDEX IF NOT EXISTS order_signatures_mot_cho_ky_uk
  ON order_signatures (order_id) WHERE trang_thai = 'cho_ky';

-- Trang moi trong ma tran phan quyen. KHONG gac bang o 'orderDetail': tren
-- production o do dang la toan quyen cho ca Pricing, nen gac kieu do se lot
-- them mot vai khong ai dinh cho.
INSERT INTO role_page_permissions (role, page_key, level) VALUES
  ('admin','orderSignature','full'),
  ('leader','orderSignature','none'),
  ('manager','orderSignature','full'),
  ('sale','orderSignature','full'),
  ('staff','orderSignature','none')
ON CONFLICT (role, page_key) DO NOTHING;

COMMIT;
