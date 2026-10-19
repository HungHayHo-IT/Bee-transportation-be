-- 071 - O "So House Bill" va "Ma booking" cho cac dich vu co day sang OF1.
--
-- Contract OF1-TMS v1.3 muc 5.3 co `hblNo` va `bookingCode`. Payload khai hai
-- khoa ay tu dau nhung KHONG BAO GIO dien, vi BeeOps khong co cho nao luu —
-- doc ma nguon se tuong la co.
--
-- KHONG them cot vao bang orders. Co san co che "truong rieng theo dich vu"
-- (service_fields + orders.service_data): form don tu ve o nhap, man chi tiet
-- tu hien, bo xuat Excel tu co cot. Them cot cung la them mot o nhap cho MOI
-- dich vu, ke ca tu van va cho thue thiet bi — noi so vo don khong ton tai.
--
-- Chi gan cho 4 dich vu co dich vu con mang ma TMS. Dich vu khac khong day
-- sang OF1 nen hai o nay chi lam ban form.
--
-- `is_required = false`: nhieu don chua co so bill luc tao. Bat buoc la chan
-- dung cho dang can mo.
--
-- Idempotent: chay lai khong them ban sao (chi muc unique theo tang chung).

BEGIN;

SET lock_timeout = '3s';

INSERT INTO service_fields (service_id, field_key, label, field_type, sort_order, help_text)
SELECT s.id, v.field_key, v.label, 'text', v.sort_order, v.help_text
  FROM (VALUES
    ('hbl_no',       'Số House Bill', 910,
     'Gui sang OF1-TMS o truong hblNo. De trong neu chua co.'),
    ('booking_code', 'Mã booking',    911,
     'Gui sang OF1-TMS o truong bookingCode. De trong neu chua co.')
  ) AS v(field_key, label, sort_order, help_text)
  CROSS JOIN (
    -- Dich vu CO dich vu con mang ma TMS — dung nguon la chinh du lieu, khong
    -- viet cung danh sach id: them dich vu moi thi chay lai la co ngay.
    SELECT DISTINCT c.service_id AS id FROM service_children c WHERE c.tms_mode IS NOT NULL
  ) AS s
 WHERE NOT EXISTS (
   SELECT 1 FROM service_fields f
    WHERE f.service_id = s.id AND f.field_key = v.field_key AND f.service_child_id IS NULL
 );

COMMIT;

-- Kiem chung — moi dich vu co ma TMS deu co du hai o:
--   SELECT count(*) FROM (
--     SELECT DISTINCT service_id FROM service_children WHERE tms_mode IS NOT NULL
--   ) s WHERE (SELECT count(*) FROM service_fields f
--               WHERE f.service_id = s.service_id
--                 AND f.field_key IN ('hbl_no','booking_code')) <> 2;
